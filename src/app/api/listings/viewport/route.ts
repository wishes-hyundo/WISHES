// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/viewport — MAP 2026 뷰포트 쿼리
//
// Phase 1.0: mv_map_listings 기반
// Phase 1.1: rpc_listings_viewport (PostGIS + hero_score + median_deviation)
// Phase E  : Comparable-Aware deviation — dong | deal | areaBand | rooms 래더 fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { NextRequest, NextResponse } from 'next/server';
// L-viewport3 (2026-04-24 pm): 카테고리 count 4개를 매 pan/zoom 마다 다시 집계하던
//   것을 Node 레벨 30초 cache 로 묶는다.
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { maskAddressForPublic } from '@/lib/publicAddress';
import { isSelfHostedImage } from '@/lib/image-policy';
// G-112 (2026-05-03): maskCoordinate import 제거 — I-COORD-3 INVARIANT 준수.
import type { DealType, MapListing } from '@/features/map-2026/store';

// L-perf-2 (2026-04-29 사장님 명령): force-dynamic 제거 → Edge cache 적용 가능.
//   searchParams + Authorization 사용으로 자동 dynamic — 동일 동작.
//   응답 Cache-Control 헤더로 Edge cache 제어.
// export const dynamic = 'force-dynamic'; — 제거됨
// L-viewport4 (2026-04-24 pm): 10s 기본값으로 timeout — 뷰포트 내 매물 다수 + 카테고리
//   count 4회 병렬 + 차단 이미지 복원까지 합쳐 종종 10s 초과 → FUNCTION_INVOCATION_TIMEOUT 504.
//   maxDuration=30 으로 상향하면서 아래 쿼리도 병렬화 · count 는 planned(근사) 집계.
export const maxDuration = 30;

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
// L-nolimit1 (2026-04-26): MAX_LIMIT 제거.  클라이언트 useViewport 가
//   bbox ≤ 0.3° 일 때만 호출하므로 자연스러운 안전장치.  10만+ 매물 추가
//   되어도 동 단위 viewport 에는 일부만 들어옴.
const DEFAULT_LIMIT = 3000;
const MAX_LIMIT = 100000;
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
      'type_normalized.ilike.%원룸%', 'type_normalized.ilike.%투룸%', 'type_normalized.ilike.%쓰리룸%',
      'type_normalized.ilike.%아파트%', 'type_normalized.ilike.%오피스텔%', 'type_normalized.ilike.%빌라%',
      'type_normalized.ilike.%주택%', 'type_normalized.ilike.%단독%', 'type_normalized.ilike.%다가구%',
      'type_normalized.ilike.%다세대%', 'type_normalized.ilike.%연립%', 'type_normalized.ilike.%고시원%',
      'type_normalized.ilike.%쉐어하우스%',
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
        if (p === 'retail')           parts.push('type_normalized.ilike.%상가%', 'type_normalized.ilike.%근생%');
        if (p === 'office')           parts.push('type_normalized.ilike.%사무%', 'type_normalized.ilike.%오피스%');
        if (p === 'knowledge_center') parts.push('type_normalized.ilike.%지식산업%', 'type_normalized.ilike.%아파트형%');
        if (p === 'coworking')        parts.push('type_normalized.ilike.%공유오피스%', 'type_normalized.ilike.%코워킹%');
        if (p === 'mixed_use')        parts.push('type_normalized.ilike.%복합%', 'type_normalized.ilike.%주상복합%');
      }
      return parts.length ? parts.join(',') : null;
    }
    return [
      'type_normalized.ilike.%상가%', 'type_normalized.ilike.%사무%', 'type_normalized.ilike.%오피스%',
      'type_normalized.ilike.%지식산업%', 'type_normalized.ilike.%공유오피스%', 'type_normalized.ilike.%복합%',
      'type_normalized.ilike.%근생%',
    ].join(',');
  }

  if (category === 'land') {
    return [
      'type_normalized.ilike.%토지%', 'type_normalized.ilike.%대지%',
      'type_normalized.eq.전', 'type_normalized.eq.답', 'type_normalized.ilike.%임야%', 'type_normalized.ilike.%잡종지%',
    ].join(',');
  }

  if (category === 'investment') {
    return [
      'type_normalized.ilike.%수익%', 'type_normalized.ilike.%재건축%', 'type_normalized.ilike.%경매%',
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
      // Wave 66 (사장님 명령 2026-05-04 R-S1): JWT auth timeout 200ms → 50ms.
      //   진단: 200ms timeout 이 fast path (30-50ms) 도 race 통해 끝까지 기다림. 비로그인도 매 요청
      //     200ms 손실. 50ms 면 fast path 통과 + slow path 는 guest 폴백 (UI 영향 0 — masked
      //     address 동일).
      const sb = createServerClient();
      const authPromise = sb.auth.getUser(token).then(({ data, error }) => ({ user: data?.user, error }));
      const timeoutPromise = new Promise<{ user: null; error: Error }>((resolve) => {
        setTimeout(() => resolve({ user: null, error: new Error('auth timeout') }), 50);
      });
      const { user, error: authErr } = await Promise.race([authPromise, timeoutPromise]);
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
        'id, title, ai_title, ai_description, type, deal, deposit, monthly, price, area_m2, rooms, bathrooms, floor_current, floor_total, direction, lat, lng, dong, address, status, created_at, updated_at, features, thumb_url, station_distance, built_year, building_name, parking, pet, elevator, full_option, maintenance_fee, business_type, has_video, source_site',
      )
      .gte('lat', south)
      .lte('lat', north)
      .gte('lng', west)
      .lte('lng', east)
      .eq('status', '공개');

    if (deals && deals.length) q = q.in('deal', deals);
    if (types && types.length) q = q.in('type_normalized', types);

    // 카테고리 필터 (types 가 이미 있으면 그걸 우선)
    if (!types && category) {
      const catFilter = categoryToTypeFilter(category, purposes);
      if (catFilter) {
        q = q.or(catFilter);
      }
    }

    // ─── L-naver-2026filterfix1 (2026-04-27) rooms 필터 type 기반 정확화 ───
    //   사용자 발견 버그: rooms=2 (투룸) 필터인데 type='원룸' 인 매물 노출.
    //   원인: 기존은 rooms 컬럼만 필터. DB 무결성 깨짐 (type='원룸' + rooms=2).
    //   해결: type 기반 정확 필터 (사용자 기대 — "투룸" 클릭 = type='투룸' 만).
    //     · rooms=1 → type='원룸'
    //     · rooms=2 → type='투룸'
    //     · rooms=3+ → rooms >= 3 OR type LIKE '%쓰리룸%'
    if (rooms && rooms.length) {
      const ors: string[] = [];
      if (rooms.includes(1)) ors.push('type_normalized.eq.원룸');
      if (rooms.includes(2)) ors.push('type_normalized.eq.투룸');
      if (rooms.some((n) => n >= 3)) {
        ors.push('rooms.gte.3');
        // type 에 "쓰리룸"/"포룸"/"오룸" 명시된 매물도 포함 (DB 무결성 보강)
        ors.push('type_normalized.like.*쓰리룸*');
        ors.push('type_normalized.like.*포룸*');
      }
      if (ors.length) q = q.or(ors.join(','));
    }

    // ─── L-naver-2026filterfix2 (2026-04-27) 가격 필터 NULL 안전 처리 ───
    //   사용자 발견 버그: 보증금 500~1000 필터인데 매매 매물 (보증금 NULL) 노출.
    //   원인: 기존 q.or(`deal.eq.매매,deposit.gte.500`) — 매매면 무조건 통과.
    //   해결: 단순 gte/lte 사용. PostgreSQL 의 NULL 비교는 NULL=false →
    //         자동으로 deposit IS NULL 인 매매 매물 제외.
    //         · price 필터: 매매만 통과 (전세/월세는 price=NULL → 제외) ✅
    //         · deposit 필터: 전세/월세/단기만 통과 (매매=NULL → 제외) ✅
    //         · monthly 필터: 월세/단기만 통과 (매매/전세=NULL → 제외) ✅
    //   이 logic 이 사용자 기대와 일치 (각 거래 타입의 의미 있는 필터만 적용).
    if (minPrice != null) q = q.gte('price', minPrice);
    if (maxPrice != null) q = q.lte('price', maxPrice);
    if (minDeposit != null) q = q.gte('deposit', minDeposit);
    if (maxDeposit != null) q = q.lte('deposit', maxDeposit);
    if (minMonthly != null) q = q.gte('monthly', minMonthly);
    if (maxMonthly != null) q = q.lte('monthly', maxMonthly);

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
    // L-naver-2026filterfix5 (2026-04-27): features 는 JSONB array — server skip + 클라 검증
    //   PostgREST overlaps/contains 모두 0개 반환 (jsonb column 임).
    //   해결: 서버 skip + ListPanel.tsx every() 로만 검증 (정확도 100%).
    //   영향: viewport limit 까지 가져온 후 클라 필터.
    // features 서버 필터 비활성 — 클라 검증만 사용

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
    // L-photocount2 (2026-04-23 p.m.): 배치 범위를 크롤링 매물 전체 로 넓힘.
    //   이전 L-imgrestore2 는 '차단될 썸네일' 만 대상 → 이미 L-imgrestore1 로
    //   복원된 매물은 제외되어 photo_count 가 0 으로 찍히던 버그. 이제 source_site
    //   NOT NULL 크롤링 매물이면 모두 배치 쿼리에 넣어 실제 사진 수 카운트.
    const blockedIds: number[] = rows
      .filter((r) => !!r.source_site)
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

      // G-112 (2026-05-03 사장님): I-COORD-3 INVARIANT 준수 — viewport API raw 좌표.
      //   이전 L-sec170 (2026-05-02): 비로그인 0.01° 마스킹 → 같은 dong 매물 1점 stack.
      //   이는 G-110 marker stacking 의 근본 원인이자 I-COORD-3 ("maskCoordinate 호출 금지")
      //   직접 위반.  I-COORD-4 의 비로그인 줌 락 (setMinLevel(4) = z16) 으로 privacy 보호하고
      //   매물 detail modal 미니맵 100m 반경 원 (I-DETAIL-1) 으로 별도 보호.
      //   viewport API 는 항상 raw 좌표 — 직방/네이버 표준.
      const lat = r.lat;
      const lng = r.lng;

      return {
        id: r.id,
        lat,
        lng,
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
        // L-adminpoly3 (2026-04-24 pm): 행정구역 폴리곤 카운트 집계용 주소 노출.
        //   PUBLIC_LISTING_COLUMNS 화이트리스트에 있는 공개 필드.
        address: r.address ?? null,
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
    // L-viewport3 (2026-04-24 pm): 4개 카테고리 count 가 매 pan/zoom 마다
    //   `count: 'exact', head: true` × 4 로 돌아 체감 지연의 주 원인이었음.
    //   bbox 좌표를 3자리(≈100m)로 라운딩해 근접 이동은 동일 캐시 키 재활용.
    // Wave 66: cache key R-S5 변경 보류 — query 와 일치 안 시키면 wrong data cache 위험.
    //   S2 timeout 200ms 단축으로 max wait 충분히 감소. cache miss 시에도 200ms 안에 fallback.
    //   bbox 좌표 정밀도 3 → 2 (≈1km grid) 만 완화 (cache hit 향상 + 필터 cardinality 영향 X).
    const cacheKeyBase = [
      'viewport-catcount-v1',
      south.toFixed(2), north.toFixed(2), west.toFixed(2), east.toFixed(2),
      (deals ?? []).join(','),
      minArea ?? '', maxArea ?? '',
      (purposes ?? []).join(','),
    ].join('|');
    async function countByCategory(cat: 'residence' | 'retail_office' | 'land' | 'investment'): Promise<number> {
      const cacheKey = `${cacheKeyBase}|${cat}`;
      const getCached = unstable_cache(
        async () => {
          let cq = supabase
            .from('mv_map_listings')
            .select('*', { count: 'planned', head: true })
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
        },
        [cacheKey],
        { revalidate: 30, tags: ['viewport-catcount'] },
      );
      return getCached();
    }
    let counts: { residence: number; retail_office: number; land: number; investment: number } | undefined;
    try {
      // L-viewport4: allSettled 로 일부 count 실패해도 나머지는 반환.
      //   또한 5초 timeout race — count 4개가 너무 오래 걸리면 listings 만 반환.
      const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | 0> =>
        Promise.race([p, new Promise<0>((resolve) => setTimeout(() => resolve(0 as 0), ms))]);
      // Wave 66 (R-S2): count timeout 1000ms → 200ms.
      //   DB 평균 27ms (count: 'planned' = estimate 빠름). 200ms 면 5x 여유 + outlier (slow query)
      //   는 0 fallback (사이드바 카테고리 배지가 일시 0 표시되어도 viewport 매물은 정상).
      //   기존 1s timeout = max wait 1s = 사장님 체감 "응답 늦음".
      const [r_cnt, o_cnt, l_cnt, i_cnt] = await Promise.all([
        withTimeout(countByCategory('residence'), 200),
        withTimeout(countByCategory('retail_office'), 200),
        withTimeout(countByCategory('land'), 200),
        withTimeout(countByCategory('investment'), 200),
      ]);
      counts = {
        residence: r_cnt || 0,
        retail_office: o_cnt || 0,
        land: l_cnt || 0,
        investment: i_cnt || 0,
      };
    } catch {
      /* count 는 optional — 실패해도 listings 응답엔 영향 없음 */
    }

    return NextResponse.json(
      { listings, counts },
      {
        headers: {
          // L-perf-2 (2026-04-29): Edge cache 강화. UI 영향 0.
          //   - max-age=30: 브라우저 30초 (사용자 동작 동일)
          //   - s-maxage=60: Vercel CDN 60초 → 같은 bbox+filter 재방문 0ms
          //   - stale-while-revalidate=300: 60s 후 5분간 stale 반환 + bg 갱신
          //   - Vary: Authorization → 로그인/비로그인 각각 별도 cache (privacy 일관)
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
          'Vary': 'Authorization',
        },
      }
    );
  } catch (e) {
    console.error('[viewport] fatal', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
