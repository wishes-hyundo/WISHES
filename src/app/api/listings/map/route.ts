// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/map — 지도 범위 기반 매물 조회 (레거시 호환 + MV 가속)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// ⚡ 2026-04-20 핫픽스 (10만 건 대응)
//   - 소스를 listings → mv_map_listings 로 전환 (조인 비용 0)
//   - 페이지 루프 1000건×10 제거 → MV 단일 range (제한 5000)
//   - listing_images 조인 제거 → MV 의 thumb_url 컬럼으로 대체
//   - cache.ts stale-while-revalidate 추가 (같은 bounds 반복 요청 대응)
//
// 클라이언트 응답 shape 호환성 보존 (listing_images: [{url}] 형태 유지).
// Deck.gl 통합 후 useMapClusters 훅으로 전환되면 이 엔드포인트는 폴백 역할로 남는다.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sanitizePublicListing } from '@/lib/listing-public';
// G-118 (2026-05-04 사장님): title/address 호수 leak 차단 — viewport API 와 동일 마스킹.
import { maskAddressForPublic } from '@/lib/publicAddress';
import { applyImagePolicy } from '@/lib/image-policy';
import { cached } from '@/lib/cache';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { maskListingsCoordinates } from '@/lib/coordinateMask';

const MAX_PER_REQUEST = 5000;

/**
 * 지도 바운드 범위 내 매물 조회 (mv_map_listings 우선, 실패 시 listings 폴백)
 *
 * L-sec170 (2026-05-02): Coordinate masking for non-logged-in users
 *   - Logged-in: precise lat/lng
 *   - Not logged-in: masked to dong-level (0.01° = ~1.1km) via maskListingsCoordinates
 */
export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated via Authorization header
    const authHeader = request.headers.get('authorization');
    const isAuthenticated = !!authHeader?.startsWith('Bearer ');

    // L-sec79 (2026-04-22): 10s s-maxage 로 unique bbox 조합은 캨시 미히트.
    //   5분 200회/IP cap. 정상 pan/zoom 50-100회/세션.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `listings-map:ip:${_ip}`, limit: 200, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { searchParams } = new URL(request.url);

    const swLat = parseFloat(searchParams.get('swLat') || '0');
    const swLng = parseFloat(searchParams.get('swLng') || '0');
    const neLat = parseFloat(searchParams.get('neLat') || '0');
    const neLng = parseFloat(searchParams.get('neLng') || '0');

    // L-sec28 (2026-04-22): 공개 GET. lat/lng 절대 범위 검증 (Infinity/NaN/범위 밖 차단)
    const inLat = (v: number) => Number.isFinite(v) && v >= -90 && v <= 90 && v !== 0;
    const inLng = (v: number) => Number.isFinite(v) && v >= -180 && v <= 180 && v !== 0;
    if (!inLat(swLat) || !inLat(neLat) || !inLng(swLng) || !inLng(neLng)) {
      return NextResponse.json(
        {
          success: false,
          error: 'bounds 파라미터가 필요합니다 (swLat, swLng, neLat, neLng)',
        },
        { status: 400 }
      );
    }

    // L-sec28: deal/type 길이 cap + price finite 검증
    const deal = searchParams.get('deal')?.slice(0, 20) || null;
    const type = searchParams.get('type')?.slice(0, 40) || null;
    const toFinitePrice = (v: string | null): number | null => {
      if (!v) return null;
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0 || n > 1e12) return null;
      return n;
    };
    const minDeposit = toFinitePrice(searchParams.get('minDeposit'));
    const maxDeposit = toFinitePrice(searchParams.get('maxDeposit'));

    // 가격 컬럼은 deal 에 따라 분기 (매매=price, 월세=monthly, 기본=deposit)
    const priceColumn = deal === '매매' ? 'price' : deal === '월세' ? 'monthly' : 'deposit';

    // 캐시 키 (소수점 3자리 ≒ 100m 오차 — 유사 이동 시 캐시 재활용)
    const q = (n: number) => n.toFixed(3);
    const cacheKey = `listingsmap:${q(swLat)},${q(swLng)}-${q(neLat)},${q(neLng)}:${deal || ''}:${type || ''}:${minDeposit ?? ''}:${maxDeposit ?? ''}`;

    const result = await cached(
      cacheKey,
      async () => {
        const supabase = createServerClient();

        // 🚀 1순위: mv_map_listings (사전조인 완료된 경량 MV)
        const tryMv = async () => {
          let q2 = supabase
            .from('mv_map_listings')
            .select(
              'id, title, ai_title, ai_description, building_name, type, deal, deposit, monthly, price, area_m2, area_pyeong, rooms, bathrooms, floor_current, floor_total, lat, lng, status, dong, address, address_detail, maintenance_fee, business_type, source_site, created_at, updated_at, views, parking, elevator, full_option, pet, balcony, built_year, direction, description:ai_description, station_name, station_distance, features, thumb_url, has_video, price_unified',
              { count: 'exact' },
            )
            .gte('lat', swLat)
            .lte('lat', neLat)
            .gte('lng', swLng)
            .lte('lng', neLng);
          if (deal) q2 = q2.eq('deal', deal);
          if (type) q2 = q2.eq('type_normalized', type);
          if (minDeposit != null) q2 = q2.gte(priceColumn, minDeposit);
          if (maxDeposit != null) q2 = q2.lte(priceColumn, maxDeposit);

          const { data, error, count } = await q2
            .order('updated_at', { ascending: false, nullsFirst: false })
            .range(0, MAX_PER_REQUEST - 1);
          if (error) throw error;
          return { data: data || [], total: count ?? (data?.length || 0), fromMv: true };
        };

        // 🛟 폴백: 레거시 listings 직접 조회 (MV 미적용 환경 대응)
        const tryLegacy = async () => {
          let q2 = supabase
            .from('listings')
            .select(
              'id, title, ai_title, ai_description, building_name, type, deal, deposit, monthly, price, area_m2, area_pyeong, rooms, bathrooms, floor_current, floor_total, lat, lng, status, dong, address, maintenance_fee, business_type, goodwill_fee, vat_included, source_site, created_at, updated_at, views, parking, elevator, full_option, pet, balcony, built_year, direction, description, station_name, station_distance, features, listing_images(url)',
              { count: 'exact' },
            )
            .eq('status', '공개')
            .gte('lat', swLat)
            .lte('lat', neLat)
            .gte('lng', swLng)
            .lte('lng', neLng);
          if (deal) q2 = q2.eq('deal', deal);
          if (type) q2 = q2.eq('type_normalized', type);
          if (minDeposit != null) q2 = q2.gte(priceColumn, minDeposit);
          if (maxDeposit != null) q2 = q2.lte(priceColumn, maxDeposit);

          const { data, error, count } = await q2
            .order('updated_at', { ascending: false, nullsFirst: false })
            .range(0, MAX_PER_REQUEST - 1);
          if (error) throw error;
          return { data: data || [], total: count ?? (data?.length || 0), fromMv: false };
        };

        try {
          return await tryMv();
        } catch (mvErr) {
          console.warn('[map] mv_map_listings 실패 → legacy listings 폴백', mvErr);
          return await tryLegacy();
        }
      },
      15_000,   // 15s fresh
      180_000,  // 3min stale
      8_000,    // 8s timeout (HNSW 빌드 직후 첫 쿼리 여유)
    );

    if (!result) {
      return NextResponse.json(
        { success: true, data: [], total: 0, stale: true },
        { headers: { 'Cache-Control': 'no-cache' } },
      );
    }

    // MV 행을 레거시 응답 shape 로 정규화 (listing_images: [{url}] 배열)
    type Row = Record<string, unknown> & {
      thumb_url?: string | null;
      listing_images?: { url: string }[] | null;
      source_site?: string | null;
    };
    let sorted = (result.data as Row[]).map((r) => {
      const imgs = Array.isArray(r.listing_images)
        ? r.listing_images
        : r.thumb_url
        ? [{ url: r.thumb_url as string }]
        : [];
      return applyImagePolicy({ ...r, listing_images: imgs });
    });

    // 사진 유무 정렬 (사진 있는 매물 상단)
    if (sorted.length > 0) {
      sorted = [...sorted].sort((a: Row, b: Row) => {
        const ah = Array.isArray(a.listing_images) && a.listing_images.length > 0 ? 1 : 0;
        const bh = Array.isArray(b.listing_images) && b.listing_images.length > 0 ? 1 : 0;
        if (ah !== bh) return bh - ah;
        const ad = new Date((a.updated_at as string) || (a.created_at as string) || 0).getTime();
        const bd = new Date((b.updated_at as string) || (b.created_at as string) || 0).getTime();
        return bd - ad;
      });
    }

    // G-81 (2026-05-03): sanitizePublicListing 적용 — address_detail 등 FORBIDDEN_PUBLIC_KEYS 제거.
    sorted = sorted.map((r) => sanitizePublicListing(r));

    // L-sec170 (2026-05-02): Apply coordinate masking for non-authenticated users
    let maskedData = maskListingsCoordinates(sorted as any[], isAuthenticated);

    // G-118 (2026-05-04 사장님): 비로그인에 title/address 호수까지 leak 차단.
    //   기존: sanitizePublicListing 이 address_detail 만 제거. title 과 address 는
    //         그대로 노출 → 호수/지번 leak.  viewport API 와 동일 logic 으로 마스킹.
    if (!isAuthenticated) {
      maskedData = maskedData.map((r: any) => {
        const dong = r.dong as string | undefined;
        return {
          ...r,
          building_name: null,
          title: r.title ? maskAddressForPublic(r.title, dong) : (dong ?? null),
          address: r.address ? maskAddressForPublic(r.address, dong) : (dong ?? null),
        };
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: maskedData,
        total: result.total ?? sorted.length,
        source: result.fromMv ? 'mv' : 'legacy',
      },
      {
        headers: {
          // CDN 10초 캐시 + 30초 SWR
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    console.error('지도 매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
