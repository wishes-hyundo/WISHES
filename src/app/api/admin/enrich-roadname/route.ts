// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/enrich-roadname
//
// 사장님 명령 (2026-04-29):
//   "메인 굵은건 구주소 바로 아래 얇은 글씨는 도로명 주소로 나와야 되는데
//    둘다 구주소로 나오고 있어"
//   "온하우스가 주소 표기나 건물명이나 층수 호수 까지 공실클럽 매물 처럼 깔끔하게
//    주소가 정리 안되서 업로드 되는데 이걸 좀 공실클럽 처럼 고쳐야 될것 같은데"
//
// 동작:
//   1) onhouse 매물 중 building_name 만 있고 address 짧은 38건
//      → kakao keyword search ("동 건물명") → 풀 지번주소 + 도로명주소 + 좌표
//      → DB UPDATE: address (확장), building_info += {도로명주소,지번주소}, lat/lng
//   2) 도로명주소(building_info->>'도로명주소') 비어있고 address 풀주소인 매물
//      → kakao address search (address) → road_address.address_name
//      → DB UPDATE: building_info += {도로명주소}
//
// 인증: 일회성 token (호출 완료 후 commit 으로 제거 예정)
// 한도: 카카오 REST API 일 30만 무료 → batchSize 100 안전
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY || '';
// 일회성 secret — 호출 후 즉시 제거 (다음 commit). git history 에 남으니 보안 약함을 인지하고 사용.
const ENRICH_TOKEN = 'wishes-enrich-2026-04-29-onetime-Y3b8H2mK';

interface ListingRow {
  id: number;
  source_site: string | null;
  address: string | null;
  dong: string | null;
  building_name: string | null;
  building_info: Record<string, unknown> | null;
}

async function kakaoKeywordSearch(query: string) {
  try {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { documents?: Array<Record<string, unknown>> };
    return (j.documents && j.documents[0]) || null;
  } catch { return null; }
}

async function kakaoAddressSearch(query: string) {
  try {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=1`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { documents?: Array<Record<string, unknown>> };
    return (j.documents && j.documents[0]) || null;
  } catch { return null; }
}

function pickRoadName(doc: Record<string, unknown>): string {
  // keyword.json 의 road_address_name (string) / address.json 의 road_address.address_name
  if (typeof doc.road_address_name === 'string' && doc.road_address_name.trim()) {
    return doc.road_address_name.trim();
  }
  const ra = doc.road_address as Record<string, unknown> | null | undefined;
  if (ra && typeof ra.address_name === 'string' && ra.address_name.trim()) {
    return ra.address_name.trim();
  }
  return '';
}

function pickJibunName(doc: Record<string, unknown>): string {
  if (typeof doc.address_name === 'string' && doc.address_name.trim()) {
    return doc.address_name.trim();
  }
  const a = doc.address as Record<string, unknown> | null | undefined;
  if (a && typeof a.address_name === 'string' && a.address_name.trim()) {
    return a.address_name.trim();
  }
  return '';
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('x-enrich-token') || '';
  if (token !== ENRICH_TOKEN) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!KAKAO_REST_KEY) {
    return NextResponse.json({ ok: false, error: 'KAKAO_REST_API_KEY 없음' }, { status: 500 });
  }
  const body = await request.json().catch(() => ({}));
  const mode = (body.mode as string) || 'onhouse-keyword';
  const batchSize = Math.min((body.batchSize as number) || 50, 100);

  const supabase = createServerClient();
  const results: unknown[] = [];
  let updated = 0;
  let failed = 0;

  if (mode === 'onhouse-keyword') {
    // 38건 패턴: 건물명만 있고 address 짧음
    const { data, error } = await supabase
      .from('listings')
      .select('id, source_site, address, dong, building_name, building_info')
      .eq('source_site', 'onhouse')
      .not('building_name', 'is', null)
      .limit(batchSize);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    for (const row of (data || []) as ListingRow[]) {
      const addr = (row.address || '').trim();
      // 이미 풀주소 (번지 포함) 면 skip
      if (addr.length >= 25 || /\s\d+(-\d+)?[,\s]/.test(addr)) {
        results.push({ id: row.id, status: 'skip-already-full', addr });
        continue;
      }
      const q = `${row.dong || ''} ${row.building_name || ''}`.trim();
      if (!q) { results.push({ id: row.id, status: 'skip-no-query' }); continue; }
      const doc = await kakaoKeywordSearch(q);
      if (!doc) {
        results.push({ id: row.id, status: 'no-match', q });
        failed++;
        await new Promise((r) => setTimeout(r, 80));
        continue;
      }
      const jibun = pickJibunName(doc);
      const road = pickRoadName(doc);
      const lat = parseFloat(String(doc.y || ''));
      const lng = parseFloat(String(doc.x || ''));
      const newBI = {
        ...(row.building_info || {}),
        ...(road ? { '도로명주소': road } : {}),
        ...(jibun ? { '지번주소': jibun } : {}),
      };
      const update: Record<string, unknown> = { building_info: newBI };
      if (jibun) update.address = jibun;
      if (!isNaN(lat) && !isNaN(lng)) { update.lat = lat; update.lng = lng; }
      const { error: ue } = await supabase.from('listings').update(update).eq('id', row.id);
      if (ue) {
        results.push({ id: row.id, status: 'update-error', error: ue.message });
        failed++;
      } else {
        results.push({ id: row.id, status: 'ok', q, jibun, road });
        updated++;
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  } else if (mode === 'roadname') {
    // 도로명주소 누락 + address 풀주소
    // 사장님 명령 (2026-04-29): cursor pagination 으로 매번 다른 매물 fetch.
    //   이전 버전은 항상 id desc top 400 fetch → 첫 batch 후엔 모두 enriched 라
    //   다음 호출이 0건 처리. lastId(=마지막 처리 id) cursor 로 진행.
    //   gu/dong filter 도 옵션 (사장님 화면 우선 백필용).
    const lastId = (body.lastId as number | undefined);
    const guFilter = (body.gu as string | undefined);
    const dongFilter = (body.dong as string | undefined);

    let q = supabase
      .from('listings')
      .select('id, address, building_info')
      .order('id', { ascending: false })
      .limit(batchSize * 5);
    if (typeof lastId === 'number' && lastId > 0) q = q.lt('id', lastId);
    if (guFilter) q = q.ilike('address', `%${guFilter}%`);
    if (dongFilter) q = q.ilike('address', `%${dongFilter}%`);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    let processed = 0;
    let cursorId: number | null = null;
    for (const row of (data || []) as ListingRow[]) {
      cursorId = row.id; // 마지막 본 id 추적 (skip 포함)
      if (processed >= batchSize) break;
      const addr = (row.address || '').trim();
      if (addr.length < 15) continue;
      const bi = (row.building_info as Record<string, unknown> | null) || {};
      const existing = (bi['도로명주소'] as string) || '';
      if (existing && existing.trim().length > 4) continue;
      processed++;
      const doc = await kakaoAddressSearch(addr);
      if (!doc) {
        results.push({ id: row.id, status: 'no-match', addr });
        failed++;
        await new Promise((r) => setTimeout(r, 80));
        continue;
      }
      const road = pickRoadName(doc);
      if (!road) {
        results.push({ id: row.id, status: 'no-roadname', addr });
        await new Promise((r) => setTimeout(r, 80));
        continue;
      }
      const newBI = { ...bi, '도로명주소': road };
      const lat = parseFloat(String(doc.y || ''));
      const lng = parseFloat(String(doc.x || ''));
      const update: Record<string, unknown> = { building_info: newBI };
      if (!isNaN(lat) && !isNaN(lng)) { update.lat = lat; update.lng = lng; }
      const { error: ue } = await supabase.from('listings').update(update).eq('id', row.id);
      if (ue) { results.push({ id: row.id, status: 'update-error', error: ue.message }); failed++; }
      else { results.push({ id: row.id, status: 'ok', addr, road }); updated++; }
      await new Promise((r) => setTimeout(r, 80));
    }
  } else {
    return NextResponse.json({ ok: false, error: 'unknown mode' }, { status: 400 });
  }

  // mode=roadname 일 때 cursorId 포함
  const respPayload: Record<string, unknown> = { ok: true, mode, batchSize, updated, failed, total: results.length, results };
  if (mode === 'roadname') {
    // cursorId 가 마지막으로 본 id (다음 호출 시 lastId 로 사용)
    // results 마지막 id 또는 fetched 마지막 id
    const lastSeen = (results as Array<Record<string, unknown>>).slice(-1)[0];
    if (lastSeen && typeof lastSeen.id === 'number') respPayload.nextLastId = lastSeen.id;
  }
  return NextResponse.json(respPayload);
}
