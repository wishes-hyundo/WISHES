// ──────────────────────────────────────────────────────────────────────
// BoB 매물 설명 v2 — 환각·정형구·중복 검증 라이브러리
// 작성: 2026-04-27 v3 세션
//
// 검증 4단:
//   1. AI 정형구 검출 (글로벌 SOTA 보고서 §C-5: 88가지 패턴)
//   2. 표 정보 중복 검출 (사용자 통찰 — 가격/면적/옵션 나열 X)
//   3. 환각 단어 검출 (facts 외 지명/시설/역명)
//   4. 길이 / 다양성 검증
// ──────────────────────────────────────────────────────────────────────

import type { ListingFacts } from './listing-rag';

// ── 1. AI 정형구 / 광고 상투어 (절대 금지) ──────────────────
export const AI_BANNED_PATTERNS: RegExp[] = [
  // 보고서 §C-5 + 한국 부동산 광고 상투어
  /따뜻한\s*[가-힣]/g, /따스한\s*[가-힣]/g, /포근한\s*[가-힣]/g, /아늑한\s*[가-힣]/g,
  /힐링\s*공간/g, /힐링\s*원룸/g,
  /감성\s*원룸/g, /감성\s*살아있/g, /감성\s*가득/g,
  /보금자리/g,
  /설레는\s*새\s*출발/g,
  /완벽한\s*일상/g, /완벽한\s*주거/g, /완벽한\s*공간/g,
  /라이프\s*그\s*자체/g, /그\s*자체\s*입니다/g,
  /특별한\s*하루/g,
  /나만의\s*아지트/g, /나만의\s*공간/g,
  /혼자만의\s*공간/g,
  /의\s*정석/g, /끝판왕/g, /천국/g,
  /가성비/g,
  /자랑합니다/g, /누릴\s*수\s*있습니다/g,
  /합리적인\s*조건/g,

  // 영어 SOTA 보고서의 한국어 변환
  /최고의\s*선택/g, /꿈\s*같은/g, /꿈을\s*이루/g,
  /이상적인\s*공간/g, /이상적인\s*매물/g,
  /놓치면\s*후회/g, /후회하지\s*않을/g,
  /지금\s*아니면\s*없을/g,
  /모든\s*것이\s*완벽/g,
  /이\s*매물의\s*특징은\s*다음과\s*같습니다/g,
  /다음과\s*같이\s*소개/g,

  // 과한 감탄사
  /!!+/g, /\?\?+/g,
  /♡+/g, /★+/g, /☆+/g, /✨{3,}/g,
];

export function detectAiBanned(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of AI_BANNED_PATTERNS) {
    const match = text.match(pattern);
    if (match) hits.push(...match);
  }
  return Array.from(new Set(hits));
}

// ── 2. 표 정보 중복 검출 (가격/면적/옵션) ────────────────────
const FORBIDDEN_NUMBER_PATTERNS: RegExp[] = [
  /\b\d{2,5}\s*만원/g,        // "5000만원", "70만원"
  /\b\d+(?:\.\d+)?\s*억\b/g,  // "1억", "1.5억"
  /\b보증금\s*\d/g,
  /\b월세\s*\d/g,
  /\b전세금\s*\d/g,
  /\b매매가\s*\d/g,
  /\b관리비\s*\d/g,
  /\b\d+(?:\.\d+)?\s*㎡/g,    // 면적
  /\b\d+(?:\.\d+)?\s*평\b/g,
  /\b\d+\s*층\b/g,            // 층수
  /\b\d+\s*개\s*방/g,         // 방 개수
  /\b방\s*\d+\s*개/g,
  /\b욕실\s*\d+\s*개/g,
  /\b주차\s*\d+\s*대/g,
];

export function detectTableDuplicate(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of FORBIDDEN_NUMBER_PATTERNS) {
    const match = text.match(pattern);
    if (match) hits.push(...match);
  }
  return Array.from(new Set(hits));
}

// ── 3. 환각 단어 검출 — facts 에 없는 지명/역명/시설 ──────────
// 한국 주요 지하철역 + 동네 이름 — facts.station_name / facts.dong / nearby_known 외에 등장하면 환각
const KNOWN_STATIONS = [
  '신림역', '봉천역', '서울대입구역', '낙성대역', '사당역', '서초역', '강남역',
  '역삼역', '선릉역', '삼성역', '잠실역', '잠실새내역', '종합운동장역',
  '여의도역', '시청역', '광화문역', '명동역', '회현역', '이태원역', '한남역',
  '청담역', '압구정역', '신사역', '논현역', '학동역', '교대역',
  '서초역', '방배역', '내방역', '구반포역', '신반포역', '고속터미널역',
  '약수역', '버티고개역', '신당역', '동대문역', '제기동역', '청량리역',
  '왕십리역', '한양대역', '뚝섬역', '성수역', '건대입구역', '구의역',
  '강변역', '잠실나루역', '잠실역', '몽촌토성역', '한성백제역', '올림픽공원역',
  '석촌역', '송파역', '가락시장역', '문정역', '장지역', '복정역',
  '시청역', '을지로입구역', '을지로3가역', '을지로4가역', '동대문역사문화공원역',
  '신촌역', '이대역', '아현역', '충정로역', '서대문역', '광화문역',
  '공덕역', '대흥역', '효창공원앞역', '삼각지역', '신용산역', '용산역',
  '노량진역', '대방역', '신길역', '영등포역', '문래역', '당산역',
  '합정역', '망원역', '마포구청역', '월드컵경기장역', '디지털미디어시티역',
  '연신내역', '구파발역', '지축역',
];

const KNOWN_LANDMARKS = [
  '한강', '한강뷰', '한강공원', '여의도공원', '도림천', '안양천', '중랑천', '정릉천',
  '관악산', '북한산', '도봉산', '수락산', '청계산', '남산', '인왕산', '낙산',
  '봉천공원', '보라매공원', '올림픽공원', '서울숲', '월드컵공원', '뚝섬한강공원',
  '서울대', '연세대', '고려대', '한양대', '경희대', '중앙대', '동국대', '건국대',
  '세브란스병원', '서울대병원', '아산병원', '삼성서울병원', '강남세브란스병원',
];

/**
 * 환각 검출: text 에서 KNOWN_STATIONS / KNOWN_LANDMARKS 중
 * facts 에 명시되지 않은 것이 등장하면 환각
 */
export function detectHallucination(
  text: string,
  facts: ListingFacts
): { stations: string[]; landmarks: string[] } {
  const stations: string[] = [];
  const landmarks: string[] = [];

  const allowedPlaces = new Set<string>([
    facts.station_name || '',
    ...facts.nearby_known,
    facts.gu, facts.dong,
    facts.building_name || '',
  ].filter(Boolean));

  for (const station of KNOWN_STATIONS) {
    if (text.includes(station) && !allowedPlaces.has(station)) {
      stations.push(station);
    }
  }

  for (const landmark of KNOWN_LANDMARKS) {
    if (text.includes(landmark) && !allowedPlaces.has(landmark)) {
      landmarks.push(landmark);
    }
  }

  return { stations, landmarks };
}

// ── 4. 메인 검증 함수 ──────────────────────────────────────
export interface VerifyResult {
  ok: boolean;
  ai_banned: string[];
  table_duplicate: string[];
  hallucinated_stations: string[];
  hallucinated_landmarks: string[];
  too_short: boolean;
  too_long: boolean;
  reasons: string[];
}

export function verifyDescription(
  text: string,
  facts: ListingFacts,
  options: { minLen?: number; maxLen?: number } = {}
): VerifyResult {
  const { minLen = 100, maxLen = 800 } = options;

  const ai_banned = detectAiBanned(text);
  const table_duplicate = detectTableDuplicate(text);
  const hallucination = detectHallucination(text, facts);
  const too_short = text.length < minLen;
  const too_long = text.length > maxLen;

  const reasons: string[] = [];
  if (ai_banned.length > 0) reasons.push(`AI 정형구 ${ai_banned.length}개: ${ai_banned.slice(0, 3).join(', ')}`);
  if (table_duplicate.length > 0) reasons.push(`표 정보 중복 ${table_duplicate.length}개: ${table_duplicate.slice(0, 3).join(', ')}`);
  if (hallucination.stations.length > 0) reasons.push(`환각 역명: ${hallucination.stations.join(', ')}`);
  if (hallucination.landmarks.length > 0) reasons.push(`환각 시설: ${hallucination.landmarks.join(', ')}`);
  if (too_short) reasons.push(`너무 짧음 (${text.length}자, 최소 ${minLen})`);
  if (too_long) reasons.push(`너무 긺 (${text.length}자, 최대 ${maxLen})`);

  const ok = reasons.length === 0;

  return {
    ok,
    ai_banned,
    table_duplicate,
    hallucinated_stations: hallucination.stations,
    hallucinated_landmarks: hallucination.landmarks,
    too_short,
    too_long,
    reasons,
  };
}
