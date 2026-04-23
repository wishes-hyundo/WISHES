// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/backfill-embeddings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// listings.embedding 컬럼을 배치로 채우는 관리 엔드포인트.
//   - OpenAI text-embedding-3-small (384 dim) 사용
//   - 한 번 호출당 기본 100건 처리 (batchSize 파라미터로 조정)
//   - 이미 embedding 있는 행은 건너뜀 (멱등)
//   - 오래된 임베딩만 재생성하려면 ?staleDays=30 옵션
//
// Authorization: Bearer <WISHES_ADMIN_MASTER_PASSWORD env> (또는 Supabase JWT)
//
// 사용 예:
//   POST /api/admin/backfill-embeddings?batchSize=200
//   POST /api/admin/backfill-embeddings?force=1  (전체 재생성)

import { NextRequest, NextResponse } from 'next/server';
// L-sec155 (2026-04-23): OpenAI 유료 호출 + 대량 UPDATE 엔드포인트는
//   superadmin/master/crawler_bridge 만 허용. verifyAdminAuth 는 role=agent
//   JWT 까지 허용해 일반 중개사 계정이 OpenAI 비용 소진 + embedding 덮어쓰기 가능했음.
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

const ALLOWED_ROLES = new Set(['superadmin', 'master', 'crawler_bridge', 'internal_bearer']);
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 384;

/**
 * 매물 1건의 임베딩 소스 텍스트 빌더.
 * AI 검색에 유효한 시그널만 농축 (주소 전체는 배제 — dong 만).
 */
function buildEmbedSource(row: {
  ai_title?: string | null;
  title?: string | null;
  ai_description?: string | null;
  description?: string | null;
  type?: string | null;
  deal?: string | null;
  dong?: string | null;
  building_name?: string | null;
  area_pyeong?: number | null;
  rooms?: number | null;
  floor_current?: number | null;
  floor_total?: number | null;
  station_name?: string | null;
  station_distance?: number | null;
  features?: unknown;
  parking?: boolean | null;
  elevator?: boolean | null;
  full_option?: boolean | null;
  pet?: boolean | null;
  built_year?: number | null;
  direction?: string | null;
  business_type?: string | null;
}): string {
  const parts: string[] = [];
  if (row.dong) parts.push(row.dong);
  if (row.type) parts.push(row.type);
  if (row.deal) parts.push(row.deal);
  if (row.building_name) parts.push(row.building_name);
  if (row.rooms) parts.push(`${row.rooms}룸`);
  if (row.area_pyeong) parts.push(`${Math.round(row.area_pyeong)}평`);
  if (row.floor_current && row.floor_total)
    parts.push(`${row.floor_current}/${row.floor_total}층`);
  if (row.station_name)
    parts.push(
      row.station_distance
        ? `${row.station_name} 도보 ${row.station_distance}분`
        : row.station_name,
    );
  if (row.direction) parts.push(`${row.direction}향`);
  if (row.built_year) parts.push(`${row.built_year}년식`);
  if (row.parking) parts.push('주차가능');
  if (row.elevator) parts.push('엘리베이터');
  if (row.full_option) parts.push('풀옵션');
  if (row.pet) parts.push('반려동물');
  if (row.business_type) parts.push(row.business_type);
  if (Array.isArray(row.features)) parts.push((row.features as string[]).join(' '));
  const title = row.ai_title || row.title;
  const desc = row.ai_description || row.description;
  if (title) parts.push(String(title));
  if (desc) parts.push(String(desc).slice(0, 500));
  return parts.join(' · ').slice(0, 2000);
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][] | null> {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIM,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    console.error('[embeddings] OpenAI error', resp.status, err.slice(0, 400));
    return null;
  }
  const data = await resp.json();
  return (data?.data || []).map((d: { embedding: number[] }) => d.embedding);
}

export async function POST(request: NextRequest) {
  // L-sec84 (2026-04-22): OpenAI embedding 배치 호출 보호. 1h 3회/IP.
  const _ip = getClientIp(request);
  const _rl = checkRateLimit({ key: `backfill-embed:ip:${_ip}`, limit: 3, windowMs: 60 * 60_000 });
  if (!_rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
    );
  }
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY 미설정. Vercel 환경변수에 추가 필요.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(parseInt(searchParams.get('batchSize') || '100', 10), 500);
  const force = searchParams.get('force') === '1';
  const staleDays = parseInt(searchParams.get('staleDays') || '0', 10) || 0;

  try {
    const supabase = createServerClient();

    let q = supabase
      .from('listings')
      .select(
        'id, title, ai_title, description, ai_description, type, deal, dong, building_name, area_pyeong, rooms, floor_current, floor_total, station_name, station_distance, features, parking, elevator, full_option, pet, built_year, direction, business_type, embedding, embedding_generated_at',
      )
      .eq('status', '공개');

    if (!force && staleDays === 0) {
      q = q.is('embedding', null);
    } else if (staleDays > 0) {
      const since = new Date(Date.now() - staleDays * 86400_000).toISOString();
      q = q.or(`embedding.is.null,embedding_generated_at.lt.${since}`);
    }

    const { data: rows, error } = await q
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(batchSize);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        remaining_estimate: 0,
        message: 'No rows need embedding',
      });
    }

    // 텍스트 빌드
    const sources = rows.map((r: any) => buildEmbedSource(r));

    // OpenAI 는 1회 호출당 8192 토큰 입력 제한 있으나 384 dim 소형 모델은 여유.
    // 안전하게 100건/call 로 나눠서 실행.
    const CHUNK = 100;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = sources.slice(i, i + CHUNK);
      const slicedRows = rows.slice(i, i + CHUNK);
      const vectors = await embedBatch(slice, apiKey);
      if (!vectors) {
        errors.push(`chunk ${i}: OpenAI 실패`);
        continue;
      }
      // Supabase 에 업데이트 — 배열 → pgvector 텍스트 캐스팅 (Supabase v2 클라이언트가 자동 처리)
      for (let j = 0; j < slicedRows.length; j++) {
        const id = slicedRows[j].id;
        const v = vectors[j];
        if (!v || v.length !== EMBEDDING_DIM) continue;
        const { error: upErr } = await supabase
          .from('listings')
          .update({
            embedding: v,
            embedding_generated_at: new Date().toISOString(),
            embedding_source: EMBEDDING_MODEL,
          })
          .eq('id', id);
        if (upErr) {
          errors.push(`id=${id}: ${upErr.message}`);
        } else {
          updated++;
        }
      }
    }

    // 남은 건수 추정
    const { count: remaining } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', '공개')
      .is('embedding', null);

    return NextResponse.json({
      success: errors.length === 0,
      processed: updated,
      total_fetched: rows.length,
      remaining_estimate: remaining ?? null,
      errors: errors.slice(0, 20),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServerClient();
  const { count: total } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', '공개');
  const { count: withEmbed } = await supabase
    .from('listings')
    .select('id', { count: '