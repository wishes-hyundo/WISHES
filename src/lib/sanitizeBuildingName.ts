// 건물명(building_name) 표시 방어선
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 원칙 (#123, 크롤링 소스 박제 메모리 feedback_no_crawl_source_ui)
//   · 건물명 필드에 들어간 오염(크롤링 사이트명, 슬로건, URL, 지번, 빈값)을
//     상세 페이지·헤더·링크·og 태그에 노출 금지
//   · 반환값이 null 이면 UI 에서 "같은 건물" 섹션·InfoRow 자체를 숨김
//   · 원본 데이터는 건드리지 않는다 (표시 계층 방어만)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 크롤링 소스·플랫폼명 — 완전히 차단
const CRAWL_SOURCE_BLACKLIST = [
  '공실클럽',
  '네모',
  '다방',
  '피터팬',
  '직방',
  '네이버부동산',
  '온하우스',
  'onhouse',
  'zigbang',
  'dabang',
  'gongsil',
];

// AI 생성 슬로건/문장 냄새 — 건물명에 절대 있을 수 없는 표현
const SLOGAN_PATTERNS: RegExp[] = [
  /가능한\s*집/,
  /좋은\s*집/,
  /추천\s*합니다/,
  /위치\s*좋/,
  /교통\s*편리/,
  /즉시\s*입주/,
  /신축\s*급/,
  /수리\s*완료/,
  /매물\s*입니다/,
];

// 지번 패턴 — 건물명 아닌 행정 주소
const LOT_NUMBER_PATTERN = /\b\d+-\d+\b|산\s?\d+-?\d*/;

// URL·HTML 잔여물
const URL_PATTERN = /https?:\/\/|www\.|\.(co\.kr|com|net|org)/i;
const HTML_TAG_PATTERN = /<[^>]+>/;
const HTML_ENTITY_PATTERN = /&[a-z]+;|&#\d+;/i;

// 너무 짧거나 너무 긴 값 (실제 건물명은 2~20자)
const MIN_LEN = 2;
const MAX_LEN = 30;

/**
 * 건물명 표시 방어선.
 * @param raw listing.building_name (DB 원본)
 * @returns 노출 가능한 건물명 | null (UI에서 숨겨야 함)
 */
export function sanitizeBuildingName(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (!s) return null;

  // 길이 체크
  if (s.length < MIN_LEN || s.length > MAX_LEN) return null;

  // 순수 숫자·기호만
  if (!/[가-힣a-zA-Z]/.test(s)) return null;

  // URL·HTML 흔적
  if (URL_PATTERN.test(s)) return null;
  if (HTML_TAG_PATTERN.test(s)) return null;
  if (HTML_ENTITY_PATTERN.test(s)) return null;

  // 지번만 들어있는 경우 ("899-4" 등)
  if (LOT_NUMBER_PATTERN.test(s) && !/[가-힣a-zA-Z]{2,}/.test(s)) return null;

  // 크롤링 소스명 포함
  const lower = s.toLowerCase();
  for (const banned of CRAWL_SOURCE_BLACKLIST) {
    if (lower.includes(banned.toLowerCase())) return null;
  }

  // AI 슬로건 패턴
  for (const pat of SLOGAN_PATTERNS) {
    if (pat.test(s)) return null;
  }

  // 여기까지 살아남으면 표시 허용
  return s;
}

/**
 * "같은 건물" 섹션 노출 판단.
 * 건물명이 방어선을 통과하고 동일 건물 매물이 2건 이상일 때만 true.
 */
export function canShowSameBuildingSection(
  buildingName: unknown,
  buildingListingsCount: number,
): boolean {
  return sanitizeBuildingName(buildingName) !== null && buildingListingsCount > 0;
}
