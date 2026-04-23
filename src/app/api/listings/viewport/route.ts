// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/viewport — MAP 2026 뷰포트 쿼리
//
// Phase 1.0: mv_map_listings 기반
// Phase 1.1: rpc_listings_viewport (PostGIS + hero_score + median_deviation)
// Phase E  : Comparable-Aware deviation — dong | deal | areaBand | rooms 래더 fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { maskAddressForPublic } from '@/lib/publicAddress';
import { isSelfHostedImage } from '@/lib/image-policy';
import type { DealType, MapListing } from '@/features/map-2026/store';

export const dynamic = 'force-dynamic';

const MAX_VIEWPORT_DEG = 2.0;
// L-sec140 (2026-04-23): per-axis cap (MAX_VIEWPORT_DEG) 위에 영역 cap 추가.
//   서울+경기 전역 ≈ 1.5 × 0.8 ≈ 1.2 sq-deg 이므로 2.5 면 충분히 수용.
//   per-axis 2.0 × 2.0 = 4 sq-deg 라 4각 코너 상황을 2.5 로 차단 (전국 스캔 방지).
const MAX_VIEWPORT_AREA_SQDEG = 2.5;
// L-viewport1 (2026-04-23): 6000+ 매물 중 일부만 지도에 뜨던 버그 수정.
//   이전 800/3000 조합은 DB 에 6000+ 매물이 있을 때 default bbox (서울 전역)
//   기준으로 실제 매물 수의 ~13% 만 렌더됨.  grid clustering (L-mapmarker2)
//   도입으로 클라이언트 측 rendering cost 는 500→3000 사이에서 거의 선형이므로
//   상한을 대폭 상향.
const DEFAULT_LIMIT = 3000;
const MAX_LIMIT = 10000;
const MIN_COMPARABLES = 3;

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
  // L-sec43 (2026-04-22): CSV 파라미터 길이 + 원소 수 cap — in()/or() 쿼리 폭증 방지.
  if (v.length > 2000) v = v.slice(0, 2000);
  const arr = v.split(',').map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 50);
  return arr.length ? arr : null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category-First → DB type 필터링 (Phase 1 임시 구현)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function categoryToTypeFilter(
  category: string | null,
  purposes: string[] | null
): string | null {
  if (!category) return null;

  // L-catfix1 (2026-04-23 p.m.): 기존엔 residence 도 null 반환 → 필터 미적용
  //   → 주거 탭에서 상가/사무실 leak. DB 실측 types 기반 positive ilike 리스트.
  //   원룸·투룸·쓰리룸·아파트·오피스텔·빌라·주택(단독/다가구/다세대/연립)·고시원·쉐어하우스
  // L-residential-use1 (2026-04-23 p.m.): 한국 부동산 실태 — 공식 type 이
  //   '사무실'·'근린생활시설'·'학원' 이어도 실제로는 원룸처럼 사용되는 매물이
  //   많다 (대학가 오피스 원룸 전용, 고시원식 근린 등). area_m2 < 50㎡ 조건으로
  //   큰 사무실(업무용) 은 제외하고 소형 실사용 주거만 크로스 노출.
  if (category === 'residence') {
    return [
      'type.ilike.%원룸%', 'type.ilike.%투룸%', 'type.ilike.%쓰리룸%',
      'type.ilike.%아파트%', 'type.ilike.%오피스텔%', 'type.ilike.%빌라%',
      'type.ilike.%주택%', 'type.ilike.%단독%', 'type.ilike.%다가구%',
      'type.ilike.%다세대%', 'type.ilike.%연립%', 'type.ilike.%고시원%',
      'type.ilike.%쉐어하우스%',
      // L-residential-use1: 실사용 주거 크로스 (area < 50㎡)
      'and(type.ilike.%사무실%,area_m2.lt.50)',
      'and(type.ilike.%근린%,area_m2.lt.50)',
      'and(type.ilike.%학원%,area_m2.lt.50)',
    ].join(',');
  }

  if (category === 'retail_office') {
    if (purposes && purposes.length) {
      const parts: string[] = [];
      for (const p of purposes) {
        if (p === 'retail')           parts.push('type.ilike.%상가%', 'type.ilike.%근생%');
        if (p === 'office')           parts.push('type.ilike.%사무%', 'type.ilike.%오피스%');
        if (p === 'knowledge_center') parts.push('type.ilike.%지식산업%', 'type.ilike.%아파트형%');
        if (p === 'coworking')        parts.push('type.ilike.%공유오피스%', 'type.ilike.%코워킹%');
        if (p === 'mixed_use')        parts.push('type.ilike.%복합%', 'type.ilike.%주상복합%');
      }
      return parts.length ? parts.join(',') : null;
    }
    return [
      'type.ilike.%상가%', 'type.ilike.%사무%', 'type.ilike.%오피스%',
      'type.ilike.%지식산업%', 'type.ilike.%공유오피스%', 'type.ilike.%복합%',
      'type.ilike.%근생%',
    ].join(',');
  }

  if (category === 'land') {
    return [
      'type.ilike.%토지%', 'type.ilike.%대지%',
      'type.eq.전', 'type.eq.답', 'type.ilike.%임야%', 'type.ilike.%잡종지%',
    ].join(',');
  }

  if (category === 'investment') {
    return [
      'type.ilike.%수익%', 'type.ilike.%재건축%', 'type.ilike.%경매%',
    ].join(',');
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Comparable-Aware median deviation
//
// 🎯 핵심 아이디어
//   - "비슷한 것과 비슷한 것끼리" 비교해야 체감 차별화
//   - 동일 deal 안에서도 20평 원룸과 50평 투룸을 섞어 평균 내면 의미 X
//   - 면적 band + 방수 로 comparable 을 좁히되, 샘플이 부족하면
//     broader 그룹으로 fallback 해 deviation 이 null 이 되지 않게
//
// 📐 비교 키 래더 (좁음 → 넓음)
//   1. dong | deal | areaBand | roomsBand
//   2. dong | deal | areaBand
//   3. dong | deal
//   4. deal
//   각 단계에서 comparable 개수 ≥ MIN_COMPARABLES 이면 그 median 사용
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type ComparableRow = {
  dong: string | null;
  deal: string;
  price: number | null;
  deposit: number | null;
  monthly: number | null;
  area_m2: number | null;
  rooms: number | null;
};

function areaBand(area: number | null): string {
  if (area == null) return '_';
  if (area < 33) return 'S';       // ~10평 미만
  if (area < 66) return 'M';       // 10~20평
  if (area < 100) return 'L';      // 20~30평
  if (area < 150) return 'XL';     // 30~45평
  return 'XXL';                    // 45평+
}

function roomsBand(rooms: number | null): string {
  if (rooms == null) return '_';
  if (rooms <= 1) return '1';
  if (rooms === 2) return '2';
  return '3+';
}

function normalizedPrice(l: ComparableRow): number {
  if (l.deal === '매매') return l.price ?? 0;
  if (l.deal === '전세') return l.deposit ?? 0;
  // 월세·단기: 환산가 = 보증금 + 월세×100 (한국 부동산 관행 환산)
  return (l.deposit ?? 0) + (l.monthly ?? 0) * 100;
}

function computeMedianDeviation(rows: ComparableRow[]) {
  // 4 단계 그룹 맵 동시 축적
  const g4 = new Map<string, number[]>();
  const g3 = new Map<string, number[]>();
  const g2 = new Map<string, number[]>();
  const g1 = new Map<string, number[]>();

  for (const r of rows) {
    const price = normalizedPrice(r);
    if (price <= 0) continue;
    const dong = r.dong ?? '_';
    const ab = areaBand(r.area_m2);
    const rb = roomsBand(r.rooms);
    const k4 = `${dong}|${r.deal}|${ab}|${rb}`;
    const k3 = `${dong}|${r.deal}|${ab}`;
    const k2 = `${dong}|${r.deal}`;
    const k1 = `${r.deal}`;
    (g4.get(k4) ?? g4.set(k4, []).get(k4)!).push(price);
    (g3.get(k3) ?? g3.set(k3, []).get(k3)!).push(price);
    (g2.get(k2) ?? g2.set(k2, []).get(k2)!).push(price);
    (g1.get(k1) ?? g1.set(k1, []).get(k1)!).push(price);
  }

  const medianOf = (arr: number[]): number => {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const medianFrom = (m: Map<string, number[]>, key: string): number | null => {
    const arr = m.get(key);
    if (!arr || arr.length < MIN_COMPARABLES) return null;
    return medianOf(arr);
  };

  return (l: ComparableRow) => {
    const price = normalizedPrice(l);
    if (price <= 0) return { medianPrice: null, deviation: null, comparableTier: 0 };

    const dong = l.dong ?? '_';
    const ab = areaBand(l.area_m2);
    const rb = roomsBand(l.rooms);

    // 좁은 키부터 시도하고, 샘플 부족하면 넓은 키로 fallback
    const m4 = medianFrom(g4, `${dong}|${l.deal}|${ab}|${rb}`);
    if (m4 != null) return { medianPrice: m4, deviation: (price - m4) / m4, comparableTier: 4 };
    const m3 = medianFrom(g3, `${dong}|${l.deal}|${ab}`);
    if (m3 != null) return { medianPrice: m3, deviation: (price - m3) / m3, comparableTier: 3 };
    const m2 = medianFrom(g2, `${dong}|${l.deal}`);
    if (m2 != null) return { medianPrice: m2, deviation: (price - m2) / m2, comparableTier: 2 };
    const m1 = medianFrom(g1, `${l.deal}`);
    if (m1 != null) return { medianPrice: m1, deviation: (price - m1) / m1, comparableTier: 1 };
    return { medianPrice: null, deviation: null, comparableTier: 0 };
  };
}

function computeHeroScore(
  deviation: number | null,
  photoCount: number,
  daysOld: number,
  comparableTier: number
): number {
  let s = 50;
  if (deviation != null) {
    // tier 4 (가장 정확한 comparable) 에서 온 deviation 은 보너스 가산
    const tierWeight = comparableTier >= 3 ? 1.0 : comparableTier >= 2 ? 0.8 : 0.5;
    if (deviation <= -0.1)      s += 25 * tierWeight;
    else if (deviation <= -0.05) s += 15 * tierWeight;
    else if (deviation >= 0.1)   s -= 20 * tierWeight;
  }
  if (photoCount >= 10) s += 15;
  else if (photoCount >= 5) s += 8;
  if (daysOld <= 3) s += 10;
  else if (daysOld <= 7) s += 5;
  else if (daysOld > 60) s -= 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export async function GET(req: NextRequest) {
  // L-sec75 (2026-04-22): force-dynamic + 30s max-age 라 unique bbox 마다 DB
  //   hits. 5분 200회/IP cap (pan/zoom 정상 사용 50-100회/세션).
  const _ip = getClientIp(req);
  const _rl = checkRateLimit({ key: `viewport:ip:${_ip}`, limit: 200, windowMs: 5 * 60_000 });
  if (!_rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
    );
  }

  // ─────────────────────────────────────────────────────────────
  // L-privacy1 (2026-04-23 p.m.): 비로그인 사용자에게는 주소를 동 단위
  //   까지만 노출. 건물명·호수·층·지번은 서버에서 스크럽되어야 한다
  //   (클라이언트 필터는 네트워크에 이미 전송된 상태라 우회 가능).
  //   - authed = Authorization: Bearer <JWT> 유효성 검사 통과
  //   - useViewport (클라이언트) 가 세션 있을 때만 Authorization 헤더를 보냄
  // ─────────────────────────────────────────────────────────────
  let authed = false;
  try {
    const authHdr = req.headers.get('authorization') || '';
    const token = authHdr.startsWith('Bearer ') ? authHdr.slice(7) : '';
    if (token) {
      const sb = createServerClient();
      const { data: { user }, error: authErr } = await sb.auth.getUser(token);
      if (!authErr && user) authed = true;
    }
  } catch { /* guest 로 폴백 */ }

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
  // L-sec140: 영역 cap (defense-in-depth)
  if ((east - west) * (north - south) > MAX_VIEWPORT_AREA_SQDEG) {
    return NextResponse.json({ error: 'viewport area too large' }, { status: 400 });
  }
  if (east < west || north < south) {
    return NextResponse.json({ error: 'invalid bbox order' }, { status: 400 });
  }

  // Category-First 맥락
  // L-sec43: category 문자열 길이 cap
  const category = (searchParams.get('category') || '').slice(0, 40) || null;
  const purposes = pList(searchParams.get('purposes'));

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
  const nearStation = pInt(searchParams.get('nearStation'));
  const newBuild = pInt(searchParams.get('newBuild'));
  const hasImages = searchParams.get('hasImages') === '1';
  const limit = Math.min(pInt(searchParams.get('limit')) ?? DEFAULT_LIMIT, MAX_LIMIT);

  try {
    const supabase = createServerClient();

    let q = supabase
      .from('mv_map_listings')
      .select(
        // L-card3 (2026-04-23 p.m.): v3 카드 + 슬라이드 패널용 필드 확장.
        //   ai_title (제목 라인), direction/parking/pet/elevator/full_option/
        //   maintenance_fee/bathrooms/floor_total/business_type (패널 상세 테이블),
        //   has_video (NEW 뱃지 계산엔 불필요 — created_at 만으로 72h 판정).
        'id, title, ai_title, ai_description, type, deal, deposit, monthly, price, area_m2, rooms, bathrooms, floor_current, floor_total, direction, lat, lng, dong, status, created_at, updated_at, features, thumb_url, station_distance, built_year, building_name, parking, pet, elevator, full_option, maintenance_fee, business_type, has_video, source_site',
      )
      .gte('lat', south)
      .lte('lat', north)
      .gte('lng', west)
      .lte('lng', east)
      .eq('status', '공개');

    if (deals && deals.length) q = q.in('deal', deals);
    if (types && types.length) q = q.in('type', types);

    // 카테고리 필터 (types 가 이미 있으면 그걸 우선)
    if (!types && category) {
      const catFilter = categoryToTypeFilter(category, purposes);
      if (catFilter) {
        q = q.or(catFilter);
      }
    }

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

    // ─── L-sec123 (2026-04-22) 다거래 가격필터 수정 ───
    //   기존: deals.length === 1 일 때만 price/deposit/monthly 가 적용돼,
    //         '매매+전세' 다중 선택이나 '전체 거래' 상태에서 가격/보증금 필터가
    //         완전히 무시됐다. (사용자가 필터를 조정해도 결과가 안 바뀌는 버그)
    //   수정: 각 가격축을 해당 deal 에만 스코프하고, 비대상 deal 은 OR 로 통과.
    //         · minPrice/maxPrice  → 매매 전용 (price)
    //         · minDeposit/maxDeposit → 전세·월세·단기 (deposit, 매매 제외)
    //         · minMonthly/maxMonthly → 월세 전용 (monthly)
    //   PostgREST or() 는 chain 시 AND 로 합성되므로 축 간 독립성 유지.
    //   단일 deal 선택 상황에서도 동일 로직이 그대로 작동 (in 필터로 좁혀진
    //   행만 OR 대상이므로 비대상 leg 은 자동 no-op).
    if (minPrice != null) q = q.or(`deal.neq.매매,price.gte.${minPrice}`);
    if (maxPrice != null) q = q.or(`deal.neq.매매,price.lte.${maxPrice}`);
    if (minDeposit != null) q = q.or(`deal.eq.매매,deposit.gte.${minDeposit}`);
    if (maxDeposit != null) q = q.or(`deal.eq.매매,deposit.lte.${maxDeposit}`);
    if (minMonthly != null) q = q.or(`deal.neq.월세,monthly.gte.${minMonthly}`);
    if (maxMonthly != null) q = q.or(`deal.neq.월세,monthly.lte.${maxMonthly}`);

    if (minArea != null) q = q.gte('area_m2', minArea);
    if (maxArea != null) q = q.lte('area_m2', maxArea);

    if (nearStation != null) {
      const meters = Math.max(80, Math.round((nearStation / 60) * 80));
      q = q.lte('station_distance', meters);
    }

    if (newBuild != null) {
      const threshold = new Date().getFullYear() - newBuild;
      q = q.gte('built_year', String(threshold));
    }

    // L-photofilter1 (2026-04-23 p.m.): 사진 있음 필터 정확도 수정.
    //   이전: thumb_url IS NOT NULL — 크롤링 썸네일도 NOT NULL 이라 무의미
    //   이제: listing_images 에 자체 업로드(/api/images, supabase, r2) 있는 매물만 통과.
    //   현재 DB 는 5개 매물/57장밖에 없어 이 필터 걸면 5건만 반환 — 실상 반영.
    if (hasImages) {
      try {
        const { data: selfHostedListings } = await supabase
          .from('listing_images')
          .select('listing_id')
          .or('url.ilike.%/api/images/%,url.ilike.%.supabase.co/storage/%,url.ilike.%.r2.dev/%,url.ilike.%.r2.cloudflarestorage.com/%');
        const ids = Array.from(new Set(((selfHostedListings ?? []) as { listing_id: number }[]).map((r) => r.listing_id)));
        if (ids.length === 0) {
          q = q.eq('id', -1); // 매치 0건 강제
        } else {
          q = q.in('id', ids);
        }
      } catch {
        q = q.not('thumb_url', 'is', null); // 폴백 (완화 조건)
      }
    }
    if (features && features.length) q = q.overlaps('features', features);

    const { data, error } = await q
      .order('updated_at', { ascending: false, nullsFirst: false })
      .range(0, limit - 1);

    if (error) {
      console.error('[viewport]', error);
      // L-sec43: Postgres/PostgREST 에러 메시지 prod 에서 숨김
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json({ error: isDev ? error.message : 'internal' }, { status: 500 });
    }

    const rows = ((data ?? []) as any[]).filter((r) => r.lat != null && r.lng != null);

    // L-imgrestore1 (2026-04-23 p.m.): 썸네일 복원 배치 쿼리
    //   크롤링 매물(source_site NOT NULL) 중 thumb_url 이 저작권 차단될 매물들만
    //   listing_images 테이블에서 자체 호스팅 이미지(/api/images, supabase, r2) 를
    //   탐색해 첫 장을 썸네일로 복원한다. 중개사가 매물 등록 후 자체 사진만 업로드한
    //   케이스 지원 — "실제로 올린 사진이 있는데 썸네일이 크롤링 원본이라 차단되어
    //   결국 카드에 사진이 안 뜨던" 문제 해결.
    // L-imgrestore2 (2026-04-23 p.m.): 배치 쿼리 최대 300개로 제한.
    //   수천 IN 배열은 Postgres plan 이 slow → viewport 응답이 5~10초 걸리던 원인.
    //   updated_at 최신순 상위 300개만 복구 대상 (사용자에게 가장 눈에 띄는 매물).
    //   나머지는 placeholder. 근본 해결은 mv_map_listings 를 self-hosted 우선으로 재정의
    //   하는 SQL migration (별도 수동 실행).
    const blockedIds: number[] = rows
      .filter((r) => r.source_site && (!r.thumb_url || !isSelfHostedImage(r.thumb_url)))
      .slice(0, 300)
      .map((r) => r.id as number);

    const selfHostedThumbMap = new Map<number, string>();
    // L-photocount1 (2026-04-23 p.m.): 같은 배치 쿼리에서 listing 별 self-hosted
    //   이미지 수도 카운트 → 카드 "N장" 표기에 사용. 기존 `r.thumb_url ? 1 : 0`
    //   은 항상 1장으로 찍히던 버그였음.
    const selfHostedCountMap = new Map<number, number>();
    if (blockedIds.length > 0) {
      try {
        const { data: imgs } = await supabase
          .from('listing_images')
          .select('listing_id, url, sort_order, is_thumbnail')
          .in('listing_id', blockedIds)
          .or('url.ilike.%/api/images/%,url.ilike.%.supabase.co/storage/%,url.ilike.%.r2.dev/%,url.ilike.%.r2.cloudflarestorage.com/%')
          .order('is_thumbnail', { ascending: false, nullsFirst: false })
          .order('sort_order', { ascending: true, nullsFirst: false });
        for (const img of imgs ?? []) {
          const lid = (img as { listing_id: number }).listing_id;
          if (!selfHostedThumbMap.has(lid)) {
            selfHostedThumbMap.set(lid, (img as { url: string }).url);
          }
          selfHostedCountMap.set(lid, (selfHostedCountMap.get(lid) ?? 0) + 1);
        }
      } catch (e) {
        console.warn('[viewport] thumbnail restore batch failed', e);
      }
    }

    const devFn = computeMedianDeviation(rows);

    const listings: MapListing[] = rows.map((r: any) => {
      const { medianPrice, deviation, comparableTier } = devFn(r);
      // L-photocount1: self-hosted 배치 카운트 우선 → 0 이면 fallback.
      //   크롤링 매물: 자체 업로드 수만 노출 (저작권 정책 일관성).
      //   자체 매물(source_site NULL): thumb_url 있으면 최소 1.
      const photoCount = selfHostedCountMap.get(r.id) ?? (r.thumb_url && !r.source_site ? 1 : 0);
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
        // L-privacy1: 비로그인 guest 에는 건물명·타이틀 노출 금지.
        //   · building_name → null
        //   · title → 주소 마스킹된 '구 동' 형태 (지번·건물명·층 제거)
        //     title 이 없으면 dong 으로 폴백. 동이 없으면 null.
        building_name: authed ? (r.building_name ?? null) : null,
        dong: r.dong ?? null,
        title: authed
          ? (r.title ?? null)
          : (r.title ? maskAddressForPublic(r.title, r.dong) : (r.dong ?? null)),
        // L-card3: 제목 라인 (ai_title). 없으면 ai_description 첫 줄 (80자 이내).
        ai_title: r.ai_title ?? (r.ai_description
          ? String(r.ai_description).split(/[\n.]/)[0].slice(0, 80).trim()
          : null),
        direction: r.direction ?? null,
        parking: r.parking ?? null,
        pet: r.pet ?? null,
        elevator: r.elevator ?? null,
        full_option: r.full_option ?? null,
        maintenance_fee: r.maintenance_fee ?? null,
        bathrooms: r.bathrooms ?? null,
        floor_total: r.floor_total ?? null,
        business_type: r.business_type ?? null,
        has_video: !!r.has_video,
        // L-imgrestore1 (2026-04-23 p.m.): 크롤링 매물에 중개사가 나중에 추가한
        //   자체 업로드 사진이 있으면 썸네일 복원. selfHostedThumbMap 은 아래에서
        //   배치 쿼리로 채워짐 (차단된 매물만 대상).
        //   우선순위: [자체 업로드 복원] > [원본 thumb_url (자체 매물만)]
        thumbnail_url: (() => {
          const restored = selfHostedThumbMap.get(r.id);
          if (restored) return restored;
          const u = r.thumb_url ?? null;
          if (!u) return null;
          if (!r.source_site) return u; // 자체 매물 — 원본 통과
          return isSelfHostedImage(u) ? u : null; // 크롤링 매물 — 자체 호스팅만 통과
        })(),
        features: Array.isArray(r.features) ? r.features : [],
        photo_count: photoCount,
        median_price: medianPrice,
        median_deviation: deviation,
        hero_score: computeHeroScore(deviation, photoCount, daysOld, comparableTier),
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    // L-catcount1 (2026-04-23 p.m.): 4개 카테고리별 count 를 같이 돌려준다.
    //   CategoryTabs 가 비활성 탭 숫자 배지를 노출 ("주거 3,487 / 상가 204") — 어느 탭에
    //   매물이 많은지 한눈에 보이게. bbox + 가격/면적/거래방식 필터는 상속하고
    //   카테고리(type) 필터만 제외한 base 로 Promise.all 4-parallel count.
    async function countByCategory(cat: 'residence' | 'retail_office' | 'land' | 'investment'): Promise<number> {
      let cq = supabase
        .from('mv_map_listings')
        .select('*', { count: 'exact', head: true })
        .gte('lat', south)
        .lte('lat', north)
        .gte('lng', west)
        .lte('lng', east)
        .eq('status', '공개');
      if (deals && deals.length) cq = cq.in('deal', deals);
      if (minArea != null) cq = cq.gte('area_m2', minArea);
      if (maxArea != null) cq = cq.lte('area_m2', maxArea);
      const catFilter = categoryToTypeFilter(cat, cat === 'retail_office' ? purposes : null);
      if (catFilter) cq = cq.or(catFilter);
      const { count: cnt } = await cq;
      return cnt ?? 0;
    }
    let counts: { residence: number; retail_office: number; land: number; investment: number } | undefined;
    try {
      const [r_cnt, o_cnt, l_cnt, i_cnt] = await Promise.all([
        countByCategory('residence'),
        countByCategory('retail_office'),
        countByCategory('land'),
        countByCategory('investment'),
      ]);
      counts = { residence: r_cnt, retail_office: o_cnt, land: l_cnt, investment: i_cnt };
    } catch {
      /* count 는 optional — 실패해도 listings 응답엔 영향 없음 */
    }

    return NextResponse.json(
      { listings, counts },
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
