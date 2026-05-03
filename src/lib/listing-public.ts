// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 고객(공개) 페이지용 매물 노출 정책 — 단일 소스 화이트리스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔒 목적
//   /api/listings (목록), /api/listings/[id] (상세), /api/listings/map (지도)
//   — 고객 공개용 3개 게이트가 모두 같은 화이트리스트를 쓰도록 강제하여
//     민감/저작권 필드(원본 본문·연락처·출처 URL·원시 데이터 등)의
//     응답 누출을 구조적으로 차단한다.
//
//   "중개사 포털(/search)"이 쓰는 /api/admin/listings 는 이 파일과 무관
//     — 관리자용은 select('*') 전체 노출 유지.
//
// 🚫 응답에서 반드시 제외되는 컬럼 (민감/저작권)
//   - contact          : 외부 중개사 직접 연락처 (저작권 + 위시스 연락처 정책 위반)
//   - source_url       : 외부 원본 매물 URL (저작권)
//   - source_id        : 외부 매물 ID (저작권 증거 회피)
//   - raw_fields       : 크롤러 원시 JSON (메타 유출)
//   - h                : 내부 해시
//   - photo_count, grade, building_listings, base_price,
//     registered_date, last_confirmed, address_detail
//                      : 내부 관리 메타
//
// ⚠️ 조건부 필드 — description
//   description 컬럼에는 두 가지 성격이 섞여 있다.
//     (a) 자체 매물(source_site IS NULL) : 중개사가 직접 작성한 매물설명 → 노출 허용
//     (b) 크롤링 매물(source_site NOT NULL) : 외부 사이트 원본 본문 → 저작권 차단
//   sanitizePublicListing() 이 크롤링 매물에 한해 description 을 제거한다.
//
// ✅ 응답에 포함되는 필드 — 고객 페이지 UI/SEO/JSON-LD 가 실제 사용하는 컬럼만 노출.
//   source_site 는 "크롤링 여부" 플래그로만 사용(광고 배지/이미지 차단 판단).
//   listing_images 는 크롤링 매물일 경우 빈 배열로 치환된다(저작권: 사진만 차단).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 고객 공개 페이지가 공통으로 사용하는 컬럼 집합.
 * 신규 컬럼이 DB 에 생겨도 이 배열에 명시적으로 추가하지 않으면 절대 프론트로 흘러가지 않는다.
 */
export const PUBLIC_LISTING_COLUMNS: readonly string[] = [
  // 식별 / 제목
  'id', 'title',

  // 분류 / 상태
  'type', 'deal', 'status',

  // 금액
  'deposit', 'monthly', 'price',
  'maintenance_fee', 'maintenance_includes', 'maintenance_excludes',
  'goodwill_fee', 'rights_fee', 'parking_fee', 'commission_fee',
  'vat_included',

  // 면적 / 층
  'area_m2', 'area_supply_m2', 'area_land_m2', 'area_pyeong',
  'floor_current', 'floor_total', 'floor_info',
  'rooms', 'bathrooms',

  // 방향 / 설비
  'direction', 'heating_type',
  'parking', 'elevator', 'pet', 'balcony', 'full_option',
  'loan_available',

  // 위치 (※ address_detail 은 제외 — 상세 주소 유출 방지)
  'address', 'dong', 'gu', 'lat', 'lng',

  // 설명 — description 은 자체 매물에 한해 노출(sanitizer 에서 크롤링 매물만 제거)
  'description', 'ai_description', 'ai_title',
  // L-seo (2026-04-29 사장님 명령): SEO 키워드/태그 노출 (메타 키워드 박스 표시)
  'seo_keywords', 'seo_tags', 'seo_meta_description',

  // 입주 / 준공
  'available_date', 'built_year',

  // 상업용 매물
  'business_type', 'previous_business', 'recommended_business', 'restricted_business',
  'previous_brand', 'building_purpose', 'usage_approved',
  'electric_capacity', 'signage_available', 'meeting_room',
  'station_name', 'station_distance',
  'parking_spaces',
  'building_name', 'lease_period', 'entrance_type',
  // ⚠️ 2026-04-18: special_notes(상세설명 특이사항) 제거
  //   → 중개사 전용 내부 메모. /search 포털(관리자)만 열람 가능.
  //   → 공개 응답(/api/listings/*)·메타·OG·지도·상세 어디에도 노출 금지.

  // VR 투어
  'vr_url',

  // 노출 제어 플래그 (광고 배지 / 이미지 차단 판단용)
  //   ⚠️ source_site 는 boolean 성격의 플래그로만 쓰인다.
  //      source_url/source_id 등 실제 원본 주소·식별자는 절대 포함하지 않는다.
  'source_site',

  // L-detail-schema (2026-04-24): 상세 카드 v2 필드
  'room_layout', 'is_duplex', 'illegal_building', 'last_verified_at', 'total_parking_spaces',

  // L-panel-agent (2026-04-24): 담당자 모달용 — profiles fetch 트리거
  'created_by',

  // 조회 메타
  'views', 'created_at', 'updated_at',
] as const;

/**
 * Supabase select() 에 바로 넣는 문자열. 이미지 조인까지 포함한다.
 * 썸네일만 필요한 경우 `PUBLIC_LISTING_SELECT_THUMBNAIL` 사용.
 */
export const PUBLIC_LISTING_SELECT =
  PUBLIC_LISTING_COLUMNS.join(', ') + ', listing_images(url, sort_order, is_thumbnail)';

/**
 * 상세 페이지 SSR 용 — 이미지 + 특징 태그까지 단일 쿼리로 가져온다.
 * (클라이언트 재조회를 없애기 위해 prop 주입 경로에서 사용)
 */
export const PUBLIC_LISTING_SELECT_DETAIL =
  PUBLIC_LISTING_COLUMNS.join(', ') + ', listing_images(url, sort_order, is_thumbnail), listing_features(feature)';

/**
 * 카드 목록용 — 이미지 메타 최소. (Egress 절감)
 */
export const PUBLIC_LISTING_SELECT_CARD =
  PUBLIC_LISTING_COLUMNS.join(', ') + ', listing_images(url, sort_order)';

/**
 * 지도용 — 좌표 포함 필수 + 이미지는 썸네일만.
 */
export const PUBLIC_LISTING_SELECT_MAP =
  PUBLIC_LISTING_COLUMNS.join(', ') + ', listing_images(url)';

/**
 * 고객 공개 페이지의 status 허용 정책.
 *   '공개' 만 노출 — '비공개' / '계약중' / '계약완료' 은 목록·지도·상세 모두 차단.
 *   중개사 포털(/search, /admin)은 이 함수를 사용하지 않는다.
 */
export const PUBLIC_LISTING_STATUS = '공개' as const;

/**
 * 응답 sanitizer.
 *  - 크롤링 매물(source_site NOT NULL) 은 listing_images 를 빈 배열로 치환 (저작권: 사진만 차단).
 *  - 민감 필드가 혹시라도 객체에 남아있으면 제거 (이중 방어).
 */
/** 어떤 경우에도 응답에서 제거되는 민감 필드 집합 */
const FORBIDDEN_PUBLIC_KEYS = [
  'contact', 'source_url', 'source_id',
  'raw_fields', 'h', 'photo_count', 'grade', 'building_listings',
  'base_price', 'registered_date', 'last_confirmed', 'address_detail',
  // 중개사 전용 내부 메모 — /search 포털에서만 열람. 공개 응답에서 제거.
  'special_notes',
] as const;

/**
 * 크롤링 매물(source_site NOT NULL) 에 한해 추가로 제거되는 필드 집합.
 *   - description : 외부 사이트 원본 본문 (저작권)
 *   - listing_images : 사진만 차단 (정보는 광고 노출)
 */
const FORBIDDEN_CRAWLED_KEYS = ['description'] as const;

export function sanitizePublicListing<T extends Record<string, any>>(row: T): T {
  if (!row) return row;
  // 1) 공통 민감 필드 제거 (이중 방어 — select 단계에서 이미 걸러지지만 혹시 모를 누수 차단)
  const cleaned: any = { ...row };
  for (const k of FORBIDDEN_PUBLIC_KEYS) {
    if (k in cleaned) delete cleaned[k];
  }
  // 2) 크롤링 매물이면 저작권 대상 추가 제거 + 이미지 빈 배열
  if (cleaned.source_site) {
    for (const k of FORBIDDEN_CRAWLED_KEYS) {
      if (k in cleaned) delete cleaned[k];
    }
    cleaned.listing_images = [];
  }
  return cleaned as T;
}

/**
 * 배열 버전 — 목록/지도 응답에 일괄 적용.
 */
export function sanitizePublicListings<T extends Record<string, any>>(rows: T[] | null | undefined): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => sanitizePublicListing(r));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-sec64 (2026-04-22): 순수 내부 필드 strip.
//   .select('*') 이 공개 응답에 흘릐주는
//   embedding(vector 384 ≈ 3KB/row) + dedup_* 은 고객은 쓸
//   일이 없고(순수 내부 상태), /api/listings 한
//   요청에 최대 1000 row × 3KB ≈ 3MB egress 낭비 + 
//   dedup_group_id 등 내부 중복제거 그룹핑 정보가 공개됨.
//   PUBLIC_LISTING_SELECT 화이트리스트로 응답 select 전환은
//   UI 회귀 위험초 큼 별도 태스크(L-sec65+)로 분리, 
//   이번에는 응답 레이어에서만 strip.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const INTERNAL_LISTING_FIELDS = [
  'embedding',
  'embedding_generated_at',
  'embedding_source',
  'dedup_requested_at',
  'dedup_reason',
  'dedup_group_id',
  'dedup_kept_id',
  // G-60 (2026-05-03): 공개 API 에서 admin/내부 전용 필드 노출 차단.
  'source_url',           // 크롤러 원본 URL — 출처 누출
  'source_id',            // 크롤러 내부 ID
  'raw_fields',           // 크롤러 raw 데이터 (구조 노출)
  'field_sources',        // 어떤 cron 이 어떤 필드 채웠는지 (admin 추적용)
  'price_history',        // 가격 변동 이력 (내부 분석)
  'special_notes',        // admin 내부 메모
  'commission_note',      // 중개 수수료 메모
  'problematic_reason',   // 결함 사유 (admin 추적)
  'problematic_marked_at',
  'problematic_marked_by',
  'is_problematic',
  'fingerprint',          // 중복 검출용 hash
  'fingerprint_at',
  'last_crawled_at',      // 크롤 추적 시간
  'last_verified_at',
  'building_register_fetched_at',
  'building_register_source',
  'land_price_fetched_at',
  'house_price_fetched_at',
  'enriched_at',
  'building_unit_extracted_at',
  'created_by',           // 등록한 admin/agent uid
  'miss_count',           // 크롤 실패 횟수
  'contacts_history',     // 담당자 변동 이력
  'contacts_crawled_at',
  'area_measured_at',
  'area_measured_by',
  'is_violation_building',  // 위반 건축물 (admin 검토용)
  'violation_reason',
  'approval_date',          // 사용승인일 (admin 참고)
  'trust_score_at',
  'score_breakdown',
  'rtms_data',
  'rtms_avg_price',
  'school_zone_data',
  'air_quality_data',
] as const;

export function stripInternalFields<T extends Record<string, any>>(row: T): T {
  if (!row) return row;
  const cleaned: any = { ...row };
  for (const k of INTERNAL_LISTING_FIELDS) {
    if (k in cleaned) delete cleaned[k];
  }
  return cleaned as T;
}

export function stripInternalFieldsArray<T extends Record<string, any>>(
  rows: T[] | null | undefined,
): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => stripInternalFields(r));
}
