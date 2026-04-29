// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/listings/[id] - 매물 상세 조회
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// L-Phase2 (2026-04-29): /map 통합 — 전유부 (전용/공용/총면적) 응답에 포함.
//   listing.building_dong + listing.building_ho 가 있으면 building_registry_cache
//   에서 selected_unit 조회. 사장님 정책 보편 로직 + /search↔/map 파이프라인 통합.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { filterSelfHosted } from '@/lib/image-policy';
import { stripInternalFields, sanitizePublicListing } from '@/lib/listing-public';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';

interface UnitRow {
  dongNm: string;
  hoNm: string;
  flrNo: string;
  flrNoNm: string;
  exclusiveArea: number;
  commonArea: number;
  totalArea: number;
  mainPurpsCdNm: string;
  etcPurps: string;
  strctCdNm: string;
}

interface CachedRow {
  units_data: UnitRow[] | null;
  fetched_at: string;
}

/**
 * L-addr-sanitize (2026-04-29): Kakao geocoder 가 인식할 수 있도록 주소 정제.
 *   사장님 명령: "전용/공급 면적 계속 Null"
 *   원인: "서울 관악구 신림동 1423-3 로사이신림 4층 403호" 처럼 건물명+층+호가
 *         붙은 풀 주소를 Kakao 에 보내면 b_code 매칭 실패 → cache lookup miss.
 *   대책: 지번/도로명 부분만 남기고 건물명/층/호 suffix 제거.
 */
function sanitizeAddressForKakao(addr: string): string {
  if (!addr) return '';
  let s = String(addr).trim();
  // 1) "N층 N호" 또는 "지하 N층" 부분 제거
  s = s.replace(/\s+(?:지하\s*)?\d+\s*층(?:\s+\d+\s*호)?\s*$/g, '');
  s = s.replace(/\s+\d+\s*호\s*$/g, '');
  // 2) "동" 단위 제거 (예: "101동 1502호")
  s = s.replace(/\s+\d+\s*동(?:\s+\d+\s*호)?\s*$/g, '');
  // 3) 지번 패턴(NNN-NN 또는 NNN) 까지만 남기기 — 그 뒤 건물명 제거
  //    한국 주소는 "시 구 동 NNN[-NN] [건물명]" 형식.
  const m = s.match(/^(.+?\s+\d{1,5}(?:-\d{1,5})?)(\s+[^0-9].*)?$/);
  if (m) s = m[1];
  return s.trim();
}

/**
 * L-bldg-unit-extract (2026-04-29): 주소 텍스트에서 동/호 추출.
 *   사장님 명령: 전유부 주용도가 표제부 주용도보다 정확. building_ho 컬럼이 null 이어도
 *   address 텍스트에서 호수 자동 추출 → units_data 매칭 → 전유부 주용도 노출.
 *   v306 patch (content-v306-bldg-unit) 와 동일 정규식.
 */
function extractDongHoFromAddress(addr: string): { dongNm: string; hoNm: string } {
  if (!addr) return { dongNm: '', hoNm: '' };
  const s = String(addr);
  let dongNm = '';
  let hoNm = '';
  const dm = s.match(/(\d{1,4})\s*동(?!시|구|군|도)/);
  if (dm) dongNm = dm[1];
  const hoMatches = s.match(/(\d{1,5})\s*호(?:\s|$)/g);
  if (hoMatches && hoMatches.length > 0) {
    const lastHo = hoMatches[hoMatches.length - 1];
    const m = lastHo.match(/(\d{1,5})/);
    if (m) hoNm = m[1];
  }
  return { dongNm, hoNm };
}

/**
 * 주소 → (sigunguCd, bjdongCd, bun, ji) 빠른 변환 (Kakao 1회).
 * 1.5s 타임아웃. 실패 시 null — 전유부 enrich 만 skip, 매물 응답엔 영향 X.
 */
async function quickResolve(address: string): Promise<
  { sigunguCd: string; bjdongCd: string; bun: string; ji: string } | null
> {
  if (!KAKAO_REST_API_KEY || !address) return null;
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      {
        headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
        signal: AbortSignal.timeout(1500),
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { documents?: Array<{ address?: { b_code?: string; main_address_no?: string; sub_address_no?: string } }> };
    const a = j.documents?.[0]?.address;
    if (!a?.b_code) return null;
    return {
      sigunguCd: a.b_code.substring(0, 5),
      bjdongCd: a.b_code.substring(5, 10),
      bun: (a.main_address_no || '0').padStart(4, '0'),
      ji: (a.sub_address_no || '0').padStart(4, '0'),
    };
  } catch {
    return null;
  }
}

/**
 * units_data 에서 listing.building_dong / building_ho 매칭. v306 와 동일 로직.
 */
function findUnit(units: UnitRow[], reqDong: string, reqHo: string): UnitRow | null {
  if (!units.length || !reqHo) return null;
  const exact = units.find((u) => (!reqDong || u.dongNm === reqDong) && u.hoNm === reqHo);
  if (exact) return exact;
  const byHo = units.find((u) => u.hoNm === reqHo);
  if (byHo) return byHo;
  const norm = reqHo.replace(/호$/, '').trim();
  return units.find((u) => u.hoNm.replace(/호$/, '').trim() === norm) || null;
}

/**
 * 매물 상세 조회 (이미지, 특징, 전유부 포함)
 * @param id - 매물 ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // L-sec79 (2026-04-22): 캐시 없음. id 순회 scraping 방지.
    //   5분 300회/IP cap (정상 상세 페이지 수십 회/세션).
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `listing-detail:ip:${_ip}`, limit: 300, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: '요청이 너무 많습니다.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { id } = await params;
    const listingId = parseInt(id, 10);

    // L-sec33 (2026-04-22): isNaN 만 체크하면 Infinity/음수/거대 수 통과. 정수 범위 검증.
    if (!Number.isFinite(listingId) || listingId < 0 || listingId > 2_000_000_000) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 매물 조회
    // L-sec91 (2026-04-22): IDOR 차단. status='공개' 없이는
    //   익명 사용자가 ID 열거로 임시저장/비공개/삭제 매물 조회 가능했음.
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .eq('status', '공개')
      .single();

    if (listingError || !listing) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // ※ 저작권 보호 + 자체 업로드 통과
    //   - 크롤링 매물의 외부 원본 이미지는 차단
    //   - 중개사가 직접 올린 자체 업로드 이미지(wishes.co.kr, supabase, R2)는 통과 → 광고 노출
    const isCrawled = !!(listing as any).source_site;
    const { data: rawImages = [] } = await supabase
      .from('listing_images')
      .select('*')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true });
    const images = isCrawled ? filterSelfHosted(rawImages || []) : (rawImages || []);

    // 특징 조회
    const { data: features = [] } = await supabase
      .from('listing_features')
      .select('feature')
      .eq('listing_id', listingId);

    // L-Phase2 (2026-04-29): 전유부 enrich
    //   listing.building_ho 있으면 building_registry_cache 조회 → selected_unit 매칭.
    //   캐시 hit 90%+ (prewarm-bldg-cache cron 이 6h 마다 prefill).
    //   miss 시 Kakao 1.5s 타임아웃 → cache row 검색 → fail 시 전유부 응답엔 X (ListingDetailModal 자연스럽게 hide).
    let unitEnrich: {
      exclusive_area_m2: number | null;
      common_area_m2: number | null;
      total_area_m2: number | null;
      unit_dong: string | null;
      unit_ho: string | null;
      unit_floor: string | null;
      unit_purpose: string | null;
      unit_structure: string | null;
    } | null = null;
    // L-bldg-purpose (2026-04-29 사장님 명령): 표제부 (raw_data.buildingData) 정보를
    //   항상 조회 — building_ho 없는 매물(원룸/단독/일반룸 등)도 주용도/단지명 노출.
    //   사장님: "뜬금없이 신림동 4/16층 나오지 말고 주용도가 나와야지"
    let buildingTitleEnrich: {
      buildingPurpose: string | null;
      buildingName: string | null;
      totalFloors: number | null;
      approvalDate: string | null;
    } | null = null;
    try {
      let reqDong = String((listing as any).building_dong || '').trim();
      let reqHo = String((listing as any).building_ho || '').trim();
      const addr = String((listing as any).address || '').trim();
      // L-bldg-unit-extract: 컬럼이 비어있으면 address 텍스트에서 추출
      if (!reqHo) {
        const ext = extractDongHoFromAddress(addr);
        if (!reqDong) reqDong = ext.dongNm;
        reqHo = ext.hoNm;
      }
      if (addr) {
        // L-addr-sanitize: Kakao 매칭률 향상 — 건물명/층/호 suffix 제거
        const addrForKakao = sanitizeAddressForKakao(addr);
        const r = await quickResolve(addrForKakao || addr);
        if (r) {
          // 1.5s 타임아웃 — cache 는 ms 단위 응답이므로 충분.
          const cacheLookup = supabase
            .from('building_registry_cache')
            .select('units_data, raw_data, fetched_at')
            .eq('sigungu_cd', r.sigunguCd)
            .eq('bjdong_cd', r.bjdongCd)
            .eq('bun', r.bun)
            .eq('ji', r.ji)
            .eq('plat_gb_cd', '0')
            .maybeSingle();
          const { data: cached } = (await Promise.race([
            cacheLookup,
            new Promise((_, rej) => setTimeout(() => rej(new Error('cache_timeout')), 1500)),
          ])) as { data: (CachedRow & { raw_data?: any }) | null };
          // 1) units_data 가 있고 building_ho 매칭 가능하면 unit-level enrich
          if (reqHo && cached?.units_data && Array.isArray(cached.units_data)) {
            const sel = findUnit(cached.units_data as UnitRow[], reqDong, reqHo);
            if (sel) {
              unitEnrich = {
                exclusive_area_m2: sel.exclusiveArea ?? null,
                common_area_m2: sel.commonArea ?? null,
                total_area_m2: sel.totalArea ?? null,
                unit_dong: sel.dongNm || null,
                unit_ho: sel.hoNm || null,
                unit_floor: sel.flrNoNm || (sel.flrNo ? `${sel.flrNo}층` : null),
                // L-bldg-unit-purpose (2026-04-29 사장님 명령):
                //   "전유부 주용도가 더 정확. 이걸 기준으로 가야되지 않아?"
                //   표제부(공동주택) 보다 전유부 주용도(아파트/오피스텔/다세대 등) 우선.
                unit_purpose: sel.mainPurpsCdNm || null,
                unit_structure: sel.strctCdNm || null,
              };
            }
          }
          // 2) raw_data.buildingData — 건물 표제부 (주용도/단지명/총층/사용승인) 항상 사용 가능.
          const bd = cached?.raw_data?.buildingData;
          if (bd && typeof bd === 'object') {
            buildingTitleEnrich = {
              buildingPurpose: bd.buildingPurpose || bd.mainPurpose || null,
              buildingName: bd.buildingName || null,
              totalFloors: bd.totalFloors ? parseInt(String(bd.totalFloors), 10) || null : null,
              approvalDate: bd.approvalDate || null,
            };
          }
        }
      }
    } catch (e) {
      // enrich 실패해도 매물 응답엔 영향 X.
      console.warn('[listings/[id]] enrich skipped:', (e as Error).message);
    }

    // 고객용 응답: 크롤링 원본 description 제외, ai_description만 노출
    // L-sec64 (2026-04-22): embedding + dedup_* 등 내부 필드 strip
    // L-sec96 (2026-04-22): sanitizePublicListing 추가 — FORBIDDEN_PUBLIC_KEYS
    //   (source_url/contact/source_id/raw_fields/special_notes 등) 응답
    //   누출 차단. 백엔드에서 정책 일관적 적용.
    // L-rawfields-extract (2026-04-29): raw_fields 의 일부 정규화된 텍스트 추출.
    //   sanitize 가 raw_fields 자체는 strip 하지만 추출된 텍스트는 별도 필드로 응답에 포함.
    const rf = (listing as any).raw_fields || {};
    const rawExtract: Record<string, string | null> = {
      raw_rooms_text: typeof rf['룸/욕실수'] === 'string' ? rf['룸/욕실수'] : (typeof rf['룸/욕실'] === 'string' ? rf['룸/욕실'] : null),
      raw_maintenance_text: typeof rf['월관리비'] === 'string' ? rf['월관리비'] : (typeof rf['관리비'] === 'string' ? rf['관리비'] : null),
      raw_parking_text: typeof rf['주차대수'] === 'string' ? rf['주차대수'] : null,
      raw_structure_text: typeof rf['구조형태'] === 'string' ? rf['구조형태'] : null,
      raw_lease_text: typeof rf['임대기간'] === 'string' ? rf['임대기간'] : null,
    };

    // L-modal-area (2026-04-29): 면적 fallback (raw_fields).
    //   사장님 명령: "전용/공급 면적도 안채워지고 있잖아"
    //   listing.area_m2 / area_supply_m2 / unitEnrich 가 모두 비면 raw_fields 에서 추출.
    const parseM2 = (v: any): number | null => {
      if (v == null) return null;
      const m = String(v).match(/(\d+(?:\.\d+)?)/);
      if (!m) return null;
      const n = parseFloat(m[1]);
      return isNaN(n) || n <= 0 ? null : n;
    };
    const rfExclusive = parseM2(rf['전용면적']) ?? parseM2(rf['전용 면적']) ?? parseM2(rf['전용']) ?? null;
    const rfSupply = parseM2(rf['공급면적']) ?? parseM2(rf['공급 면적']) ?? parseM2(rf['공급']) ?? parseM2(rf['분양면적']) ?? null;
    const rfCommon = parseM2(rf['공용면적']) ?? parseM2(rf['공용 면적']) ?? parseM2(rf['공용']) ?? null;
    const rfTotal = parseM2(rf['연면적']) ?? parseM2(rf['총면적']) ?? null;
    // 최종 resolved: DB 컬럼 → 정부 캐시(unitEnrich) → raw_fields
    const dbExclusive = (listing as any).area_m2 && (listing as any).area_m2 > 0 ? (listing as any).area_m2 : null;
    const dbSupply = (listing as any).area_supply_m2 && (listing as any).area_supply_m2 > 0 ? (listing as any).area_supply_m2 : null;
    const areaResolved = {
      area_m2_resolved: dbExclusive ?? unitEnrich?.exclusive_area_m2 ?? rfExclusive ?? null,
      area_supply_m2_resolved: dbSupply ?? rfSupply ?? null,
      area_common_m2_resolved: unitEnrich?.common_area_m2 ?? rfCommon ?? null,
      area_total_m2_resolved: unitEnrich?.total_area_m2 ?? rfTotal ?? null,
    };
    // L-bldg-purpose: 주용도/단지명/총층 resolved
    //   우선순위: (1) DB 컬럼 → (2) 전유부 unit.mainPurpsCdNm (가장 정확)
    //              → (3) 표제부 buildingPurpose (공동주택 같은 큰 분류) → null
    //   사장님 명령: "전유부 보면 아파트가 주용도인데 이걸 기준으로 가야되지 않아?"
    const buildingPurposeResolved =
      ((listing as any).building_purpose || '').trim() ||
      unitEnrich?.unit_purpose ||
      buildingTitleEnrich?.buildingPurpose ||
      null;
    const buildingNameResolved =
      ((listing as any).building_name || '').trim() ||
      buildingTitleEnrich?.buildingName ||
      null;
    const floorTotalResolved =
      ((listing as any).floor_total != null && (listing as any).floor_total !== '')
        ? (listing as any).floor_total
        : (buildingTitleEnrich?.totalFloors ?? null);
    const usageApprovedResolved =
      ((listing as any).usage_approved || '').trim() ||
      buildingTitleEnrich?.approvalDate ||
      null;

    const { description: _rawDesc, ...rest } = listing as Record<string, unknown>;
    const publicListing = sanitizePublicListing(stripInternalFields(rest));

    return NextResponse.json({
      success: true,
      data: {
        ...publicListing,
        ...rawExtract,
        ...(unitEnrich || {}),
        ...areaResolved,
        // L-bldg-purpose (2026-04-29): 표제부 resolved 필드 (모달 H1 등)
        building_purpose_resolved: buildingPurposeResolved,
        building_name_resolved: buildingNameResolved,
        floor_total_resolved: floorTotalResolved,
        usage_approved_resolved: usageApprovedResolved,
        images: images || [],
        features: features?.map((f: any) => f.feature) || [],
      },
    });
  } catch (error) {
    console.error('매물 상세 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}
