// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/map/items — 줌 ≥ 17 개별 매물 상세 (MV 기반 경량)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 클러스터 대신 개별 가격 버블을 뿌리는 고배율 구간 전용.
// mv_map_listings 를 쓰기 때문에 listings 본 테이블 / listing_images 조인 비용 0.
//
// 응답: 최대 500건. 그 이상은 클러스터 RPC 로 다시 폴백하는 편이 안전.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { cached } from '@/lib/cache';
import { applyImagePolicy } from '@/lib/image-policy';
import { sanitizePublicListing } from '@/lib/listing-public';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const ITEMS_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    // L-sec75 (2026-04-22): 10s s-maxage + force-dynamic. 5분 300회/IP cap.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `items:ip:${_ip}`, limit: 300, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { searchParams } = new URL(request.url);

    const swLat = parseFloat(searchParams.get('swLat') || 'NaN');
    const swLng = parseFloat(searchParams.get('swLng') || 'NaN');
    const neLat = parseFloat(searchParams.get('neLat') || 'NaN');
    const neLng = parseFloat(searchParams.get('neLng') || 'NaN');

    // L-sec26 (2026-04-22): 좌표 범위 검증. Infinity/밖 값은 PostgREST gte/lte 에 전달하면
    //   garbage query 가 됨.
    const inLat = (v: number) => Number.isFinite(v) && v >= -90 && v <= 90;
    const inLng = (v: number) => Number.isFinite(v) && v >= -180 && v <= 180;
    if (!inLat(swLat) || !inLat(neLat) || !inLng(swLng) || !inLng(neLng)) {
      return NextResponse.json(
        { success: false, error: 'bounds 파라미터 필요' },
        { status: 400 },
      );
    }

    const deal = searchParams.get('deal')?.slice(0, 20) || null;
    const type = searchParams.get('type')?.slice(0, 40) || null;
    const toFinitePrice = (v: string | null): number | null => {
      if (!v) return null;
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0 || n > 1e12) return null;
      return n;
    };
    const minPrice = toFinitePrice(searchParams.get('minPrice'));
    const maxPrice = toFinitePrice(searchParams.get('maxPrice'));
    // L-sec26: ids 파라미터 최대 100개로 cap (massive IN() 쿼리 방지)
    const idsRaw = searchParams.get('ids') || '';
    const idsParam = idsRaw.length > 2000 ? idsRaw.slice(0, 2000) : idsRaw;

    // 캐시 키 (소수점 3자리 ≒ 100m 오차)
    const q = (n: number) => n.toFixed(3);
    const key = `items:${q(swLat)},${q(swLng)}-${q(neLat)},${q(neLng)}:${deal || ''}:${type || ''}:${minPrice ?? ''}:${maxPrice ?? ''}:${idsParam}`;

    const result = await cached(
      key,
      async () => {
        const supabase = createServerClient();

        // ids 지정 시 해당 id 만 (클러스터 펼침 / 상세 카드용)
        if (idsParam) {
          const ids = idsParam
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n >= 0 && n <= 2_000_000_000)
            .slice(0, 100); // L-sec26: 100개 cap
          if (ids.length === 0) return { data: [], total: 0 };

          const { data, error } = await supabase
            .from('mv_map_listings')
            .select('*')
            .in('id', ids);
          if (error) throw error;
          return { data: data || [], total: (data || []).length };
        }

        // bounds 기반 조회
        let q2 = supabase
          .from('mv_map_listings')
          .select('*', { count: 'exact' })
          .gte('lat', swLat)
          .lte('lat', neLat)
          .gte('lng', swLng)
          .lte('lng', neLng);
        if (deal) q2 = q2.eq('deal', deal);
        if (type) q2 = q2.eq('type_normalized', type);
        if (minPrice != null) q2 = q2.gte('price_unified', minPrice);
        if (maxPrice != null) q2 = q2.lte('price_unified', maxPrice);

        const { data, error, count } = await q2
          .order('updated_at', { ascending: false, nullsFirst: false })
          .limit(ITEMS_LIMIT);
        if (error) throw error;

        return { data: data || [], total: count || 0 };
      },
      20_000,
      180_000,
      4_000,
    );

    if (!result) {
      return NextResponse.json(
        { success: true, data: [], total: 0, stale: true },
        { headers: { 'Cache-Control': 'no-cache' } },
      );
    }

    // mv_map_listings 는 이미 "공개" 만, thumb_url 포함 — 크롤링 매물 이미지 정책은
    // 원본 listings 테이블 기준이라 thumb_url 만 뽑은 MV 는 이미 "정책 통과한 썸네일" 인 셈.
    // 다만 안전을 위해 source_site 체크는 적용해둔다.
    type MvRow = Record<string, unknown> & { source_site?: string | null; thumb_url?: string | null };
    const sanitized = (result.data as MvRow[]).map((r) => {
      // applyImagePolicy 는 listing_images 배열을 가정 — 단일 thumb 를 그 형태로 일시 래핑
      const wrapped = {
        ...r,
        listing_images: r.thumb_url ? [{ url: r.thumb_url }] : [],
      };
      const policed = applyImagePolicy(wrapped);
      return {
        // G-83 (2026-05-04): sanitizePublicListing — address_detail/special_notes 등 제거.
        ...sanitizePublicListing(r as Record<string, any>),
        thumb_url: policed.listing_images?.[0]?.url || null,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: sanitized,
        total: result.total,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60',
        },
      },
    );
  } catch (error) {
    console.error('map/items 오류:', error);
    return NextResponse.json(
      { success: false, error: '개별 매물 조회 실패' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
