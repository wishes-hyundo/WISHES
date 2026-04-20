// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/viewport — MAP 2026 뷰포트 쿼리
//
// Phase 1.0: mv_map_listings 기반 (기존 MV 재사용)
// Phase 1.1: rpc_listings_viewport (PostGIS + hero_score + median_deviation)
//            — MIGRATION_phase1.sql 적용 후 전환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { DealType, MapListing } from '@/features/map-2026/store';

// runtime 힌트 — Edge 전환은 supabase-js v2.43+ 확인 후
export const dynamic = 'force-dynamic';

// 뷰포트 크기 상한 (악성 전역 스캔 차단)
const MAX_VIEWPORT_DEG = 2.0;
const DEFAULT_LIMIT = 800;
const MAX_LIMIT = 3000;

function pInt(v: string | null): number | null {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function pFloat(v: string | null): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function pList(v: string | null): string[] | null {
  if (!v) return null;
  const arr = v.split(',').map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

/** 동·거래유형 기준 중앙값 vs 현재 가격 편차 계산 */
function computeMedianDeviation(
  listings: Array<{ dong: string | null; deal: string; price: number | null; deposit: number | null; monthly: number | null }>
) {
  // 그룹핑: dong + deal
  const groups = new Map<string, number[]>();
  for (const l of listings) {
    const price =
      l.deal === '매매' ? l.price ?? 0 :
      l.deal === '전세' ? l.deposit ?? 0 :
      (l.deposit ?? 0) + (l.monthly ?? 0) * 100;
    if (price <= 0) continue;
    const key = `${l.dong ?? '_'}|${l.deal}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(price);
  }
  const medians = new Map<string, number>();
  for (const [k, arr] of groups) {
    arr.sort((a, b) => a - b);
    medians.set(k, arr[Math.floor(arr.length / 2)]);
  }
  return (l: { dong: string | null; deal: string; price: number | null; deposit: number | null; monthly: number | null }) => {
    const key = `${l.dong ?? '_'}|${l.deal}`;
    const median = medians.get(key);
    if (!median) return { medianPrice: null, deviation: null };
    const price =
      l.deal === '매매' ? l.price ?? 0 :
      l.deal === '전세' ? l.deposit ?? 0 :
      (l.deposit ?? 0) + (l.monthly ?? 0) * 100;
    if (price <= 0) return { medianPrice: median, deviation: null };
    return { medianPrice: median, deviation: (price - median) / median };
  };
}

/** hero_score 0..100 — 가성비 + 신선도 + 사진 */
function computeHeroScore(deviation: number | null, photoCount: number, daysOld: number): number {
  let s = 50;
  if (deviation != null) {
    if (deviation <= -0.1) s += 25;
    else if (deviation <= -0.05) s += 15;
    else if (deviation >= 0.1) s -= 20;
  }
  if (photoCount >= 10) s += 15;
  else if (photoCount >= 5) s += 8;
  if (daysOld <= 3) s += 10;
  else if (daysOld <= 7) s += 5;
  else if (daysOld > 60) s -= 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const west = pFloat(searchParams.get('west'));
  const south = pFloat(searchParams.get('south'));
  const east = pFloat(searchParams.get('east'));
  const north = pFloat(searchParams.get('north'));

  if (west == null || south == null || east == null || north == null) {
    return NextResponse.json({ error: 'invalid bbox' }, { status: 400 });
  }
  if (east - west > MAX_VIEWPORT_DEG || north - south > MAX_VIEWPORT_DEG) {
    return NextResponse.json({ error: 'viewport too large' }, { status: 400 });
  }
  if (east < west || north < south) {
    return NextResponse.json({ error: 'invalid bbox order' }, { status: 400 });
  }

  const deals = pList(searchParams.get('deals')) as DealType[] | null;
  const types = pList(searchParams.get('types'));
  const rooms = pList(searchParams.get('rooms'))?.map((x) => parseInt(x, 10)).filter(Number.isFinite) ?? null;
  const features = pList(searchParams.get('features'));
  const minPrice = pInt(searchParams.get('minPrice'));
  const maxPrice = pInt(searchParams.get('maxPrice'));
  const minDeposit = pInt(searchParams.get('minDeposit'));
  const maxDeposit = pInt(searchParams.get('maxDeposit'));
  const minMonthly = pInt(searchParams.get('minMonthly'));
  const maxMonthly = pInt(searchParams.get('maxMonthly'));
  const minArea = pFloat(searchParams.get('minArea'));
  const maxArea = pFloat(searchParams.get('maxArea'));
  const nearStation = pInt(searchParams.get('nearStation')); // 초(sec)
  const newBuild = pInt(searchParams.get('newBuild'));
  const hasImages = searchParams.get('hasImages') === '1';
  const limit = Math.min(pInt(searchParams.get('limit')) ?? DEFAULT_LIMIT, MAX_LIMIT);

  try {
    const supabase = createServerClient();

    let q = supabase
      .from('mv_map_listings')
      .select(
        'id, title, type, deal, deposit, monthly, price, area_m2, rooms, floor_current, lat, lng, dong, status, created_at, updated_at, features, thumb_url, station_distance, built_year, building_name',
      )
      .gte('lat', south)
      .lte('lat', north)
      .gte('lng', west)
      .lte('lng', east)
      .eq('status', '공개');

    if (deals && deals.length) q = q.in('deal', deals);
    if (types && types.length) q = q.in('type', types);

    // 방 개수: [1,2,3] → rooms in, 단 3은 "3룸 이상"
    if (rooms && rooms.length) {
      const exactRooms = rooms.filter((n) => n < 3);
      const hasThreePlus = rooms.some((n) => n >= 3);
      if (exactRooms.length && hasThreePlus) {
        q = q.or(`rooms.in.(${exactRooms.join(',')}),rooms.gte.3`);
      } else if (exactRooms.length) {
        q = q.in('rooms', exactRooms);
      } else if (hasThreePlus) {
        q = q.gte('rooms', 3);
      }
    }

    // 거래유형별 가격 필터 — deal 을 정확히 매칭한 상태에서만 의미 있음
    if (deals && deals.length === 1) {
      const d = deals[0];
      if (d === '매매') {
        if (minPrice != null) q = q.gte('price', minPrice);
        if (maxPrice != null) q = q.lte('price', maxPrice);
      } else if (d === '전세') {
        if (minDeposit != null) q = q.gte('deposit', minDeposit);
        if (maxDeposit != null) q = q.lte('deposit', maxDeposit);
      } else {
        if (minDeposit != null) q = q.gte('deposit', minDeposit);
        if (maxDeposit != null) q = q.lte('deposit', maxDeposit);
        if (minMonthly != null) q = q.gte('monthly', minMonthly);
        if (maxMonthly != null) q = q.lte('monthly', maxMonthly);
      }
    }

    if (minArea != null) q = q.gte('area_m2', minArea);
    if (maxArea != null) q = q.lte('area_m2', maxArea);

    // 역세권: 300초≈도보 5분 → 400m. nearStation 은 초 단위로 받음.
    if (nearStation != null) {
      const meters = Math.max(80, Math.round((nearStation / 60) * 80)); // 4.8km/h 기준
      q = q.lte('station_distance', meters);
    }

    // 신축: 현재연도 - built_year ≤ N
    if (newBuild != null) {
      const threshold = new Date().getFullYear() - newBuild;
      q = q.gte('built_year', String(threshold));
    }

    if (hasImages) q = q.not('thumb_url', 'is', null);
    if (features && features.length) q = q.overlaps('features', features);

    const { data, error } = await q
      .order('updated_at', { ascending: false, nullsFirst: false })
      .range(0, limit - 1);

    if (error) {
      console.error('[viewport]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data ?? []) as any[]).filter((r) => r.lat != null && r.lng != null);
    const devFn = computeMedianDeviation(rows);

    const listings: MapListing[] = rows.map((r: any) => {
      const { medianPrice, deviation } = devFn(r);
      const photoCount = r.thumb_url ? 1 : 0; // Phase 1.1: listing_images 조인
      const daysOld = Math.max(0, (Date.now() - new Date(r.updated_at ?? r.created_at).getTime()) / 86400000);
      return {
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        deal: r.deal,
        type: r.type ?? null,
        deposit: r.deposit,
        monthly: r.monthly,
        price: r.price,
        area_m2: r.area_m2,
        rooms: r.rooms,
        floor_current: r.floor_current,
        station_distance: r.station_distance ?? null,
        built_year: r.built_year ?? null,
        building_name: r.building_name ?? null,
        dong: r.dong ?? null,
        title: r.title ?? null,
        thumbnail_url: r.thumb_url ?? null,
        features: Array.isArray(r.features) ? r.features : [],
        photo_count: photoCount,
        median_price: medianPrice,
        median_deviation: deviation,
        hero_score: computeHeroScore(deviation, photoCount, daysOld),
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    return NextResponse.json(
      { listings },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (e) {
    console.error('[viewport] fatal', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
