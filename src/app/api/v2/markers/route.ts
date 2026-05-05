// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/map/markers — Wave 68 (사장님 명령 2026-05-06 재설계)
//
// I-ARCH-1: viewport 와 cluster API 영구 분리
// I-ARCH-2: marker 응답 fields ≤ 10
//
// 5 업체 (다방/네이버/직방/네모/피터팬) 표준 marker endpoint.
//   - 직방 패턴: id+lat+lng+price (3-4 fields)
//   - 응답 size ≤ 100KB (현재 viewport 1.28MB → 13배 감소)
//
// 응답 구조: { markers: Array<{id,lat,lng,deal,price,deposit,monthly,cluster_token,photo_count}>,
//              counts: { residence, retail_office, land, investment } }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import type { DealType } from '@/features/map-2026/store';

export const maxDuration = 15;

const MAX_VIEWPORT_DEG = 2.0;
const MAX_VIEWPORT_AREA_SQDEG = 2.5;

// FNV-1a 32bit hash for cluster_token (I-MARKER-2)
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
    const _rl = checkRateLimit({ key: `markers:ip:${_ip}`, limit: 600, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    // I-COORD-3 / I-COORD-4: raw 좌표 + 비로그인 줌 락 (client setMinLevel)
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
    if ((east - west) * (north - south) > MAX_VIEWPORT_AREA_SQDEG) {
      return NextResponse.json({ error: 'viewport area too large' }, { status: 400 });
    }
    if (east < west || north < south) {
      return NextResponse.json({ error: 'invalid bbox order' }, { status: 400 });
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

    const supabase = createServerClient();

    // I-ARCH-2: Marker 응답 fields ≤ 10 (id, lat, lng, deal, price, deposit, monthly, building_name(for token), type)
    let q = supabase
      .from('mv_map_listings')
      .select('id, lat, lng, deal, price, deposit, monthly, building_name, type, source_site, thumb_url')
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

    const { data: rows, error } = await q.limit(100000);
    if (error) {
      console.error('[markers]', error);
      return NextResponse.json({ error: 'query failed' }, { status: 500 });
    }

    // I-ARCH-2: marker response - 9 fields only
    const markers = (rows ?? []).map((r: any) => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      deal: r.deal,
      price: r.price,
      deposit: r.deposit,
      monthly: r.monthly,
      type: r.type ?? null,
      cluster_token: r.building_name ? fnv1a(normalize(r.building_name)) : null,
    }));

    // category counts (lightweight, cached)
    const cacheKeyBase = [
      'markers-catcount-v1',
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
            .gte('lat', south).lte('lat', north)
            .gte('lng', west).lte('lng', east)
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
        { revalidate: 60, tags: ['markers-catcount'] },
      );
      return getCached();
    }
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | 0> =>
      Promise.race([p, new Promise<0>((resolve) => setTimeout(() => resolve(0 as 0), ms))]);
    let counts: { residence: number; retail_office: number; land: number; investment: number } | undefined;
    try {
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
    } catch { /* counts optional */ }

    // suppress unused authed warning
    void authed;

    return NextResponse.json(
      { markers, counts, total: markers.length },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
          'Vary': 'Authorization',
        },
      },
    );
  } catch (e) {
    console.error('[markers] fatal', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
