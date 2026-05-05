// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/page — Wave 68 (사장님 명령 2026-05-06 재설계)
//
// I-ARCH-3: List 응답 limit ≤ 50 (visible viewport 카드만)
//
// 5 업체 표준 paged list endpoint.
//   - 다방 /room-list/bbox limit ~10 매물
//   - 직방 카드 endpoint 29KB
//   - 네모 /store/search-list 59KB
//
// 응답 구조: { listings: MapListing[≤50], total: number, hasMore: bool, page: number }
// sorted by hero_score DESC, fallback updated_at DESC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { maskAddressForPublic } from '@/lib/publicAddress';
import { isSelfHostedImage } from '@/lib/image-policy';
import type { DealType, MapListing } from '@/features/map-2026/store';

export const maxDuration = 15;

const MAX_VIEWPORT_DEG = 2.0;
const MAX_LIMIT = 50; // I-ARCH-3 enforce

function fnv1a(s: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
function pFloat(v: string | null): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function pInt(v: string | null): number | null {
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function pList(v: string | null): string[] | null {
  if (!v) return null;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function categoryToTypeFilter(cat: string, purposes: string[] | null): string | null {
  if (cat === 'residence') return 'type_normalized.in.(원룸,투룸,쓰리룸,포룸+,오피스텔,아파트,빌라,다세대,다가구,단독주택,쉐어하우스,고시원,주거용)';
  if (cat === 'land') return 'type_normalized.in.(토지,대지,전,답,임야,잡종지)';
  if (cat === 'retail_office') {
    if (purposes && purposes.length) {
      const ors = purposes.map((p) => `type_normalized.eq.${p}`).join(',');
      return ors;
    }
    return 'type_normalized.in.(상가,사무실,지식산업센터,공유오피스,근린생활시설,복합건물,학원)';
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const _ip = getClientIp(req);
    const _rl = checkRateLimit({ key: `page:ip:${_ip}`, limit: 600, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    let authed = false;
    try {
      const authHdr = req.headers.get('authorization') || '';
      const token = authHdr.startsWith('Bearer ') ? authHdr.slice(7) : '';
      if (token) {
        const sb = createServerClient();
        const authPromise = sb.auth.getUser(token).then(({ data, error }) => ({ user: data?.user, error }));
        const timeoutPromise = new Promise<{ user: null; error: Error }>((resolve) => {
          setTimeout(() => resolve({ user: null, error: new Error('auth timeout') }), 50);
        });
        const { user, error: authErr } = await Promise.race([authPromise, timeoutPromise]);
        if (!authErr && user) authed = true;
      }
    } catch { /* guest */ }

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

    const category = (searchParams.get('category') || '').slice(0, 40) || null;
    const purposes = pList(searchParams.get('purposes'));
    const deals = pList(searchParams.get('deals')) as DealType[] | null;
    const minPrice = pFloat(searchParams.get('minPrice'));
    const maxPrice = pFloat(searchParams.get('maxPrice'));
    const minDeposit = pFloat(searchParams.get('minDeposit'));
    const maxDeposit = pFloat(searchParams.get('maxDeposit'));
    const minMonthly = pFloat(searchParams.get('minMonthly'));
    const maxMonthly = pFloat(searchParams.get('maxMonthly'));
    const minArea = pFloat(searchParams.get('minArea'));
    const maxArea = pFloat(searchParams.get('maxArea'));
    const types = pList(searchParams.get('types'));
    const sort = searchParams.get('sort') || 'hero_score';

    // pagination
    const requestedLimit = pInt(searchParams.get('limit'));
    const limit = Math.min(MAX_LIMIT, requestedLimit && requestedLimit > 0 ? requestedLimit : MAX_LIMIT);
    const page = Math.max(0, pInt(searchParams.get('page')) ?? 0);
    const offset = page * limit;

    const supabase = createServerClient();

    // visible viewport count (lightweight)
    let cq = supabase
      .from('mv_map_listings')
      .select('*', { count: 'planned', head: true })
      .gte('lat', south).lte('lat', north)
      .gte('lng', west).lte('lng', east)
      .eq('status', '공개');
    if (deals && deals.length) cq = cq.in('deal', deals);
    if (types && types.length) cq = cq.in('type_normalized', types);
    if (!types && category) {
      const catFilter = categoryToTypeFilter(category, purposes);
      if (catFilter) cq = cq.or(catFilter);
    }
    if (minPrice != null) cq = cq.gte('price', minPrice);
    if (maxPrice != null) cq = cq.lte('price', maxPrice);
    if (minDeposit != null) cq = cq.gte('deposit', minDeposit);
    if (maxDeposit != null) cq = cq.lte('deposit', maxDeposit);
    if (minMonthly != null) cq = cq.gte('monthly', minMonthly);
    if (maxMonthly != null) cq = cq.lte('monthly', maxMonthly);
    if (minArea != null) cq = cq.gte('area_m2', minArea);
    if (maxArea != null) cq = cq.lte('area_m2', maxArea);

    // Wave 72 (사장님 명령 2026-05-06): count + select 병렬화 (was sequential 800ms+).
    //   listing card data query 시작 (병렬)

    // listing card data (full fields, page slice)
    let q = supabase
      .from('mv_map_listings')
      .select('id, title, ai_title, ai_description, type, deal, deposit, monthly, price, area_m2, rooms, bathrooms, floor_current, floor_total, direction, lat, lng, dong, address, status, created_at, updated_at, features, thumb_url, station_distance, built_year, building_name, parking, pet, elevator, full_option, maintenance_fee, business_type, has_video, source_site')
      .gte('lat', south).lte('lat', north)
      .gte('lng', west).lte('lng', east)
      .eq('status', '공개');
    if (deals && deals.length) q = q.in('deal', deals);
    if (types && types.length) q = q.in('type_normalized', types);
    if (!types && category) {
      const catFilter = categoryToTypeFilter(category, purposes);
      if (catFilter) q = q.or(catFilter);
    }
    if (minPrice != null) q = q.gte('price', minPrice);
    if (maxPrice != null) q = q.lte('price', maxPrice);
    if (minDeposit != null) q = q.gte('deposit', minDeposit);
    if (maxDeposit != null) q = q.lte('deposit', maxDeposit);
    if (minMonthly != null) q = q.gte('monthly', minMonthly);
    if (maxMonthly != null) q = q.lte('monthly', maxMonthly);
    if (minArea != null) q = q.gte('area_m2', minArea);
    if (maxArea != null) q = q.lte('area_m2', maxArea);

    if (sort === 'updated_at') q = q.order('updated_at', { ascending: false });
    else q = q.order('updated_at', { ascending: false }); // fallback (hero_score not in mv yet)

    q = q.range(offset, offset + limit - 1);

    // Wave 72: parallel count + select (was sequential)
    const [countResult, dataResult] = await Promise.all([cq, q]);
    const totalCount = countResult.count;
    const { data: rows, error } = dataResult;
    if (error) {
      console.error('[page]', error);
      return NextResponse.json({ error: 'query failed' }, { status: 500 });
    }

    const listings: MapListing[] = (rows ?? []).map((r: any) => {
      const photoCount = (r.thumb_url && !r.source_site) ? 1 : 0;
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
        building_name: authed ? (r.building_name ?? null) : null,
        cluster_token: r.building_name ? fnv1a(normalize(r.building_name)) : null,
        tier1_lat: null,
        tier1_lng: null,
        dong: r.dong ?? null,
        address: r.address ?? null,
        title: authed
          ? (r.title ?? null)
          : (r.title ? maskAddressForPublic(r.title, r.dong) : (r.dong ?? null)),
        ai_title: r.ai_title ?? (r.ai_description
          ? String(r.ai_description).split(/[\n.]/)[0].slice(0, 80).trim()
          : null),
        thumbnail_url: (() => {
          const u = r.thumb_url ?? null;
          if (!u) return null;
          if (!r.source_site) return u;
          return isSelfHostedImage(u) ? u : null;
        })(),
        features: Array.isArray(r.features) ? r.features : [],
        photo_count: photoCount,
        median_price: 0,
        median_deviation: 0,
        hero_score: 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    const total = totalCount ?? 0;
    const hasMore = offset + listings.length < total;

    return NextResponse.json(
      { listings, total, hasMore, page, limit },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',  // Wave 72: stronger CDN cache
          'Vary': 'Authorization',
        },
      },
    );
  } catch (e) {
    console.error('[page] fatal', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
