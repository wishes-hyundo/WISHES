// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/by-ids — id 리스트로 매물 일괄 조회
//
// L-clusterexact3 (2026-04-24 pm):
//   클러스터 클릭 시 sample_ids 전체 (count <= 30) 를 정확히 fetch.
//   viewport API 는 bbox 기반이라 useViewport limit 4000 로 일부 id 가 누락될 수
//   있음 — 이 엔드포인트는 id IN (...) 직접 조회로 100% 정확.
//
// 응답 shape: /api/listings/viewport 와 동일한 { listings: MapListing[] }.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { maskAddressForPublic } from '@/lib/publicAddress';
import { isSelfHostedImage } from '@/lib/image-policy';
// L-listing-byids-mask1 (2026-05-02): 비로그인 110m 마스킹 (다른 listing endpoint 와 일관)
import { maskCoordinate } from '@/lib/coordinateMask';
// L-cluster-token1 (사장님 명령 2026-05-02) — viewport 와 동일 정의.
function buildClusterToken(
  buildingName: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  // M-2 (사장님 명령 2026-05-02): 좌표 hash 우선 — 같은 위치 매물 무조건 합치기.
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return 'c' + lat.toFixed(3) + '_' + lng.toFixed(3);
  }
  if (buildingName) {
    const norm = String(buildingName).replace(/\s+/g, ' ').trim();
    if (norm) {
      let h = 0x811c9dc5 >>> 0;
      for (let i = 0; i < norm.length; i++) {
        h ^= norm.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return 'b' + h.toString(36).padStart(7, '0');
    }
  }
  return null;
}
import type { MapListing } from '@/features/map-2026/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const MAX_IDS = 30;

export async function GET(request: NextRequest) {
  try {
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `listings-by-ids:ip:${_ip}`, limit: 300, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids') || '';
    const ids = idsParam
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 1e9)
      .slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json({ listings: [] });
    }

    // authed 판정 — viewport 와 동일 패턴
    let authed = false;
    const auth = request.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) {
      try {
        const supabase = createServerClient();
        const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
        authed = !!user;
      } catch { /* guest */ }
    }

    const supabase = createServerClient();
    const { data: rows, error } = await supabase
      .from('mv_map_listings')
      .select(
        'id, lat, lng, deal, type, deposit, monthly, price, area_m2, rooms, bathrooms, floor_current, floor_total, direction, station_distance, built_year, building_name, dong, address, title, ai_title, thumb_url, features, parking, pet, elevator, full_option, maintenance_fee, business_type, has_video, source_site, created_at, updated_at',
      )
      .in('id', ids);

    if (error || !rows) {
      console.warn('[listings/by-ids] query failed', error);
      return NextResponse.json({ listings: [] });
    }

    const listings: MapListing[] = rows.map((r: Record<string, unknown>) => {
      const thumb_url = r.thumb_url as string | null;
      const source_site = r.source_site as string | null;
      const title = r.title as string | null;
      const dong = r.dong as string | null;
      const _lat = Number(r.lat);
      const _lng = Number(r.lng);
      // M-6 (사장님 명령 2026-05-02 — 직방/네이버 표준):
      //   메인 지도는 raw 좌표 사용. privacy 보호 = 줌 락 + 매물 modal 미니맵 100m 반경.
      const _coords: { lat: number | null; lng: number | null } =
        (Number.isFinite(_lat) && Number.isFinite(_lng))
          ? { lat: _lat, lng: _lng }
          : { lat: null, lng: null };
      return {
        id: r.id as number,
        lat: _coords.lat as number,
        lng: _coords.lng as number,
        deal: r.deal as MapListing['deal'],
        type: (r.type as string) ?? null,
        deposit: (r.deposit as number | null) ?? null,
        monthly: (r.monthly as number | null) ?? null,
        price: (r.price as number | null) ?? null,
        area_m2: (r.area_m2 as number | null) ?? null,
        rooms: (r.rooms as number | null) ?? null,
        bathrooms: (r.bathrooms as number | null) ?? null,
        floor_current: (r.floor_current as string | null) ?? null,
        floor_total: (r.floor_total as string | null) ?? null,
        direction: (r.direction as string | null) ?? null,
        station_distance: (r.station_distance as number | null) ?? null,
        built_year: (r.built_year as string | null) ?? null,
        building_name: authed ? ((r.building_name as string | null) ?? null) : null,
        // L-cluster-token1: 비로그인 단지 그룹화 가능 (이름 가림, hash 만)
        cluster_token: buildClusterToken(r.building_name as string | null | undefined, _lat, _lng),
        dong: dong ?? null,
        address: (r.address as string | null) ?? null,
        title: authed
          ? (title ?? null)
          : (title ? maskAddressForPublic(title, dong) : (dong ?? null)),
        ai_title: (r.ai_title as string | null) ?? null,
        thumbnail_url: (() => {
          if (!thumb_url) return null;
          if (!source_site) return thumb_url;
          return isSelfHostedImage(thumb_url) ? thumb_url : null;
        })(),
        features: Array.isArray(r.features) ? (r.features as string[]) : [],
        photo_count: thumb_url && !source_site ? 1 : 0,
        parking: (r.parking as string | null) ?? null,
        pet: (r.pet as boolean | null) ?? null,
        elevator: (r.elevator as boolean | null) ?? null,
        full_option: (r.full_option as boolean | null) ?? null,
        maintenance_fee: (r.maintenance_fee as number | null) ?? null,
        business_type: (r.business_type as string | null) ?? null,
        has_video: !!r.has_video,
        median_price: null,
        median_deviation: null,
        hero_score: 0,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      };
    });

    return NextResponse.json(
      { listings },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  } catch (e) {
    console.error('[listings/by-ids] fatal', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
