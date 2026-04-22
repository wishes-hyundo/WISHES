// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/map/clusters — 줌 레벨 기반 서버 클러스터링 RPC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 10만 건 대응 파이프라인의 핵심. 기존 /api/listings/map (전체 reset 다운로드)
// 대비 응답 바이트 1/50, Supabase 왕복 1회로 축소.
//
// 1) 카카오맵 zoom level → 서버 그리드 크기 매핑 (rpc_map_clusters SQL 에서 처리)
// 2) Quadkey quantization 된 bounds key 로 L1 캐시 히트
// 3) 개별 매물(zoom>=17) 은 sample_ids 로 id 3개까지 동봉 → 버블 클릭 시 상세 로드

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { cached } from '@/lib/cache';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

/**
 * bounds + zoom 을 Quadkey 해시로 양자화 (소수점 4자리 → 약 11m 오차)
 * 같은 양자화 키 요청은 캐시 1회 생성 후 재사용.
 */
function quantizeKey(
  swLat: number,
  swLng: number,
  neLat: number,
  neLng: number,
  zoom: number,
  filters: Record<string, string | null>,
): string {
  // zoom 별로 정밀도 조절 — 멀리 볼수록 러프하게
  const precision = zoom >= 15 ? 4 : zoom >= 12 ? 3 : zoom >= 9 ? 2 : 1;
  const q = (n: number) => n.toFixed(precision);
  const f = Object.entries(filters)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('|');
  return `clusters:${q(swLat)},${q(swLng)}-${q(neLat)},${q(neLng)}@z${zoom}${f ? ':' + f : ''}`;
}

export async function GET(request: NextRequest) {
  try {
    // L-sec75 (2026-04-22): 5s s-maxage + force-dynamic = unique bbox
    //   모두 DB hit. 5분 300회/IP cap (지도 팬/줌 헤비유저 고려).
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `clusters:ip:${_ip}`, limit: 300, windowMs: 5 * 60_000 });
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
    const zoomRaw = parseInt(searchParams.get('zoom') || '12', 10);

    // L-sec25 (2026-04-22): 공개 GET. 좌표/줌/가격을 범위 검증.
    //   한국 영토 여유 범위 + PostgREST/RPC 로 garbage 전달 차단.
    const inLat = (v: number) => Number.isFinite(v) && v >= -90 && v <= 90;
    const inLng = (v: number) => Number.isFinite(v) && v >= -180 && v <= 180;
    if (!inLat(swLat) || !inLat(neLat) || !inLng(swLng) || !inLng(neLng)) {
      return NextResponse.json(
        { success: false, error: 'bounds 파라미터 필요 (swLat/swLng/neLat/neLng/zoom)' },
        { status: 400 },
      );
    }
    const zoom = Number.isFinite(zoomRaw) ? Math.min(22, Math.max(1, zoomRaw)) : 12;

    const deal = searchParams.get('deal')?.slice(0, 20) || null;
    const type = searchParams.get('type')?.slice(0, 40) || null;
    const minPriceRaw = searchParams.get('minPrice');
    const maxPriceRaw = searchParams.get('maxPrice');
    const toFinitePrice = (v: string | null): number | null => {
      if (!v) return null;
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0 || n > 1e12) return null;
      return n;
    };
    const minPrice = toFinitePrice(minPriceRaw);
    const maxPrice = toFinitePrice(maxPriceRaw);

    const key = quantizeKey(swLat, swLng, neLat, neLng, zoom, {
      deal,
      type,
      minPrice: minPrice != null ? String(minPrice) : null,
      maxPrice: maxPrice != null ? String(maxPrice) : null,
    });

    const result = await cached(
      key,
      async () => {
        const supabase = createServerClient();
        const { data, error } = await supabase.rpc('rpc_map_clusters', {
          sw_lat: swLat,
          sw_lng: swLng,
          ne_lat: neLat,
          ne_lng: neLng,
          zoom,
          p_deal: deal,
          p_type: type,
          p_min_price: minPrice,
          p_max_price: maxPrice,
        });
        if (error) throw error;
        return data || [];
      },
      15_000,   // fresh 15초
      120_000,  // stale 2분
      4_000,    // 4초 타임아웃
    );

    if (!result) {
      // DB 타임아웃 → 빈 결과 반환해 UI 블록 방지
      return NextResponse.json(
        { success: true, data: [], total: 0, stale: true },
        { headers: { 'Cache-Control': 'no-cache' } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: result,
        total: result.length,
        zoom,
      },
      {
        headers: {
          // CDN 5초 캐시 + 30초 SWR (Vercel edge)
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30',
        },
      },
    );
  } catch (error) {
    console.error('map/clusters 오류:', error);
    return NextResponse.json(
      { success: false, error: '클러스터 조회 실패' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
