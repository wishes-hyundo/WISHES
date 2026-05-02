// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /api/cron/resolve-building-centroids (K-1, 사장님 명령 2026-05-02)
//
// 목적: TIER1 매물 (아파트/오피스텔/주상복합/도시형생활주택) 의 building_name 별
//      정확 단지 좌표를 카카오 Local Keyword API 로 조회 → building_centroids 저장.
//
// 동작:
//   1. listings 에서 TIER1 type + building_name NOT NULL 인 매물의 (building_name, dong) 추출
//   2. building_centroids 에 없거나 30일 이상 지난 단지만 재조회 (rate limit 보호)
//   3. 카카오 keyword.json 호출 (query = "동명 + 단지명")
//   4. 결과 좌표 저장 (source=kakao_local, match_score 계산)
//
// 호출: Vercel cron (vercel.json) 매주 1회 + manual trigger (admin)
// Auth: x-vercel-cron 헤더 또는 ?key=CRON_SECRET
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

// TIER1 = 단지 마커로 표시할 매물 type (사장님 명령 2026-05-02)
const TIER1_TYPES = new Set<string>([
  '아파트',
  '오피스텔',
  '주상복합',
  '도시형생활주택',
]);

// 30일 이내 재조회 skip — 카카오 API 할당 보호
const STALE_DAYS = 30;
const MAX_PER_RUN = 1500;  // 한 cron 실행 당 최대 단지 수 (카카오 무료 30K/day 한도 안전)
const REQUEST_DELAY_MS = 50;  // 단지 간 50ms 딜레이 (rate limit)

interface KakaoDocument {
  place_name: string;
  address_name: string;
  road_address_name: string;
  x: string;  // lng
  y: string;  // lat
  category_name: string;
}

async function searchKakao(query: string): Promise<KakaoDocument | null> {
  if (!KAKAO_REST_API_KEY) return null;
  try {
    const r = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`,
      {
        headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const docs: KakaoDocument[] = j?.documents ?? [];
    if (docs.length === 0) return null;
    // 우선순위: 아파트/오피스텔 카테고리 > 첫 결과
    const apartmentMatch = docs.find((d) => /아파트|오피스텔|주상복합/.test(d.category_name || ''));
    return apartmentMatch || docs[0];
  } catch {
    return null;
  }
}

function authorize(req: NextRequest): boolean {
  // Vercel cron 자동 호출 헤더
  if (req.headers.get('x-vercel-cron') === '1') return true;
  // Manual key 호출 (admin)
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (key && CRON_SECRET && key === CRON_SECRET) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!KAKAO_REST_API_KEY) {
    return NextResponse.json({ success: false, error: 'KAKAO_REST_API_KEY not set' }, { status: 500 });
  }

  const supabase = createServerClient();
  const startedAt = Date.now();

  // M-3 (사장님 명령 2026-05-02 — "병신같은 grid 방식 걍 나가뒤져"):
  //   TIER1 제한 풀고 모든 building_name 매물 단지 좌표 채움.
  //   격자 패턴 = 마스킹 좌표 사용 매물이 cell 중심에 모이는 결과.
  //   building_centroids 에 모든 단지 채우면 viewport API 가 정확 좌표 사용 → 격자 사라짐.
  const { data: listings, error: listErr } = await supabase
    .from('listings')
    .select('building_name, dong, type, lat, lng')
    .not('building_name', 'is', null)
    .eq('status', '공개')
    .limit(50000);

  if (listErr) {
    return NextResponse.json({ success: false, error: listErr.message }, { status: 500 });
  }

  // 유니크 (building_name, dong) — 빈 dong 은 null 로 통일
  const uniqMap = new Map<string, { building_name: string; dong: string | null; sample_lat: number | null; sample_lng: number | null }>();
  for (const l of listings ?? []) {
    const bn = String(l.building_name ?? '').trim();
    if (!bn) continue;
    const dong = (l.dong as string | null)?.trim() || null;
    const key = `${bn}|${dong ?? ''}`;
    if (!uniqMap.has(key)) {
      uniqMap.set(key, {
        building_name: bn,
        dong,
        sample_lat: typeof l.lat === 'number' ? l.lat : null,
        sample_lng: typeof l.lng === 'number' ? l.lng : null,
      });
    }
  }

  // 2) building_centroids 에 이미 신선한 (≤30일) 단지는 skip
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from('building_centroids')
    .select('building_name, dong, resolved_at');
  const freshSet = new Set<string>();
  for (const e of existing ?? []) {
    if (e.resolved_at && e.resolved_at >= cutoff) {
      freshSet.add(`${String(e.building_name).trim()}|${(e.dong as string | null)?.trim() ?? ''}`);
    }
  }

  const toResolve = Array.from(uniqMap.values())
    .filter((u) => !freshSet.has(`${u.building_name}|${u.dong ?? ''}`))
    .slice(0, MAX_PER_RUN);

  // 3) 카카오 검색 + DB upsert
  let resolved = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<{ building_name: string; dong: string | null; ok: boolean }> = [];

  for (const u of toResolve) {
    const query = u.dong ? `${u.dong} ${u.building_name}` : u.building_name;
    const doc = await searchKakao(query);

    if (doc) {
      const lat = parseFloat(doc.y);
      const lng = parseFloat(doc.x);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        // match_score: place_name 이 building_name 포함 → 90, 카테고리 매칭 → +10
        let score = 50;
        if ((doc.place_name || '').includes(u.building_name)) score += 40;
        if (/아파트|오피스텔|주상복합/.test(doc.category_name || '')) score += 10;
        const { error: upErr } = await supabase
          .from('building_centroids')
          .upsert(
            {
              building_name: u.building_name,
              dong: u.dong,
              lat,
              lng,
              source: 'kakao_local',
              kakao_query: query,
              match_score: Math.min(100, score),
              resolved_at: new Date().toISOString(),
            },
            { onConflict: 'building_name,dong' }
          );
        if (upErr) failed++;
        else { resolved++; results.push({ building_name: u.building_name, dong: u.dong, ok: true }); }
      } else {
        failed++;
      }
    } else {
      // 카카오 결과 없음 — 매물 좌표 평균을 fallback (source='averaged')
      if (u.sample_lat && u.sample_lng) {
        await supabase.from('building_centroids').upsert({
          building_name: u.building_name,
          dong: u.dong,
          lat: u.sample_lat,
          lng: u.sample_lng,
          source: 'averaged',
          kakao_query: query,
          match_score: 20,
          resolved_at: new Date().toISOString(),
        }, { onConflict: 'building_name,dong' });
        skipped++;
      } else {
        failed++;
      }
    }

    await new Promise((res) => setTimeout(res, REQUEST_DELAY_MS));
  }

  const elapsedMs = Date.now() - startedAt;
  return NextResponse.json({
    success: true,
    elapsedMs,
    totalUnique: uniqMap.size,
    fresh: freshSet.size,
    toResolve: toResolve.length,
    resolved,
    skipped,
    failed,
    samples: results.slice(0, 10),
  });
}
