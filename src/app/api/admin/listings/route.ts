// Admin API: GET, POST, PUT /api/admin/listings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { isSelfHostedImage, filterSelfHosted, preferSelfHostedImages } from '@/lib/image-policy';
import { adminCorsHeaders } from '@/lib/cors';

import { revalidatePath, unstable_cache, revalidateTag } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
// L-geocode1 (2026-04-23): 신규 매물/수정 시 서버단 자동 지오코딩 — lat/lng 누락 영구 차단.
import { geocodeAddress } from '@/lib/geocode';
import { z } from 'zod';
import { createHash } from 'crypto';
// L-hub3 (2026-04-22): Zod 공용 스키마 허브 이관.
//   priceWonSchema/areaSqmSchema 는 cap 값 일관성(1조원/10만㎡) 을 보장.
import { priceWonSchema, areaSqmSchema, latitudeSchema, longitudeSchema } from '@/lib/schemas';

// L-sec10 (2026-04-22): 기존 하드코드 '*' 는 browser-based CSRF 창구였음.
// 외부 크롤러는 서버-투-서버 fetch 라 CORS 영향 없음. 화이트리스트로 축소.
// L-importorder1 (2026-04-24): OPTIONS 함수를 imports 뒤로 이동 — 이전엔 함수
//   선언이 imports 중간에 있어 webpack/swc 파서가 뒤쪽 imports 를 module-level
//   로 인식 못 해 '@/lib/supabase', '@/lib/adminAuth', '@/lib/geocode' Module
//   not found 로 빌드 실패.  이 순서 수정만으로 해결.
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: adminCorsHeaders(req, 'GET, POST, PUT, OPTIONS') });
}

// L-search4 (2026-04-24): 어드민 리스트 조회는 전체 6,200+ 매물을 7페이지로
//   paginate 하므로 vercel.json 의 기본 10s 로는 좁음. 30s 로 확장.
export const maxDuration = 60;

// 요청 검증 스키마
// L-hub3: price/area/lat/lng 필드를 hub 기반으로 통일.
const createListingSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  type: z.enum(['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실']),
  deal: z.enum(['전세', '월세', '매매']),
  deposit: priceWonSchema.default(0),
  monthly: priceWonSchema.optional().nullable(),
  price: priceWonSchema.optional().nullable(),
  maintenance_fee: priceWonSchema.default(0).optional(),
  maintenance_includes: z.array(z.string()).optional().nullable(),
  area_m2: areaSqmSchema.refine((v) => v > 0, 'area must be positive'),
  area_supply_m2: areaSqmSchema.refine((v) => v > 0).optional().nullable(),
  area_land_m2: areaSqmSchema.refine((v) => v > 0).optional().nullable(),
  floor_current: z.string().optional().nullable(),
  floor_total: z.string().optional().nullable(),
  rooms: z.number().int().positive().optional().nullable(),
  bathrooms: z.number().int().positive().optional().nullable(),
  direction: z.string().optional().nullable(),
  heating_type: z.string().optional().nullable(),
  address: z.string().min(1),
  address_detail: z.string().optional().nullable(),
  dong: z.string().min(1),
  lat: latitudeSchema.optional().nullable(),
  lng: longitudeSchema.optional().nullable(),
  description: z.string().optional().nullable(),
  available_date: z.string().optional().nullable(),
  built_year: z.string().optional().nullable(),
  parking: z.boolean().default(false).optional(),
  elevator: z.boolean().default(false).optional(),
  pet: z.boolean().default(false).optional(),
  balcony: z.boolean().default(false).optional(),
  full_option: z.boolean().default(false).optional(),
  loan_available: z.boolean().default(true).optional(),
  business_type: z.string().optional().nullable(),
  goodwill_fee: z.number().int().nonnegative().optional().nullable(),
  vat_included: z.boolean().optional().nullable(),
  station_name: z.string().optional().nullable(),
  station_distance: z.number().int().nonnegative().optional().nullable(),
  usage_approved: z.string().optional().nullable(),
  electric_capacity: z.string().optional().nullable(),
  signage_available: z.boolean().optional().nullable(),
  meeting_room: z.number().int().nonnegative().optional().nullable(),
  // 상업용 업종 정보
  previous_business: z.string().optional().nullable(),
  recommended_business: z.string().optional().nullable(),
  restricted_business: z.string().optional().nullable(),
  parking_spaces: z.number().int().nonnegative().optional().nullable(),
  // 크롤링 출처 정보
  source_site: z.string().optional().nullable(),
  source_id: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  building_name: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  // L-contacts-jsonb (2026-04-29 사장님 명령): 관계자 연락처 (JSONB 배열).
  //   [{role, name, phone, memo}] — v240 모달 [+ 추가] 버튼이 PUT 으로 저장.
  contacts: z.array(z.object({
    role: z.string().max(40),
    name: z.string().max(40).optional().nullable(),
    phone: z.string().max(40),
    memo: z.string().max(200).optional().nullable(),
  })).max(50).optional().nullable(),
  lease_period: z.string().optional().nullable(),
  rights_fee: z.number().int().nonnegative().optional().nullable(),
  // L-status1 (2026-04-23): API 기본 status 를 UI 체계와 통일.
  //   이전: z.enum(['가용', '계약중', '계약완료']).default('가용')
  //   문제: UI StatusFilter 는 '공개'|'비공개'|'계약중'|'계약완료' 만 사용.
  //         '가용' 은 API 전용 phantom 값이라 API 로 업로드된 매물은 모두
  //         status='가용' 으로 박혔고, mv_map_listings 의 status='공개' 필터로
  //         /map 에서 영영 사라짐.  /search 관리자 뷰는 status 무관 표시라 보임.
  status: z.enum(['공개', '비공개', '계약중', '계약완료']).default('공개').optional(),
  images: z.array(z.string()).optional(),
  // 신규 필드 (2026-04-12 추가)
  gu: z.string().optional().nullable(),
  entrance_type: z.string().optional().nullable(),
  features: z.array(z.string()).optional().nullable(),
  parking_fee: z.number().int().nonnegative().optional().nullable(),
  building_purpose: z.string().optional().nullable(),
  previous_brand: z.string().optional().nullable(),
  commission_fee: z.number().int().nonnegative().optional().nullable(),
  special_notes: z.string().optional().nullable(),
    // 크롤러 v14 신규 필드 (2026-04-13 추가)
    base_price: z.number().int().optional().nullable(),
    registered_date: z.string().optional().nullable(),
    last_confirmed: z.string().optional().nullable(),
    photo_count: z.number().int().optional().nullable(),
    grade: z.string().optional().nullable(),
    building_listings: z.string().optional().nullable(),
    listing_images: z.array(z.string()).optional().nullable(),
    area_pyeong: z.number().optional().nullable(),
    floor_info: z.string().optional().nullable(),
    // L-detail-schema (2026-04-24): 상세 카드 v2 필드.
    room_layout: z.enum(['분리형', '일체형', '복층']).optional().nullable(),
    is_duplex: z.boolean().optional().nullable(),
    illegal_building: z.boolean().optional().nullable(),
    last_verified_at: z.string().optional().nullable(),
    total_parking_spaces: z.number().int().nonnegative().optional().nullable(),
});

/**
 * 인증 검증 헬퍼 — L-sec2 (2026-04-22):
 *   박제 'wishes2026' + 단순 쿼리 token 우회를 제거하고
 *   공용 adminAuth.verifyAdminAuth (env 마스터 + CRAWLER_BRIDGE + JWT서명+role)
 *   로 통일. 이 래퍼는 호출부 diff 를 최소화하기 위한 얇은 shim.
 */
async function verifyAuth(request: NextRequest): Promise<boolean> {
  return verifyAdminAuth(request);
}

/**
 * GET /api/admin/listings - 모든 매물 조회 (관리자용)
 *
 * Query params:
 *   ?fields=minimal  → 목록용 경량 응답 (이미지 1개만, 불필요 필드 제외)
 *   (기본)           → 전체 필드 + 전체 이미지
 *
 * ⚠️ Supabase 기본 1000행 제한 → .range()로 전체 조회
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const fields = searchParams.get('fields');

    // L-v7-p3 (2026-04-22): GET scope=mine 서버 파이프라인
    // Authorization Bearer (admin_bridge_ prefix 허용) 에서 auth.getUser() 로
    // UID 추출 후 created_by 필터. UID 미획득 시 빈 결과+scope_auth:'failed'.
    //
    // L-crit1 (2026-04-23): scope=mine UID 추출 실패 시 빈 배열 반환이
    //   "전체 매물 0건 회귀" 로 이어짐. 사용자 보고: /search 에 매물등록됐던 게 전부 0.
    //   재발성 이슈. verifyAuth 가 이미 어드민 권한을 보장하므로 UID 실패 시
    //   scope=all 로 degrade 해 최소한 매물이 보이게 복구. 응답에
    //   scope_auth: 'failed_degrade_all' 표시해 프론트가 배너로 알릴 수 있게.
    //   + admin_bridge_ 접두사 반복 제거 (이중 접두사 방어)
    const scopeParam = (searchParams.get('scope') || 'all').toLowerCase();
    let scope: 'all' | 'mine' = scopeParam === 'mine' ? 'mine' : 'all';
    let scopeUid: string | null = null;
    let scopeAuth: 'ok' | 'failed_degrade_all' | null = null;
    if (scope === 'mine') {
      try {
        const authHdr = request.headers.get('authorization') || '';
        let token = authHdr.replace(/^Bearer\s+/i, '').trim();
        // admin_bridge_ 접두사 반복 제거 (이중/삼중 접두사 방어)
        while (token.startsWith('admin_bridge_')) token = token.slice('admin_bridge_'.length);
        if (token.startsWith('eyJ') && token.split('.').length === 3 && token.length > 40) {
          const { data } = await Promise.race([
            supabase.auth.getUser(token),
            new Promise<{ data: { user: null } }>((_, rej) =>
              setTimeout(() => rej(new Error('uid_timeout')), 2000)
            ),
          ]) as { data: { user: { id: string } | null } };
          scopeUid = data?.user?.id ?? null;
        }
      } catch { /* UID 추출 실패 → 아래 degrade 로직 */ }
      if (!scopeUid) {
        // L-crit1: 빈 배열 대신 scope=all 로 강등. 어드민 권한은 verifyAuth 에서 이미 보장.
        scope = 'all';
        scopeAuth = 'failed_degrade_all';
      } else {
        scopeAuth = 'ok';
      }
    }

    if (fields === 'minimal') {
      // ⚡⚡⚡ 초경량 모드 (v3) — 전방위 최적화
      //  1) listing_images 는 url 만 → 이미지 페이로드 75% 감소
      //  2) null/빈 필드 제거 → 전체 20~30% 추가 감소
      //  3) unstable_cache 로 Node 레벨 메모이제이션 (60s)
      //  4) CDN: s-maxage=300, stale-while-revalidate=86400
      //  5) ETag + 304 Not Modified (재방문 0-byte 응답)
      const selectFields = [
        'id', 'title', 'type', 'deal', 'status',
        'deposit', 'monthly', 'price',
        'maintenance_fee', 'maintenance_includes',
        'area_m2', 'area_supply_m2',
        'floor_current', 'floor_total',
        'rooms', 'bathrooms', 'direction',
        'address', 'address_detail', 'dong',
        // L-search1 (2026-04-23): 좌측 카드 단지명 표기용 building_name 추가.
        //   기존엔 minimal 응답에서 누락되어 모든 카드에 '(단지명)' 이 공란.
        'building_name',
        // L-search-v328 (2026-04-29 사장님 명령): 메인 라인 형식 — "[지번] [건물명] [N층] [동] [호]"
        //   동(가동/나동) 이 호수 앞에 위치. v328 patch 가 buildText 에서 사용.
        'building_dong', 'building_ho',
        // 룸 라벨 (v330) — listing.rooms 변환 ('1' → '원룸', '2' → '투룸' 등)
        'rooms',
        'lat', 'lng',
        'available_date', 'built_year',
        'parking', 'elevator', 'pet', 'balcony', 'full_option', 'loan_available',
        'business_type', 'goodwill_fee',
        'station_name', 'station_distance',
        // L-search1: sortBy='latest' 정렬키 — minimal slim 모드에서 누락되어
        //   정렬이 섞여 보이는 증상 수정.
        'created_at',
        // L-search2 (2026-04-23) rollback: listings.thumbnail_url 컬럼은
        //   이 스키마에 존재하지 않아 SELECT 전체가 42703 에러로 실패했음.
        //   listing_images 의 대표 URL 은 별도 경로로 얻는다.
        'created_by', // L-v7-p3: scope=mine 디버그/검증용 echo
        'last_verified_at', // L-verify-list (2026-04-24): 목록 현장확인 배지
        'source_site', // L-imgpolicy3: 크롤링 판정용 (응답 전 썸네일 스크럽)
        'updated_at', // L-search8 (2026-04-24): admin/listings 페이지 '수정됨' 배지용 (minimal 전환 시 필요)
        // L-roadname (2026-04-29 사장님 명령): v327 patch 가 카드 부 라인을 도로명주소로
        //   교체할 때 listing.building_info.도로명주소 를 읽음. 응답에 포함되어야 동작.
        //   slim 단계에서 도로명/지번 두 키만 남기고 나머지 jsonb 키는 제거 (size 절감).
        'building_info',
        // L-search7 (2026-04-24): listing_images JOIN 제거. JOIN 된 1000-row 쿼리가
        //   ~4.8s 걸리고 7 pages parallel → Vercel 27s 소비 + supabase-js 의 range
        //   pagination 버그 트리거 (매물 2000~4000 축소). 대신 main rows 수집 후
        //   ids 로 listing_images 를 별도 IN 쿼리 1번에 가져옴 (총 3-4s 예상).
      ].join(',');

      // L-v7-p3: 사용자별 캐시 키 분리 — mine 은 uid 가 키에 포함
      const cacheKey: string[] = scope === 'mine'
        ? ['listings-minimal-v12-mine', scopeUid as string]
        : ['listings-minimal-v12'];

      // Node 레벨 60초 캐시: 여러 edge 호출 간에도 Supabase 쿼리 재사용
      const getCached = unstable_cache(
        async () => {
          const PAGE_SIZE = 5000;

          // 1차 페이지
          let firstQ = supabase
            .from('listings')
            .select(selectFields)
            .order('created_at', { ascending: false })
            .range(0, PAGE_SIZE - 1);
          if (scope === 'mine' && scopeUid) firstQ = firstQ.eq('created_by', scopeUid);
          const { data: firstPage, error: firstError } = await firstQ;

          if (firstError || !firstPage) {
            console.error('[admin/listings minimal] firstQ error:', firstError);
            return [];
          }

          let allData: any[] = [...firstPage];

          // L-perf-step-i (2026-05-09 사장님 SOTA Phase 3): main pages chunked parallel.
          //   사장님 호소 "Step H 후에도 1분 그대로". image batches (Step H) 단축
          //   효과 작음 - 진짜 병목은 main listings 63 페이지 (62K 매물) sequential.
          //   해결: chunked parallel (5개씩 동시) + page 별 retry 1회.
          //   - chunked 라 supabase rate-limit 안전 (이전 L-search7b issue 회피)
          //   - retry 로 cold-start 빈 페이지 issue 1회 자동 복구
          //   - 페이지당 0.3-0.6s, 5개 동시 → chunk 당 0.6s, 13 chunks → 8초
          //   - 이전 sequential 63 × 0.5s = 32s → 8s (4배 빠름)
          if (firstPage.length === PAGE_SIZE) {
            const _mainStart = Date.now();
            const fetchPage = async (from: number, retry = 0): Promise<any[] | null> => {
              let q = supabase
                .from('listings')
                .select(selectFields)
                .order('created_at', { ascending: false })
                .range(from, from + PAGE_SIZE - 1);
              if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);
              const { data: page, error: pageError } = await q;
              if (pageError) {
                if (retry < 1) {
                  await new Promise((r) => setTimeout(r, 200));
                  return fetchPage(from, retry + 1);
                }
                console.error('[admin/listings minimal] page ' + from + ' error after retry', pageError);
                return null;
              }
              if (!page) return null;
              if (page.length === 0 && retry < 1) {
                // 빈 페이지: cold-start rate-limit 일 수 있음 - 1회 retry
                await new Promise((r) => setTimeout(r, 200));
                return fetchPage(from, retry + 1);
              }
              return page;
            };

            const CHUNK = 5; // 동시 5 페이지 (supabase 안전 margin)
            let from = PAGE_SIZE;
            let stop = false;
            while (!stop && from < 100000) {
              const offsets: number[] = [];
              for (let c = 0; c < CHUNK && from + c * PAGE_SIZE < 100000; c++) {
                offsets.push(from + c * PAGE_SIZE);
              }
              const pages = await Promise.all(offsets.map((off) => fetchPage(off)));
              for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                if (!page || page.length === 0) {
                  stop = true; // 마지막 chunk 도달
                  break;
                }
                allData = allData.concat(page);
                if (page.length < PAGE_SIZE) {
                  stop = true; // 마지막 페이지
                  break;
                }
              }
              from += CHUNK * PAGE_SIZE;
            }
            console.log('[admin/listings minimal] main pages fetched in ' +
              (Date.now() - _mainStart) + 'ms (' + allData.length + ' rows, chunked parallel CHUNK=' + CHUNK + ')');
          }

          // L-search7 (2026-04-24): 수집된 id 로 listing_images 를 IN 쿼리 1번에 fetch.
          //   main rows 보다 10~20배 많지만 (listing_id, url, sort_order) 3 column 만
          //   가져오므로 페이로드 작음. 각 listing 당 첫 1장만 map 으로 빠르게 선정.
          // L-perf-step-h (2026-05-09 사장님 SOTA Phase 2): sequential -> parallel.
          //   사장님 1분 로딩 호소. 30 batches x ~1s sequential = 30s 추가 소요.
          //   listing_images IN 쿼리는 batch 별 독립적 (rate-limit issue 없음)
          //   -> Promise.all 안전. 10-20s 단축 예상. race condition X (lock-free).
          let imageByListing: Record<string, string> = {};
          const _imgStart = Date.now();
          if (allData.length > 0) {
            try {
              const listingIds = allData.map((r: any) => r.id);
              const BATCH = 1000;
              const batches: number[][] = [];
              for (let i = 0; i < listingIds.length; i += BATCH) {
                batches.push(listingIds.slice(i, i + BATCH));
              }
              const results = await Promise.all(
                batches.map((batch) =>
                  supabase
                    .from('listing_images')
                    .select('listing_id, url, sort_order')
                    .in('listing_id', batch)
                    .order('sort_order', { ascending: true, nullsFirst: false })
                    .limit(100000)
                )
              );
              for (const { data: imgs, error: imgErr } of results) {
                if (imgErr) {
                  console.error('[admin/listings] image batch error', imgErr);
                  continue;
                }
                if (!imgs) continue;
                for (const im of imgs as any[]) {
                  const lid = String(im.listing_id);
                  if (!imageByListing[lid] && im.url) imageByListing[lid] = im.url;
                }
              }
              console.log('[admin/listings minimal] images fetched in ' +
                (Date.now() - _imgStart) + 'ms (' + batches.length + ' batches parallel, ' +
                Object.keys(imageByListing).length + ' listings)');
            } catch (e) {
              console.error('[admin/listings] image fetch error', e);
              // 실패 시 이미지 없이 계속 — 전체 매물 수 유지가 최우선
            }
          }

          // 🧹 null / 빈 배열 / 빈 문자열 / false 불리언 제거로 페이로드 20~30% 감소
          // (클라이언트는 접근 시 기본값 fallback 으로 처리)
          const slim = allData.map((row: any) => {
            // L-search7: 별도 쿼리로 가져온 이미지 매핑 → row.listing_images 주입
            const imgUrl = imageByListing[String(row.id)];
            row.listing_images = imgUrl ? [{ url: imgUrl }] : [];
            // L-img2 (2026-04-24): admin(중개사) 포털은 preferSelfHostedImages 정책.
            //   · 자체 업로드가 있으면 그것만 노출 (저작권 안전)
            //   · 자체 업로드가 0 이면 크롤링 원본 유지 (카드 썸네일 공백 방지)
            //   이전엔 공개용 filterSelfHosted 를 쓰고 있어 크롤링 매물의 썸네일이
            //   전부 공백이 되는 버그(L-img1) 의 2차 증상. image-policy.ts 의
            //   주석 원래 의도대로 관리자 경로는 preferSelfHostedImages 사용.
            if (row.source_site) {
              const policed = preferSelfHostedImages({
                source_site: row.source_site,
                listing_images: row.listing_images || [],
              });
              row.listing_images = policed.listing_images;
              if (row.thumbnail_url && !isSelfHostedImage(row.thumbnail_url)) {
                row.thumbnail_url = null;
              }
            }
            // L-roadname (2026-04-29): building_info jsonb 슬림화 — 도로명주소/지번주소 두 키만.
            //   원본 building_info 는 basic/recapTitle/전유부/층별개요 등 큰 객체 다수 보유.
            //   카드 표시에는 도로명/지번만 필요하므로 페이로드 size 절감.
            if (row.building_info && typeof row.building_info === 'object') {
              const bi = row.building_info as Record<string, unknown>;
              const road = (bi['도로명주소'] as string) || '';
              const jibun = (bi['지번주소'] as string) || '';
              if (road || jibun) {
                row.building_info = {
                  ...(road ? { '도로명주소': road } : {}),
                  ...(jibun ? { '지번주소': jibun } : {}),
                };
              } else {
                row.building_info = null; // 빈 객체로 슬림제거 트리거
              }
            }
            const out: any = {};
            for (const k in row) {
              const v = row[k];
              if (v === null || v === undefined || v === '' || v === false) continue;
              if (Array.isArray(v) && v.length === 0) continue;
              out[k] = v;
            }
            return out;
          });

          return slim;
        },
        cacheKey,
        // L-perf-step-c (2026-05-09 사장님 SOTA Phase 1): Node 캐시 60s → 300s
        //   매물 등록 시 revalidateTag('listings') 가 instant invalidate
        { revalidate: 300, tags: ['listings'] }
      );

      const allData = await getCached();

      // L-perf-step-c (2026-05-09 사장님 SOTA Phase 1 - server only):
      //   ?limit=N&cursor=ID 옵션 — cursor pagination.
      //   limit 미지정 시 기존 동작 (모든 매물 응답) 유지 — 0% 회귀 위험.
      //   v336 client patch (다음 세션) 가 사용 시 첫 100건 즉시 표시 → 100배 ↓.
      const limitParam = searchParams.get('limit');
      const cursorParam = searchParams.get('cursor');
      let pageData = allData;
      let nextCursor: string | null = null;
      if (limitParam && /^\d+$/.test(limitParam)) {
        const limit = Math.min(parseInt(limitParam, 10), 1000);
        let startIdx = 0;
        if (cursorParam && /^\d+$/.test(cursorParam)) {
          const idx = allData.findIndex((r: { id: number | string }) => String(r.id) === cursorParam);
          if (idx >= 0) startIdx = idx + 1;
        }
        pageData = allData.slice(startIdx, startIdx + limit);
        if (startIdx + limit < allData.length && pageData.length > 0) {
          nextCursor = String((pageData[pageData.length - 1] as { id: number | string }).id);
        }
      }

      // ETag 기반 304 응답
      // L-crit1: scope_auth 필드 포함 — 프론트가 degrade 상태 감지 가능
      const bodyStr = JSON.stringify({
        success: true,
        data: pageData,
        total: allData.length,
        ...(nextCursor !== null ? { nextCursor } : {}),
        ...(limitParam ? { paginated: true, returned: pageData.length } : {}),
        scope,
        scope_auth: scopeAuth,
      });
      const etag = '"' + createHash('sha1').update(bodyStr).digest('hex').substring(0, 16) + '"';
      const ifNoneMatch = request.headers.get('if-none-match');
      if (ifNoneMatch === etag) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            'ETag': etag,
            'Cache-Control': scope === 'mine'
              ? 'private, max-age=30'
              : 's-maxage=1800, stale-while-revalidate=86400',
            ...(scope === 'mine' ? {} : { 'CDN-Cache-Control': 'max-age=1800' }),
          },
        });
      }

      const response = new NextResponse(bodyStr, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'ETag': etag,
          // L-v7-p3: scope=mine 은 사용자별 private, all 은 기존 CDN 공격 캐시
          'Cache-Control': scope === 'mine'
            ? 'private, max-age=30'
            : 's-maxage=1800, stale-while-revalidate=86400',
          ...(scope === 'mine' ? {} : { 'CDN-Cache-Control': 'max-age=1800' }),
          'Vary': 'Accept-Encoding, Authorization',
        },
      });
      return response;
    }

    let allData: any[] = [];
    const PAGE_SIZE = 5000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      // L-v7-p3 build f (2026-04-22): full-scan 폴백 경로에도 scope=mine 필터 적용
      //   minimal 경로와 동작을 일치시켜 ?fields≠minimal 호출도 본인 매물만 반환.
      let q = supabase
        .from('listings')
        .select('*, listing_images(*)')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (scope === 'mine' && scopeUid) q = q.eq('created_by', scopeUid);
      const { data, error } = await q;

      if (error) {
        console.error('매물 조회 오류 (offset=' + from + '):', error);
        break;
      }

      if (data && data.length > 0) {
        allData = allData.concat(data);
        from += PAGE_SIZE;
        hasMore = data.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    return NextResponse.json({
      success: true,
      data: allData,
      total: allData.length,
      scope,
      scope_auth: scopeAuth, // L-crit1: degrade 상태 전파
    });
  } catch (error) {
    console.error('매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/listings - 매물 생성
 * 이미지 URL 배열이 포함된 경우, 매물 생성 후 listing_images 테이블에 연결
 */
export async function POST(request: NextRequest) {
  const cors = adminCorsHeaders(request, 'GET, POST, PUT, OPTIONS');
  try {
    if (!(await verifyAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401, headers: cors }
      );
    }

    // L-v7-p2 (2026-04-22): scope=mine 전파용 — auth 헤더의 JWT 에서
    //   사용자 UID 를 추출해 created_by 로 기록. master/crawler 토큰이면 NULL.
    //   DB round-trip 실패/타임아웃 시 조용히 NULL 로 폴백 (본 트랜잭션 계속).
    //
    // L-v7-p4 (2026-04-22, build i): /search 중개사 포털 wrappedFetch 는
    //   `Bearer admin_bridge_<JWT>` 로 전송하므로, GET 경로(L138)와 동일하게
    //   admin_bridge_ prefix 를 선제적으로 벗겨내야 auth.getUser() 가 동작.
    //   prefix 제거를 빠뜨리면 startsWith('eyJ') 가 false → createdByUid=NULL
    //   로 박제되어 /search 로 등록한 신규 매물의 "내 매물" 귀속이 영구 파손됨.
    let createdByUid: string | null = null;
    try {
      const authHdr = request.headers.get('authorization') || '';
      let token = authHdr.replace(/^Bearer\s+/i, '').trim();
      if (token.startsWith('admin_bridge_')) token = token.slice('admin_bridge_'.length);
      if (token.startsWith('eyJ') && token.split('.').length === 3) {
        const sb = createServerClient();
        const { data } = await Promise.race([
          sb.auth.getUser(token),
          new Promise<{ data: { user: null } }>((_, rej) =>
            setTimeout(() => rej(new Error('uid_timeout')), 2000)
          ),
        ]) as { data: { user: { id: string } | null } };
        createdByUid = data?.user?.id ?? null;
      }
    } catch { /* scope 기록 실패는 치명적 X */ }

    // text/plain으로 전송된 JSON도 파싱 (no-cors 크롤러 호환)
    // L-listingpost1 (2026-04-24): multipart/form-data 수용 — /admin/listings/new 의
    //   publishListing() 이 FormData 로 images 파일 + 텍스트 필드를 함께 보내고 있었으나
    //   이전까지 JSON.parse 시도가 실패해 body={} 로 떨어져 zod 검증 400 → "자체 등록
    //   매물 0건" 영구 회귀의 주원인. 이미지 파일은 listing 생성 후 /api/listings/[id]/images
    //   로 별도 업로드하는 2단계 플로우로 클라이언트도 병행 수정 예정이지만, 서버는
    //   multipart 본문의 텍스트 필드를 받아 그대로 insert 할 수 있도록 방어한다.
    //   (이미지 파일 파트는 서버에서 읽지 않고 무시; images URL 배열은 클라이언트가
    //    URL 업로드 완료 후 JSON.stringify 로 'images' 필드에 싣는 방식을 지원.)
    let body: any;
    // multipart 경로에서 수집된 이미지 File 리스트 (리스팅 생성 후 R2 업로드)
    let multipartImageFiles: File[] | null = null;
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json();
    } else if (ct.includes('multipart/form-data')) {
      const fd = await request.formData();
      body = {};
      for (const [key, val] of fd.entries()) {
        if (typeof val !== 'string') {
          // File 엔트리(이미지 파일) — 'images' key 로 수집, listing 생성 후 R2 업로드
          if (key === 'images' && val instanceof File) {
            (multipartImageFiles ||= []).push(val);
          }
          continue;
        }
        if (['deposit','monthly','price','maintenance_fee','area_m2','area_supply_m2','area_land_m2',
             'rooms','bathrooms','station_distance','goodwill_fee','meeting_room','parking_spaces',
             'rights_fee','parking_fee','commission_fee','base_price','photo_count','area_pyeong','lat','lng'].includes(key)) {
          const n = Number(val); body[key] = Number.isFinite(n) ? n : null;
        } else if (['parking','elevator','pet','balcony','full_option','loan_available','vat_included','signage_available'].includes(key)) {
          body[key] = val === 'true';
        } else if (['maintenance_includes','features','images','listing_images'].includes(key)) {
          try { body[key] = JSON.parse(val); } catch { body[key] = []; }
        } else {
          body[key] = val;
        }
      }
      // images 필드가 URL 배열이 아니라 File 목록이었다면 zod 전에 비우기
      if (Array.isArray(body.images) && body.images.some((x: any) => typeof x !== 'string')) body.images = [];
    } else {
      const text = await request.text();
      try { body = JSON.parse(text); } catch { body = {}; }
    }

    // 크롤러 호환: 구 필드명 → 현재 필드명 자동 변환
    if (body.transaction_type && !body.deal) body.deal = body.transaction_type;
    if (body.monthly_rent !== undefined && body.monthly === undefined) body.monthly = body.monthly_rent;
    if (body.sale_price !== undefined && body.price === undefined) body.price = body.sale_price;
    if (body.floor !== undefined && body.floor_current === undefined) body.floor_current = body.floor ? String(body.floor) : null;
    if (body.year_built !== undefined && body.built_year === undefined) body.built_year = body.year_built ? String(body.year_built) : null;
    // dong 자동 추출 (address에서 "동" 추출)
    if (!body.dong && body.address) {
      const dongMatch = body.address.match(/([가-힣]+동)/);
      body.dong = dongMatch ? dongMatch[1] : (body.address.split(' ')[1] || body.address.split(' ')[0] || '미입력');
    }
    if (!body.dong) body.dong = '미입력';
    // gu 자동 추출 (address에서 "구" 추출)
    if (!body.gu && body.address) {
      const guMatch = body.address.match(/([가-힣]+구)/);
      if (guMatch) body.gu = guMatch[1];
    }
    // contact_number → contact 호환
    if (body.contact_number && !body.contact) body.contact = body.contact_number;
    // type 자동 매핑 (크롤러에서 사용하는 type → API enum)
    const typeMap: Record<string, string> = {
      '빌라': '원룸', '공장/창고': '상가', '지식산업센터': '사무실',
      '쓰리룸': '쓰리룸', '단독/다가구': '원룸',
    };
    if (body.type && typeMap[body.type]) body.type = typeMap[body.type];
    // area_m2가 0이면 0.1로 (양수 required)
    if (!body.area_m2 || body.area_m2 <= 0) body.area_m2 = 0.1;

    const parsed = createListingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message, detail: JSON.stringify(parsed.error.errors) },
        { status: 400, headers: cors }
      );
    }

    const supabase = createServerClient();

    const { images, ...listingData } = parsed.data;

    const { data, error } = await supabase
      .from('listings')
      .insert({
        title: listingData.title,
        type: listingData.type,
        deal: listingData.deal,
        deposit: listingData.deposit,
        monthly: listingData.monthly || null,
        price: listingData.price || null,
        maintenance_fee: listingData.maintenance_fee || 0,
        maintenance_includes: listingData.maintenance_includes || null,
        area_m2: listingData.area_m2,
        area_supply_m2: listingData.area_supply_m2 || null,
        area_land_m2: listingData.area_land_m2 || null,
        floor_current: listingData.floor_current || '미상',
        floor_total: listingData.floor_total || null,
        rooms: listingData.rooms || null,
        bathrooms: listingData.bathrooms || null,
        direction: listingData.direction || null,
        heating_type: listingData.heating_type || null,
        address: listingData.address,
        address_detail: listingData.address_detail || null,
        dong: listingData.dong,
        // L-geocode1: lat/lng 누락 시 서버에서 Kakao API 로 자동 지오코딩.
        //   이전엔 클라이언트가 좌표 안 보내면 null 로 insert 되어 mv_map_listings
        //   에 포함되지 않고 /map 에서 영영 사라지는 매물이 수천 건 누적됨.
        ...(await (async () => {
          let lat = listingData.lat ?? null;
          let lng = listingData.lng ?? null;
          if ((lat == null || lng == null) && listingData.address) {
            const hit = await geocodeAddress(listingData.address);
            if (hit) { lat = hit.lat; lng = hit.lng; }
          }
          return { lat, lng };
        })()),
        description: listingData.description || null,
        available_date: listingData.available_date || null,
        built_year: listingData.built_year || null,
        parking: listingData.parking || false,
        elevator: listingData.elevator || false,
        pet: listingData.pet || false,
        balcony: listingData.balcony || false,
        full_option: listingData.full_option || false,
        loan_available: listingData.loan_available ?? true,
        business_type: listingData.business_type || null,
        goodwill_fee: listingData.goodwill_fee || null,
        vat_included: listingData.vat_included || null,
        station_name: listingData.station_name || null,
        station_distance: listingData.station_distance || null,
        usage_approved: listingData.usage_approved || null,
        electric_capacity: listingData.electric_capacity || null,
        signage_available: listingData.signage_available || null,
        meeting_room: listingData.meeting_room || null,
        // L-status1 (2026-04-23): fallback '가용' → '공개' (UI 와 통일).
        status: listingData.status || '공개',
        previous_business: listingData.previous_business || null,
        recommended_business: listingData.recommended_business || null,
        restricted_business: listingData.restricted_business || null,
        parking_spaces: listingData.parking_spaces || null,
        source_site: listingData.source_site || null,
        source_id: listingData.source_id || null,
        source_url: listingData.source_url || null,
        building_name: listingData.building_name || null,
        contact: listingData.contact || null,
        lease_period: listingData.lease_period || null,
        rights_fee: listingData.rights_fee || null,
        gu: listingData.gu || null,
        entrance_type: listingData.entrance_type || null,
        features: listingData.features || null,
        parking_fee: listingData.parking_fee || null,
        building_purpose: listingData.building_purpose || null,
        previous_brand: listingData.previous_brand || null,
        commission_fee: listingData.commission_fee || null,
        special_notes: listingData.special_notes || null,
        // L-detail-schema (2026-04-24): 상세 카드 v2 필드
        room_layout: listingData.room_layout || null,
        is_duplex: listingData.is_duplex ?? null,
        illegal_building: listingData.illegal_building ?? null,
        last_verified_at: listingData.last_verified_at || null,
        total_parking_spaces: listingData.total_parking_spaces ?? null,
        // L-v7-p2 (2026-04-22): scope=mine 전파 — JWT 사용자 UID 기록
        created_by: createdByUid,
      })
      .select()
      .single();

    if (error) {
      console.error('매물 생성 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 생성에 실패했습니다', detail: error?.message || String(error) },
        { status: 500, headers: cors }
      );
    }

    let imageResults: any[] = [];

    // L-listingpost1 (2026-04-24): multipart 로 올라온 이미지 파일 R2 업로드
    //   /admin/listings/new 의 publishListing() 과 직통. 기존 JSON-only 엔드포인트를
    //   유지하면서도 FormData 기반 자체 등록이 성공하도록 확장.
    if (multipartImageFiles && multipartImageFiles.length > 0 && data?.id) {
      const { uploadToR2 } = await import('@/lib/r2');
      const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
      const uploadedUrls: string[] = [];
      for (let i = 0; i < Math.min(multipartImageFiles.length, 20); i++) {
        const file = multipartImageFiles[i];
        if (!ALLOWED.has(file.type)) continue;
        if (file.size > 10 * 1024 * 1024) continue;
        try {
          // L-photo-pipeline (2026-04-24): 신규 매물 등록 인라인 이미지도
          //   Classic Negative + 중앙 워터마크 강제. WebP 로 저장.
          const { processPhotoUpload } = await import('@/lib/photoProcess');
          const rawBuf = Buffer.from(await file.arrayBuffer());
          const buf = await processPhotoUpload(rawBuf);
          console.log('[upload-pipeline] processed', rawBuf.length, '->', buf.length, 'bytes');
          const key = `listings/${data.id}/${Date.now()}_${i}.webp`;
          const url = await uploadToR2(key, buf, 'image/webp');
          uploadedUrls.push(url);
        } catch (e) {
          console.error('[POST /api/admin/listings] R2 업로드 실패:', e);
        }
      }
      if (uploadedUrls.length > 0) {
        const inserts = uploadedUrls.map((url, index) => ({
          listing_id: data.id,
          url,
          alt: `${listingData.title} 이미지 ${index + 1}`,
          sort_order: index,
          is_thumbnail: index === 0,
        }));
        const { data: imgData, error: imgErr } = await supabase.from('listing_images').insert(inserts).select();
        if (imgErr) console.error('[POST /api/admin/listings] listing_images insert 실패:', imgErr);
        else imageResults = imgData || [];
      }
    }

    // JSON 경로에서 images URL 배열이 직접 전달된 경우 (기존 크롤러/edit 플로우)
    if (imageResults.length === 0 && images && images.length > 0 && data?.id) {
      const imageInserts = images.map((url: string, index: number) => ({
        listing_id: data.id,
        url: url,
        alt: `${listingData.title} 이미지 ${index + 1}`,
        sort_order: index,
        is_thumbnail: index === 0,
      }));

      const { data: imgData, error: imgError } = await supabase
        .from('listing_images')
        .insert(imageInserts)
        .select();

      if (imgError) {
        console.error('이미지 연결 오류:', imgError);
      } else {
        imageResults = imgData || [];
      }
    }

    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidateTag('listings');

    // G-82 (2026-05-03): 매물 등록 audit
    try {
      const _caller = await verifyAdminAuthStrict(request);
      audit({
        action: 'listing.create',
        actor: { email: _caller.email ?? null, role: _caller.role ?? null, uid: _caller.uid ?? null },
        target: { type: 'listing', id: String(data?.id ?? null) },
        ip: getClientIp(request),
        userAgent: request.headers.get('user-agent') || undefined,
        route: '/api/admin/listings',
        status: 201,
        meta: { images_count: imageResults.length },
      });
    } catch { /* audit 실패 무시 */ }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...data,
          listing_images: imageResults,
        },
      },
      { status: 201, headers: cors }
    );
  } catch (error: any) {
    console.error('매물 생성 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 생성에 실패했습니다', detail: error?.message || String(error) },
      { status: 500, headers: cors }
    );
  }
}

/**
 * PUT /api/admin/listings - 매물 수정
 */
export async function PUT(request: NextRequest) {
  try {
    if (!(await verifyAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, images, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '매물 ID가 필요합니다' },
        { status: 400 }
      );
    }

    const parsed = createListingSchema.partial().safeParse(updateData);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const updateValues: Record<string, any> = {};
    Object.entries(parsed.data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'images') {
        updateValues[key] = value;
      }
    });

    // L-geocode1 (2026-04-23): 주소는 변경되는데 lat/lng 은 안 들어온 경우
    //   서버단에서 자동 지오코딩.  수정 경로에서도 좌표 누락을 원천 차단.
    if (updateValues.address &&
        (updateValues.lat == null || updateValues.lng == null)) {
      const hit = await geocodeAddress(updateValues.address as string);
      if (hit) {
        updateValues.lat = hit.lat;
        updateValues.lng = hit.lng;
      }
    }

    if (Object.keys(updateValues).length === 0 && !images) {
      // L-debug-fields (2026-04-29): 사장님 화면에 직접 진단 정보 표시.
      //   client 가 보낸 키 vs zod 통과 키 vs undefined 키 inline.
      const recvKeys = Object.keys(updateData || {});
      const parsedKeys = Object.keys(parsed.data || {});
      const undefKeys = Object.entries(parsed.data || {})
        .filter(([, v]) => v === undefined).map(([k]) => k);
      const detail = ` (받은:${recvKeys.length}개[${recvKeys.slice(0,5).join(',')}] · zod통과:${parsedKeys.length}개 · undefined:${undefKeys.length}개[${undefKeys.slice(0,3).join(',')}])`;
      return NextResponse.json(
        { success: false, error: '수정할 필드가 없습니다' + detail, debug: { recvKeys, parsedKeys, undefKeys } },
        { status: 400 }
      );
    }

    let data = null;

    if (Object.keys(updateValues).length > 0) {
      const { data: updatedData, error } = await supabase
        .from('listings')
        .update(updateValues)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('매물 수정 오류:', error);
        return NextResponse.json(
          { success: false, error: '매물 수정에 실패했습니다', detail: error?.message || String(error) },
          { status: 500 }
        );
      }

      data = updatedData;
    }

    if (images && Array.isArray(images)) {
      await supabase
        .from('listing_images')
        .delete()
        .eq('listing_id', id);

      if (images.length > 0) {
        const imageInserts = images.map((url: string, index: number) => ({
          listing_id: id,
          url: url,
          alt: `매물 이미지 ${index + 1}`,
          is_thumbnail: index === 0,
        }));

        await supabase
          .from('listing_images')
          .insert(imageInserts);
      }
    }

    if (!data) {
      const { data: fetchedData } = await supabase
        .from('listings')
        .select('*, listing_images(*)')
        .eq('id', id)
        .single();

      data = fetchedData;
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidatePath(`/listings/${id}`, 'page');
    revalidateTag('listings');

    // G-82 (2026-05-03): 매물 수정 audit
    try {
      const _caller = await verifyAdminAuthStrict(request);
      audit({
        action: 'listing.update',
        actor: { email: _caller.email ?? null, role: _caller.role ?? null, uid: _caller.uid ?? null },
        target: { type: 'listing', id: String(id) },
        ip: getClientIp(request),
        userAgent: request.headers.get('user-agent') || undefined,
        route: '/api/admin/listings',
        status: 200,
        meta: { fields: Object.keys(updateValues), images_count: Array.isArray(images) ? images.length : 0 },
      });
    } catch { /* audit 실패 무시 */ }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('매물 수정 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 수정에 실패했습니다', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
