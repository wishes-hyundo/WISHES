import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';
import { fetchBuildingData, fetchExposureUnits, type BuildingUnit } from '@/lib/external/buildingRegistry';
import { fetchRtmsSummary, type RtmsSummary } from '@/lib/external/realEstateRtms';
import { createServerClient } from '@/lib/supabase';
import { captureError } from '@/lib/observe';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_ROLES = new Set(['superadmin', 'master', 'crawler_bridge', 'internal_bearer']);

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';

interface KakaoAddress {
  address_name: string;
  b_code: string;
  main_address_no: string;
  sub_address_no: string;
}

interface KakaoResult {
  address: KakaoAddress;
}

async function resolveAddress(address: string) {
  // L-fix-kakao-timeout (2026-04-28): timeout 없이 hang 가능 → 3s 강제
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 3000);
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    signal: ctrl.signal,
  }).finally(() => clearTimeout(tid));
  if (!res.ok) throw new Error(`Kakao API error: ${res.status}`);
  const json = await res.json();
  if (!json.documents || json.documents.length === 0) {
    throw new Error('Kakao: address not found');
  }
  const doc: KakaoResult = json.documents[0];
  const addr = doc.address;
  if (!addr || !addr.b_code) throw new Error('Kakao: no b_code in result');

  const bCode = addr.b_code;
  const sigunguCd = bCode.substring(0, 5);
  const bjdongCd = bCode.substring(5, 10);
  const bun = (addr.main_address_no || '0').padStart(4, '0');
  const ji = (addr.sub_address_no || '0').padStart(4, '0');

  return { sigunguCd, bjdongCd, bun, ji, bCode, fullAddress: addr.address_name };
}

// L-bldg-unit (2026-04-28): Supabase 24h 캐시 — 같은 건물의 여러 매물이 결과 공유
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function findSelectedUnit(
  units: BuildingUnit[],
  reqDong: string,
  reqHo: string,
): BuildingUnit | null {
  if (!units.length) return null;
  if (!reqHo) return null;
  const exact = units.find(
    (u) => (!reqDong || u.dongNm === reqDong) && u.hoNm === reqHo,
  );
  if (exact) return exact;
  const byHoOnly = units.find((u) => u.hoNm === reqHo);
  if (byHoOnly) return byHoOnly;
  const normHo = reqHo.replace(/호$/, '').trim();
  const byNumeric = units.find((u) => u.hoNm.replace(/호$/, '').trim() === normHo);
  return byNumeric || null;
}

// L-fix-hard-timeout (2026-04-28): 어느 단계도 hang 시 8초 강제 종료.
//   사장님 화면 영원히 '조회 중...' 멈춤 방지.
async function withHardTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`hard_timeout_${label}_${ms}ms`)), ms),
    ),
  ]);
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const address = sp.get('address');
  let reqDong = (sp.get('dongNm') || '').trim();
  let reqHo = (sp.get('hoNm') || '').trim();
  const lid = sp.get('lid') || sp.get('listing_id') || '';

  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }

  // L-bldg-unit (2026-04-28): lid 있고 dongNm/hoNm 비어있으면 DB 자동 조회
  if (lid && (!reqDong || !reqHo)) {
    const sb = createServerClient();
    if (sb) {
      const { data: lst } = await sb
        .from('listings')
        .select('building_dong, building_ho')
        .eq('id', parseInt(lid, 10))
        .maybeSingle();
      if (lst) {
        if (!reqDong && lst.building_dong) reqDong = String(lst.building_dong);
        if (!reqHo && lst.building_ho) reqHo = String(lst.building_ho);
      }
    }
  }

  try {
    const { sigunguCd, bjdongCd, bun, ji, bCode, fullAddress } = await withHardTimeout(
      resolveAddress(address), 4000, 'kakao'
    );
    const platGbCd = '0';

    let buildingData: Record<string, string | number> = {};
    let floors: Array<Record<string, unknown>> = [];
    let units: BuildingUnit[] = [];
    let cacheStatus: 'hit' | 'miss' | 'stale' | 'none' = 'none';
    const debugInfo: string[] = [];

    const supabase = createServerClient();
    if (supabase) {
      let cached: { raw_data?: unknown; units_data?: unknown; fetched_at?: string } | null = null;
      try {
        const cacheRes = await withHardTimeout(
          supabase
            .from('building_registry_cache')
            .select('raw_data, units_data, fetched_at')
            .eq('sigungu_cd', sigunguCd)
            .eq('bjdong_cd', bjdongCd)
            .eq('bun', bun)
            .eq('ji', ji)
            .eq('plat_gb_cd', platGbCd)
            .maybeSingle(),
          2000, 'cache_select'
        );
        cached = (cacheRes as { data: typeof cached }).data;
      } catch { cached = null; }

      if (cached) {
        const fetchedMs = new Date(cached.fetched_at as string).getTime();
        const ageMs = Date.now() - fetchedMs;
        if (ageMs < CACHE_TTL_MS) {
          cacheStatus = 'hit';
          const raw = cached.raw_data as { buildingData?: typeof buildingData; floors?: typeof floors };
          buildingData = raw?.buildingData || {};
          floors = raw?.floors || [];
          units = (cached.units_data as BuildingUnit[]) || [];
          debugInfo.push(`cache_hit (age ${Math.round(ageMs / 1000)}s)`);
        } else {
          cacheStatus = 'stale';
          debugInfo.push(`cache_stale (age ${Math.round(ageMs / 1000)}s) — refetch`);
        }
      } else {
        cacheStatus = 'miss';
      }
    }

    if (cacheStatus !== 'hit') {
      const [bdResult, unitsResult] = await withHardTimeout(
        Promise.all([
          fetchBuildingData(sigunguCd, bjdongCd, bun, ji, platGbCd, debugInfo),
          fetchExposureUnits(sigunguCd, bjdongCd, bun, ji, platGbCd, debugInfo),
        ]),
        7000, 'bldg_apis'
      ).catch((e) => {
        debugInfo.push('parallel timeout: ' + (e as Error).message);
        return [{ buildingData: {}, floors: [] }, [] as BuildingUnit[]] as const;
      });
      buildingData = bdResult.buildingData;
      floors = bdResult.floors;
      units = unitsResult;

      if (supabase && Object.keys(buildingData).length > 0) {
        await supabase
          .from('building_registry_cache')
          .upsert({
            sigungu_cd: sigunguCd,
            bjdong_cd: bjdongCd,
            bun,
            ji,
            plat_gb_cd: platGbCd,
            raw_data: { buildingData, floors },
            units_data: units,
            fetched_at: new Date().toISOString(),
          }, {
            onConflict: 'sigungu_cd,bjdong_cd,bun,ji,plat_gb_cd',
          });
      }
    }

    if (Object.keys(buildingData).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Building registry data not found',
        query: { address, sigunguCd, bjdongCd, bun, ji, bCode, fullAddress, dongNm: reqDong, hoNm: reqHo },
        debugInfo,
        cache: cacheStatus,
      });
    }

    const selectedUnit = findSelectedUnit(units, reqDong, reqHo);

    // L-bldg-unit Layer 6 (2026-04-28): RTMS 실거래가 시세
    //   기본 disabled (timeout 위험) — query ?withRtms=1 일 때만 또는 lid+빠른 경로.
    //   추후 lazy-load 별도 endpoint 로 분리 가능.
    let rtms: RtmsSummary | null = null;
    const wantRtms = sp.get('withRtms') === '1';
    if (wantRtms && lid && supabase) {
      try {
        const { data: lst } = await supabase
          .from('listings')
          .select('type, deal')
          .eq('id', parseInt(lid, 10))
          .maybeSingle();
        if (lst && lst.type && lst.deal) {
          // 3개월만 (속도 우선)
          rtms = await fetchRtmsSummary(String(lst.type), String(lst.deal), sigunguCd, 3);
        }
      } catch { /* silent */ }
    }

    // L-bldg-unit Layer 8 (2026-04-28): 같은 단지 (sigungu+bjdong+bun+ji) 의
    //   다른 wishes 매물 자동 grouping. 사장님이 한 건물의 매물 현황 한 눈에 파악.
    let sameBuilding: Array<{
      id: number; address: string | null; address_detail: string | null;
      type: string | null; deal: string | null; price: number | null;
      deposit: number | null; monthly: number | null;
      building_dong: string | null; building_ho: string | null;
      status: string | null;
    }> = [];
    if (supabase) {
      try {
        // 빠른 prefix 매칭만 (ilike % wildcard 제거 — index 활용)
        const addrPrefix = fullAddress.split(' ').slice(0, 3).join(' ');
        try {
          const sbRes = await withHardTimeout(
            supabase
              .from('listings')
              .select('id, address, address_detail, type, deal, price, deposit, monthly, building_dong, building_ho, status')
              .like('address', addrPrefix + '%')
              .neq('id', lid ? parseInt(lid, 10) : -1)
              .limit(10),
            1500, 'same_building'
          );
          sameBuilding = ((sbRes as { data: typeof sameBuilding }).data) || [];
        } catch { sameBuilding = []; }
      } catch { /* silent */ }
    }

    return NextResponse.json({
      success: true,
      query: {
        address, sigunguCd, bjdongCd, bun, ji, bCode, fullAddress,
        requestedDong: reqDong, requestedHo: reqHo,
      },
      data: buildingData,
      floors,
      units,
      selected_unit: selectedUnit,
      same_building: sameBuilding,
      rtms,
      cache: cacheStatus,
      raw: {},
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    captureError(err, { route: 'admin/building-registry-full', tags: { address: address.slice(0, 100) } });
    return NextResponse.json(
      { success: false, error: msg || 'Unknown error', query: { address } },
      { status: 500 },
    );
  }
}
