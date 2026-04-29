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
    } | null = null;
    try {
      const reqDong = String((listing as any).building_dong || '').trim();
      const reqHo = String((listing as any).building_ho || '').trim();
      const addr = String((listing as any).address || '').trim();
      if (reqHo && addr) {
        const r = await quickResolve(addr);
        if (r) {
          // 1.5s 타임아웃 — cache 는 ms 단위 응답이므로 충분.
          const cacheLookup = supabase
            .from('building_registry_cache')
            .select('units_data, fetched_at')
            .eq('sigungu_cd', r.sigunguCd)
            .eq('bjdong_cd', r.bjdongCd)
            .eq('bun', r.bun)
            .eq('ji', r.ji)
            .eq('plat_gb_cd', '0')
            .maybeSingle();
          const { data: cached } = (await Promise.race([
            cacheLookup,
            new Promise((_, rej) => setTimeout(() => rej(new Error('cache_timeout')), 1500)),
          ])) as { data: CachedRow | null };
          if (cached?.units_data && Array.isArray(cached.units_data)) {
            const sel = findUnit(cached.units_data as UnitRow[], reqDong, reqHo);
            if (sel) {
              unitEnrich = {
                exclusive_area_m2: sel.exclusiveArea ?? null,
                common_area_m2: sel.commonArea ?? null,
                total_area_m2: sel.totalArea ?? null,
                unit_dong: sel.dongNm || null,
                unit_ho: sel.hoNm || null,
                unit_floor: sel.flrNoNm || (sel.flrNo ? `${sel.flrNo}층` : null),
              };
            }
          }
        }
      }
    } catch (e) {
      // enrich 실패해도 매물 응답엔 영향 X — 전유부 row 만 사라짐.
      console.warn('[listings/[id]] unit enrich skipped:', (e as Error).message);
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

    const { description: _rawDesc, ...rest } = listing as Record<string, unknown>;
    const publicListing = sanitizePublicListing(stripInternalFields(rest));

    return NextResponse.json({
      success: true,
      data: {
        ...publicListing,
        ...rawExtract,
        ...(unitEnrich || {}),
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
