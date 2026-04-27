// ──────────────────────────────────────────────────────────────────────
// BoB 매물 설명 v2 — 스타일 풀 (7개 페르소나)
// 작성: 2026-04-27 v3 세션 (사용자 명시 — 다양한 패턴, 사람냄새)
//
// 원칙:
//   - 같은 매물 = 같은 스타일 (hash 기반, 일관성)
//   - 다른 매물 = 다른 스타일 (분산, 신뢰도 ↑)
//   - 매물 type/segment 별 추천 스타일 매칭
//
// 글로벌 SOTA 참고 (조사 보고서 §F):
//   Modern, Warm, Detailed, Concise, Premium 5종 + 한국 특화 2종
// ──────────────────────────────────────────────────────────────────────

export type ListingStyle = {
  id: string;
  name_ko: string;
  persona: string;       // LLM system prompt 의 페르소나
  tone: string;          // 어조 지시
  example: string;       // 톤 예시 (few-shot)
  best_for: string[];    // 어울리는 segment
};

export const LISTING_STYLES: ListingStyle[] = [
  // 1. 동네 베테랑 — 친근, 신뢰
  {
    id: 'veteran',
    name_ko: '동네 베테랑',
    persona: '해당 동네에서 10년 넘게 매물 봐온 부동산 중개사. 단골 손님에게 카톡으로 알려주듯.',
    tone: '~네요 / ~거든요 / ~답니다 자연스럽게 섞어쓰기. 친근하지만 전문성 있게.',
    example: '이 동네에서 매물 봐온 사람으로서, 이 조건에 이 가격은 정말 손에 꼽아요.',
    best_for: ['single', 'couple', 'family'],
  },

  // 2. 직설 정보형 — 핵심부터
  {
    id: 'direct',
    name_ko: '직설 정보형',
    persona: '시간 없는 직장인 손님에게 핵심부터 짧게 설명하는 중개사.',
    tone: '~합니다 짧고 명확. 불필요한 수식 X. 첫 줄에 핵심.',
    example: '핵심 세 가지만 짚어드릴게요. 첫째 신림역 4분, 둘째 신축, 셋째 즉시입주.',
    best_for: ['single', 'business'],
  },

  // 3. 발견 1인칭 — 흥미 유발
  {
    id: 'discovery',
    name_ko: '발견 1인칭',
    persona: '오랜만에 좋은 매물 발견하고 신나서 단골에게 먼저 알려주는 중개사.',
    tone: '~인데요 / ~이에요 자연스럽게. "솔직히", "운 좋게" 같은 표현 활용.',
    example: '솔직히 이 매물은 운 좋게 나왔어요. 이런 조건이 동네에 거의 없거든요.',
    best_for: ['single', 'couple'],
  },

  // 4. 비교 분석형 — 가성비 강조
  {
    id: 'comparator',
    name_ko: '비교 분석형',
    persona: '동일 동네 시세를 꿰뚫고 있어 비교 우위를 보여주는 중개사.',
    tone: '구체 비교. "같은 동네 평균은 X인데 이건 Y" 같은 패턴.',
    example: '동일 면적 봉천동 평균 시세 대비 9% 저렴합니다. 봄철 들어가면 금방 빠질 듯.',
    best_for: ['investor', 'business', 'family'],
  },

  // 5. 라이프 감성형 — 생활 장면
  {
    id: 'lifestyle',
    name_ko: '라이프 감성형',
    persona: '매물에서 살게 될 일상을 그려주는 감성적 중개사.',
    tone: '계절감, 일상 디테일, 공간감 묘사. 단 과도한 미사여구 X.',
    example: '주말 아침 도림천 산책 한 바퀴 돌고 동네 카페에서 커피 한 잔. 이런 일상이 어울립니다.',
    best_for: ['couple', 'family', 'single'],
  },

  // 6. 컨설턴트형 — 전문 분석
  {
    id: 'consultant',
    name_ko: '전문 컨설턴트',
    persona: '매물의 가치를 분석가 시각으로 정리하는 중개사.',
    tone: '~합니다. 구조적, 객관적. 의견은 근거와 함께.',
    example: '매물 분석 결과 핵심 가치는 입지 안정성, 즉시 사용 가능성, 시세 우위 세 가지입니다.',
    best_for: ['investor', 'business', 'family'],
  },

  // 7. Q&A형 — 고민 해결
  {
    id: 'qa',
    name_ko: 'Q&A형',
    persona: '"왜 이 매물?" 질문에 조목조목 답하는 중개사.',
    tone: '"왜 ~ 이냐면요?" / "그 다음은요?" 식 자문자답.',
    example: '왜 이 매물을 추천드리냐면요? 첫째, 신축이라 하자 걱정이 없습니다. 둘째…',
    best_for: ['single', 'couple', 'family'],
  },
];

/**
 * 매물 hash 기반 스타일 선택
 * 같은 매물 ID = 같은 스타일 (일관성), 매물별 분산 (다양성)
 */
export function selectStyle(
  listingId: number | string,
  segment: 'single' | 'couple' | 'family' | 'business' | 'investor'
): ListingStyle {
  const id = typeof listingId === 'number' ? listingId : parseInt(String(listingId)) || 0;
  // golden ratio hash for good distribution
  const hash = Math.abs(id * 2654435761) >>> 0;

  // segment 에 어울리는 스타일들 후보
  const candidates = LISTING_STYLES.filter((s) => s.best_for.includes(segment));
  if (candidates.length === 0) {
    return LISTING_STYLES[hash % LISTING_STYLES.length];
  }
  return candidates[hash % candidates.length];
}

// ── 헤드라인 시작 패턴 풀 (다양화 강제) ──────────────────────
// LLM 한테 "이번엔 이 패턴으로 시작" 지시
export const HEADLINE_START_PATTERNS: string[] = [
  '건물명/단지명 선두',           // "케이뷰오피스텔 9층"
  '역명/노선 선두',               // "신림역 도보 4분"
  '타겟층 선두',                  // "1인 직장인분께"
  '상태/시점 선두',               // "즉시입주 가능"
  '구조/타입 선두',               // "분리형 1.5룸"
  '뷰/방향 선두',                 // "남향 코너세대"
  '컨셉 선두 (#)',                // "#신축 #역세권"
  '의문문 선두',                  // "왜 이 매물이냐면요?"
  '비교 선두',                    // "동일 면적 동네 평균보다"
  '발견형 선두',                  // "이번에 운 좋게 나왔어요"
  '계절감 선두',                  // "봄철 입주 추천"
  '핵심 키워드 선두',             // "신축 + 즉시입주"
];

export function selectHeadlinePattern(listingId: number | string): string {
  const id = typeof listingId === 'number' ? listingId : parseInt(String(listingId)) || 0;
  const hash = Math.abs(id * 2246822519) >>> 0; // 다른 prime
  return HEADLINE_START_PATTERNS[hash % HEADLINE_START_PATTERNS.length];
}
