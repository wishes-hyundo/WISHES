import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';
import { fetchBuildingData, fetchExposureUnits, type BuildingUnit } from '@/app/api/admin/building-registry/route';
import { createServerClient } from '@/lib/supabase';
import { fetchRtmsSummary, type RtmsSummary } from '@/lib/external/realEstateRtms';

export const maxDuration = 30;

const ALLOWED_ROLES = new Set(['superadmin', 'master', 'crawler_bridge', 'internal_bearer']);
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';

interface KakaoAddress {
  address_name: string;
  b_code: string;
  main_address_no: string;
  sub_address_no: string;
}
interface KakaoResult { address: KakaoAddress; }

function withHardTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function resolveAddress(address: string) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const res = await withHardTimeout(
    fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }),
    3000,
    'kakao',
  );
  if (!res.ok) throw new Error(`Kakao API error: ${res.status}`);
  const json = await res.json();
  if (!json.documents || json.documents.length === 0) throw new Error('Kakao: address not found');
  const doc: KakaoResult = json.documents[0];
  const addr = doc.address;
  if (!addr || !addr.b_code) throw new Error('Kakao: no b_code in result');
  const bCode = addr.b_code;
  return {
    sigunguCd: bCode.substring(0, 5),
    bjdongCd: bCode.substring(5, 10),
    bun: (addr.main_address_no || '0').padStart(4, '0'),
    ji: (addr.sub_address_no || '0').padStart(4, '0'),
    bCode,
    fullAddress: addr.address_name,
  };
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CachedRow = {
  raw_data: { buildingData?: Record<string, string | number>; floors?: Array<Record<string, unknown>> } | null;
  units_data: BuildingUnit[] | null;
  fetched_at: string;
};

function findSelectedUnit(units: BuildingUnit[], reqDong: string, reqHo: string): BuildingUnit | null {
  if (!units.length || !reqHo) return null;
  const exact = units.find((u) => (!reqDong || u.dongNm === reqDong) && u.hoNm === reqHo);
  if (exact) return exact;
  const byHoOnly = units.find((u) => u.hoNm === reqHo);
  if (byHoOnly) return byHoOnly;
  const normHo = reqHo.replace(/호$/, '').trim();
  const byNumeric = units.find((u) => u.hoNm.replace(/호$/, '').trim() === normHo);
  return byNumeric || null;
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const address = sp.get('address');
  const reqDong = (sp.get('dongNm') || '').trim();
  const reqHo = (sp.get('hoNm') || '').trim();
  const lid = (sp.get('lid') || sp.get('listing_id') || '').trim();
  const wantRtms = sp.get('withRtms') === '1';

  if (!address) return NextResponse.json({ error: 'address parameter required' }, { status: 400 });

  try {
    const { sigunguCd, bjdongCd, bun, ji, bCode, fullAddress } = await resolveAddress(address);
    const platGbCd = '0';

    let buildingData: Record<string, string | number> = {};
    let floors: Array<Record<string, unknown>> = [];
    let units: BuildingUnit[] = [];
    let cacheStatus: 'hit' | 'miss' | 'stale' | 'none' = 'none';
    const debugInfo: string[] = [];

    const supabase = createServerClient();
    if (supabase) {
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
          2000,
          'cache',
        );
        const cached = (cacheRes as { data: CachedRow | null }).data;
        if (cached) {
          const fetchedMs = new Date(cached.fetched_at).getTime();
          const ageMs = Date.now() - fetchedMs;
          if (ageMs < CACHE_TTL_MS) {
            cacheStatus = 'hit';
            const raw = cached.raw_data || {};
            buildingData = raw.buildingData || {};
            floors = raw.floors || [];
            units = cached.units_data || [];
            debugInfo.push(`cache_hit (age ${Math.round(ageMs / 1000)}s)`);
          } else {
            cacheStatus = 'stale';
            debugInfo.push(`cache_stale (age ${Math.round(ageMs / 1000)}s)`);
          }
        } else {
          cacheStatus = 'miss';
        }
      } catch (e) {
        debugInfo.push(`cache_err: ${(e as Error).message}`);
      }
    }

    if (cacheStatus !== 'hit') {
      const [bdResult, unitsResult] = await Promise.all([
        withHardTimeout(
          fetchBuildingData(sigunguCd, bjdongCd, bun, ji, platGbCd, debugInfo),
          7000,
          'bd',
        ).catch((e) => {
          debugInfo.push(`bd_err: ${(e as Error).message}`);
          return { buildingData: {}, floors: [] };
        }),
        withHardTimeout(
          fetchExposureUnits(sigunguCd, bjdongCd, bun, ji, platGbCd, debugInfo),
          7000,
          'units',
        ).catch((e) => {
          debugInfo.push(`units_err: ${(e as Error).message}`);
          return [] as BuildingUnit[];
        }),
      ]);
      buildingData = bdResult.buildingData;
      floors = bdResult.floors;
      units = unitsResult;

      if (supabase && Object.keys(buildingData).length > 0) {
        try {
          await withHardTimeout(
            supabase.from('building_registry_cache').upsert({
              sigungu_cd: sigunguCd,
              bjdong_cd: bjdongCd,
              bun,
              ji,
              plat_gb_cd: platGbCd,
              raw_data: { buildingData, floors },
              units_data: units,
              fetched_at: new Date().toISOString(),
            }, { onConflict: 'sigungu_cd,bjdong_cd,bun,ji,plat_gb_cd' }),
            2000,
            'cache_upsert',
          );
        } catch (e) {
          debugInfo.push(`cache_upsert_err: ${(e as Error).message}`);
        }
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

    // Layer 8: same building cross-link
    let sameBuilding: Array<Record<string, unknown>> = [];
    if (supabase && fullAddress) {
      try {
        const addrPrefix = fullAddress.split(' ').slice(0, 3).join(' ');
        const sbRes = await withHardTimeout(
          supabase
            .from('listings')
            .select('id, listing_id, deal_type, building_type, area_m2, area_supply_m2, price, deposit, monthly_rent, building_dong, building_ho, floor_current, address')
            .like('address', addrPrefix + '%')
            .neq('id', lid && /^\d+$/.test(lid) ? parseInt(lid, 10) : -1)
            .eq('status', 'active')
            .limit(10),
          1500,
          'same_building',
        );
        const sbData = (sbRes as { data: unknown }).data;
        if (Array.isArray(sbData)) sameBuilding = sbData as Array<Record<string, unknown>>;
        debugInfo.push(`same_building: ${sameBuilding.length}`);
      } catch (e) {
        debugInfo.push(`same_building_err: ${(e as Error).message}`);
      }
    }

    // Layer 6: RTMS realestate transactions (?withRtms=1)
    let rtms: RtmsSummary | null = null;
    if (wantRtms && supabase && lid && /^\d+$/.test(lid)) {
      try {
        const lookup = await withHardTimeout(
          supabase
            .from('listings')
            .select('building_type, deal_type')
            .eq('id', parseInt(lid, 10))
            .maybeSingle(),
          1000,
          'rtms_listing',
        );
        const lrow = (lookup as { data: { building_type?: string; deal_type?: string } | null }).data;
        if (lrow && lrow.building_type) {
          rtms = await fetchRtmsSummary({
            sigunguCd,
            bjdongCd,
            bun,
            ji,
            buildingType: lrow.building_type,
            dealType: lrow.deal_type || 'sale',
          }).catch((e) => {
            debugInfo.push(`rtms_err: ${(e as Error).message}`);
            return null;
          });
        }
      } catch (e) {
        debugInfo.push(`rtms_lookup_err: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({
      success: true,
      query: { address, sigunguCd, bjdongCd, bun, ji, bCode, fullAddress, requestedDong: reqDong, requestedHo: reqHo },
      data: buildingData,
      floors,
      units,
      selected_unit: selectedUnit,
      same_building: sameBuilding,
      rtms,
      cache: cacheStatus,
      debugInfo,
      raw: {},
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg || 'Unknown error', query: { address } },
      { status: 500 },
    );
  }
}
