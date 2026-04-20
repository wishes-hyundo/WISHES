// 매물 제목 표시 유틸리티 (세일즈 카피형, 다양한 템플릿 로테이션)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 원칙 (메모리 feedback_title_no_address)
//   · 제목에 전체 주소/지번 노출 금지
//   · 세일즈 카피형 — 고객이 매물 특성을 한 눈에 파악할 수 있도록
//   · "신림동 원룸", "비룡원룸 원룸", "동호원룸 원룸" 같은 로보틱·중복 패턴 제거
//   · 하나의 템플릿만 쓰지 말고 매물 데이터에 따라 가장 돋보이는 각도 선택
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 우선순위
//   1) listing.ai_title 이 세팅되어 있으면 그대로 사용 (AI 생성 제목)
//   2) raw title 이 이미 세일즈 카피 (주소·지번 패턴 없음) → 그대로 사용
//   3) 자동 생성:
//      a. 실제 건물명 존재 → 건물명 기반 (유형어 중복 제거)
//      b. 역세권 (station_distance ≤ 10분) → 역명 중심
//      c. 평수 있음 → 평수 강조
//      d. 복수 훅(신축·풀옵션·주차 등) → 훅 나열형
//      e. 기본 폴백 → {동} {유형} {층}

import { formatFloor } from './formatFloor';

// 지번 패턴
const LOT_NUMBER_PATTERN = /\b\d+-\d+\b|산\s?\d+-?\d*/;

// 타입 키워드 — 건물명 끝에 이미 붙어있으면 뒤에 또 붙이지 않는다
const TYPE_WORDS = [
  '원룸', '투룸', '쓰리룸', '포룸',
  '오피스텔', '아파트', '빌라', '주택',
  '타워', '상가', '사무실', '오피스', '점포', '공장', '창고',
];

// 행정구역 프리픽스 패턴 — "관악구 봉천동", "서울시 관악구 신림동", "의왕시 내손동" 등
const ADMIN_PREFIX_PATTERNS: RegExp[] = [
  /^[가-힣]+(시|도)\s+[가-힣]+(구|군)\s+[가-힣]+동/,
  /^[가-힣]+구\s+[가-힣]+동/,
  /^[가-힣]+시\s+[가-힣]+동/,
  /^[가-힣]+군\s+[가-힣]+(동|리)/,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI-슬로건 후처리 (v2.7): DB 에 이미 박힌 기존 AI 제목들도 디스플레이에서 정화
// 사용자 피드백 (2026-04): "AI가 자동생성해준 티 나면 안되고 사람냄새 나야 한다"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const AI_SLOGAN_PATTERNS: RegExp[] = [
  /따뜻한\s*/g, /따스한\s*/g, /포근한\s*/g, /아늑한\s*/g,
  /편의점\s*30\s*초\s*/g, /편의점\s*코앞\s*/g, /편의점\s*골목\s*/g,
  /대학가\s*중심\s*/g, /대학가\s*한복판\s*/g,
  /의\s*정석/g, /끝판왕/g, /천국\b/g,
  /생활\s*편리한\s*방/g, /생활의\s*정석/g,
  /혼자만의\s*공간/g, /나만의\s*아지트/g,
  /힐링\s*공간/g, /힐링\s*원룸/g,
  /감성\s*원룸/g, /감성\s*살아있는/g, /감성\s*가득/g,
  /보금자리/g, /완벽한\s*일상/g, /특별한\s*하루/g,
  /깔끔한\s*(원룸|투룸)/g,  // 너무 상투
  /중심가/g,                // 주소 아닌 "중심가" 은근 AI 티
];

function scrubAiSlogan(t: string): string {
  let out = t;
  for (const p of AI_SLOGAN_PATTERNS) out = out.replace(p, '');
  // 고립된 구두점 제거 (예: "신림동 , 생활" → "신림동 생활")
  out = out.replace(/\s+[,·—]\s+/g, ' ')
           .replace(/\s+,\s*$/, '')
           .replace(/^\s*,\s+/, '');
  // 중복 공백·선두/말미 구두점 정리
  out = out.replace(/\s+/g, ' ')
           .replace(/^[\s,·\-—]+/, '')
           .replace(/[\s,·\-—]+$/, '')
           .trim();
  return out;
}

// 호수/지번/동호 덩어리 — "B 102호", "303호", "2층 303호"
const UNIT_NUMBER_PATTERN = /\b\d+\s*호\b|\bB\s*\d+\s*호|\d+동\s*\d+호/;

function hasRawAddress(title: string | null | undefined): boolean {
  if (!title) return false;
  const t = title.trim();
  if (!t) return false;

  // 지번 (예: 123-45, 산 12-3)
  if (LOT_NUMBER_PATTERN.test(t)) return true;

  // 행정구역 프리픽스로 시작 → 주소 덩어리
  for (const p of ADMIN_PREFIX_PATTERNS) {
    if (p.test(t)) return true;
  }

  // 호수 단독 포함 + 긴 토큰 → 주소 덩어리
  if (UNIT_NUMBER_PATTERN.test(t) && t.length >= 12) return true;

  return false;
}

function isRealBuildingName(name?: string | null): boolean {
  if (!name) return false;
  const t = String(name).trim();
  if (!t) return false;
  if (/^\d+\s*층\s*\d+\s*호$/.test(t)) return false;
  if (/^\d+\s*호$/.test(t)) return false;
  if (/^\d+\s*동\s*\d+\s*호$/.test(t)) return false;
  if (/^B?\d+\s*호$/.test(t)) return false;
  if (/^(지하|반지하|옥탑)\s*\d*호?$/.test(t)) return false;
  if (!/[가-힣]{2,}/.test(t)) return false;
  return true;
}

// 건물명이 이미 유형어로 끝나는지 (예: "비룡원룸" → 원룸)
function buildingEmbedsType(name: string): string | null {
  const t = name.trim();
  for (const tw of TYPE_WORDS) {
    if (t.endsWith(tw)) return tw;
  }
  return null;
}

interface ListingLike {
  id?: number | string | null;
  title?: string | null;
  ai_title?: string | null;
  building_name?: string | null;
  dong?: string | null;
  type?: string | null;
  area_m2?: number | null;
  area_pyeong?: number | null;
  area?: number | null;
  floor_current?: string | number | null;
  floor_total?: string | number | null;
  total_floors?: string | number | null;
  floor?: string | number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  deal?: string | null;
  full_option?: boolean | null;
  parking?: boolean | null;
  elevator?: boolean | null;
  pet?: boolean | null;
  balcony?: boolean | null;
  direction?: string | null;
  station_name?: string | null;
  station_distance?: number | null;
  near_subway?: string | null;        // alias
  subway_distance?: number | null;    // alias
  build_year?: number | null;
  built_year?: number | null;
  features?: string[] | null;
  description?: string | null;
}

// 매물에서 추출 가능한 세일즈 훅 배열 (강한 순)
function collectHooks(l: ListingLike): string[] {
  const hooks: string[] = [];
  const year = l.built_year ?? l.build_year ?? null;
  if (typeof year === 'number' && year >= 2020) hooks.push('신축');

  const dist = l.station_distance ?? l.subway_distance ?? null;
  const station = l.station_name ?? l.near_subway ?? null;
  if (typeof dist === 'number' && dist > 0 && dist <= 10 && station) {
    hooks.push(`${station} ${dist}분`);
  } else if (typeof dist === 'number' && dist > 0 && dist <= 10) {
    hooks.push('역세권');
  } else {
    const descTxt = [l.description, l.title].filter(Boolean).join(' ');
    if (/역세권|도보\s?\d+분|\d+호선/i.test(descTxt)) hooks.push('역세권');
  }

  const featuresLen = Array.isArray(l.features) ? l.features.length : 0;
  if (l.full_option === true) hooks.push('풀옵션');
  else if (featuresLen >= 6) hooks.push('옵션완비');

  if (l.parking === true) hooks.push('주차가능');
  if (l.elevator === true) hooks.push('엘리베이터');
  if (l.pet === true) hooks.push('반려동물');
  if (l.balcony === true) hooks.push('베란다');
  if (l.direction && /남/.test(l.direction)) hooks.push('남향');
  return hooks;
}

function clipTitle(s: string, max = 35): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function numericId(listing: ListingLike): number {
  const n = Number(listing.id ?? 0);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

// 자동 제목 생성 — 매물 데이터 강점에 따라 다양한 템플릿 선택
function buildAutoTitle(l: ListingLike): string {
  const hooks = collectHooks(l);
  const realBuilding = isRealBuildingName(l.building_name) ? String(l.building_name).trim() : null;
  const typeWord = (l.type || '').trim();
  const dong = (l.dong || '').trim();
  const pyeong = l.area_pyeong ?? 0;
  const area = l.area_m2 ?? l.area ?? 0;
  const station = l.station_name ?? l.near_subway ?? null;
  const stationDist = l.station_distance ?? l.subway_distance ?? null;
  const floor = formatFloor({
    floor_current: l.floor_current ?? null,
    floor_total: l.floor_total ?? l.total_floors ?? null,
    floor: l.floor ?? null,
  } as any);
  const rooms = typeof l.rooms === 'number' ? l.rooms : 0;
  const id = numericId(l);

  // A) 실제 건물명 경로 — 유형어 중복 제거
  if (realBuilding) {
    const embedded = buildingEmbedsType(realBuilding);
    const parts: string[] = [];
    // 동을 앞에 붙여 지역 맥락 + 건물명
    if (dong && !realBuilding.includes(dong)) parts.push(dong);
    parts.push(realBuilding);
    if (!embedded && typeWord && typeWord !== realBuilding) parts.push(typeWord);
    if (hooks[0]) parts.push('· ' + hooks[0]);
    return clipTitle(parts.filter(Boolean).join(' '));
  }

  // B) 역세권 강 — 역명 + 분수 중심
  if (station && typeof stationDist === 'number' && stationDist > 0 && stationDist <= 10) {
    const base = [
      `${station} ${stationDist}분`,
      dong,
      typeWord,
    ]
      .filter(Boolean)
      .join(' ');
    if (base.length <= 35) {
      const tail = hooks.find((h) => !h.startsWith(station));
      return clipTitle(tail ? `${base} · ${tail}` : base);
    }
  }

  // C) 데이터 강점별 로테이션 (id 기준으로 다양성)
  const variant = id % 4;

  // C-0: 평수 강조
  if (variant === 0 && pyeong && pyeong >= 7) {
    const parts = [dong, `${Math.round(pyeong)}평`, typeWord];
    if (hooks[0]) parts.push('· ' + hooks[0]);
    return clipTitle(parts.filter(Boolean).join(' '));
  }

  // C-1: 훅 선행 (예: "신림동 신축 풀옵션 원룸")
  if (variant === 1 && hooks.length >= 2) {
    const parts = [dong, hooks[0], hooks[1].replace(/^역세권$/, '역세권'), typeWord];
    return clipTitle(parts.filter(Boolean).join(' '));
  }

  // C-2: 방 개수 강조 (투룸 이상)
  if (variant === 2 && rooms >= 2) {
    const parts = [dong, `${rooms}룸`, typeWord];
    if (floor) parts.push(floor);
    if (hooks[0]) parts.push('· ' + hooks[0]);
    return clipTitle(parts.filter(Boolean).join(' '));
  }

  // C-3 (default): 동 + 유형 + 면적/층 + 훅
  const parts: string[] = [dong, typeWord];
  if (area && area > 0) parts.push(`${Math.round(Number(area))}㎡`);
  if (floor) parts.push(floor);
  if (hooks[0]) parts.push('· ' + hooks[0]);
  const base = parts.filter(Boolean).join(' ') || '매물';
  return clipTitle(base);
}

// 스크럽 결과가 "건질 만한가" 판정
// · 너무 짧거나 (≤ 7자)
// · 원본의 절반 이하로 쪼그라들면 → 허접해진 것으로 간주, 자동 생성으로 폴백
function isScrubWorthKeeping(scrubbed: string, original: string): boolean {
  if (!scrubbed) return false;
  if (scrubbed.length < 7) return false;
  if (scrubbed.length < original.length * 0.5) return false;
  return true;
}

/**
 * 매물 제목 표시용 문자열을 반환.
 */
export function displayTitle(listing: ListingLike): string {
  // 1) ai_title 최우선 — 단, AI 슬로건 스크러빙 후 남은 문자열만 채택
  const ai = (listing.ai_title || '').trim();
  if (ai && !hasRawAddress(ai)) {
    const scrubbed = scrubAiSlogan(ai);
    if (isScrubWorthKeeping(scrubbed, ai)) return clipTitle(scrubbed);
  }

  // 2) 원본 title — 주소·지번 없는 경우에만, 그리고 AI 슬로건 스크러빙
  const raw = (listing.title || '').trim();
  if (raw && !hasRawAddress(raw)) {
    const scrubbed = scrubAiSlogan(raw);
    if (isScrubWorthKeeping(scrubbed, raw)) return clipTitle(scrubbed);
  }

  // 3) 자동 생성 (스크러빙 후 너무 짧아지거나 raw 가 주소면 여기로)
  return buildAutoTitle(listing);
}
