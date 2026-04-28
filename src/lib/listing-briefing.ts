// listing-briefing — Hybrid (사실 기반 + 자연 산문, 중복/위치노출 제거)
// 사장님 명령:
//   • 건물명 제거 (위치 추측 가능)
//   • 층수/룸/욕실/구체옵션/엘리베이터 제거 (기본정보·옵션 카드 중복)
//   • 구체 주차비 제거 (카드 중복)
//   • 역+도보분, 신축, 풀옵션, 즉시입주, 주차가능, 추천 대상 — 추천 가치로 유지

import type { NearestStation } from '@/lib/subway-finder';

export interface BriefingFacts {
  type: string;
  deal: string;
  is_full_option: boolean;
  has_parking: boolean;            // 가능 여부만 (구체 비용 X)
  is_immediate_movein: boolean;
  is_new_building: boolean;
  rooms_for_target: number | null; // 추천 대상 분류 용도만 (출력 X)
  station_top3?: NearestStation[];
  // 위치 노출 X — building_name / floor / room_shape / options_text 제거
  // raw_fields 기반 정보 X (특이사항도 노출 위험)
  building_name?: string | null;   // hallucination 검증용 (LLM 사용 X)
  gu?: string | null;              // hallucination 검증용
  dong?: string | null;            // hallucination 검증용
}

export function buildBriefingPrompt(f: BriefingFacts): string {
  const targetMap: Record<string, string> = {
    single: '1인 직장인 또는 학생',
    couple: '신혼부부 또는 2인 가구',
    family: '3~4인 가족',
    business: '사업자 또는 사무 용도',
  };
  const r = f.rooms_for_target ?? 1;
  const target = r >= 3 ? targetMap.family : r >= 2 ? targetMap.couple : targetMap.single;

  // 가까운 역 1-2개만 (도보 15분 이내)
  let stationLines = '';
  if (f.station_top3 && f.station_top3.length > 0) {
    const walkable = f.station_top3.filter((s) => {
      const min = s.walk_minutes ?? Math.round(s.distance_m / 80);
      return min <= 15;
    });
    if (walkable.length > 0) {
      stationLines = walkable.slice(0, 2).map((s) => {
        const min = s.walk_minutes ?? Math.round(s.distance_m / 80);
        return `  • ${s.name}역(${s.line}) 도보 ${min}분`;
      }).join('\n');
    }
  }

  return `당신은 13년차 부동산 중개사입니다. 아래 검증된 사실만 사용해 고객에게 매물을 추천하는 자연스러운 한국어 산문을 작성하세요.

[검증된 사실 — 이것만 사용. 단 하나도 추가/변경 X]
- 매물 종류: ${f.type}
- 거래 유형: ${f.deal}
${f.is_new_building ? '- 5년 이내 신축' : ''}
${f.is_full_option ? '- 풀옵션 (구체 옵션은 옵션 칩에 표시되니 본문에는 "풀옵션" 으로만)' : ''}
${f.has_parking ? '- 주차 가능 (비용은 별도 표시되니 본문에는 가능 여부만)' : ''}
${f.is_immediate_movein ? '- 즉시입주 가능 (공실)' : ''}
- 추천 대상: ${target}
${stationLines ? `- 가까운 지하철역:\n${stationLines}` : ''}

[작성 규칙 — 위반 시 reject]
1. 자연스러운 한국어 산문 (4~6 문장, 150~300자)
2. bullet점 / 이모지 / 마크다운 X (순수 산문체)
3. 위 사실에 없는 정보 절대 추가 X:
   • 다른 역 이름 (위에 표기된 역 외 모두 X)
   • 동/구/광역 지역 (관악구/신림동/강남/강북/종로/사당/노량진 등)
   • 건물명 (절대 X — 위치 추측 가능)
   • 학교/대학교/캠퍼스/학원가/교육특구 X
   • 미세먼지/공기질/치안/공원/산책로 X
   • 시세/가격/평당 X
4. 기본정보·옵션 카드와 중복 X — 본문에 작성 금지:
   • 층수 / 해당층 / 총층 X (예: "4층", "16층 건물")
   • 룸/욕실 개수 X (예: "1.5룸", "원룸 1개")
   • 구체 옵션 X (에어컨/세탁기/냉장고/인덕션/싱크대/주방가전 등)
   • 엘리베이터 X (옵션 칩에 있음)
   • 구체 주차비 X ("월 9만원" 같은 비용)
   • 면적/평수/㎡ X
   • 가격/보증금/월세/관리비 X
   • 준공일자/년도 X (신축 boolean 만 OK)
5. 마케팅 과장 표현 X: 따뜻한/포근한/감성/보금자리/끝판왕/천국/완벽한
6. 사실 그대로 자연스럽게:
   • "신축" 이면 "시설 상태가 좋습니다" OK
   • "풀옵션" 이면 "추가 가전 구매 없이 바로 거주 가능" OK
   • "도보 4분" 이면 "출퇴근 동선이 편리" OK
   • "즉시입주" 이면 "빠른 이사 일정에 적합" OK

[형식 — JSON만]
{
  "title": "헤드라인 (15~25자, 위치 노출 X, 중복 X, 매물 핵심 가치 1~2개)",
  "description": "산문 본문 (150~300자, 4~6문장)"
}`;
}

// ── 환각 검증 강화 (위치 노출 + 중복 모두 reject) ──
export function detectBriefingHallucination(
  text: string,
  f: BriefingFacts
): { hallucinated: boolean; offending?: string } {
  // 1. 다른 역 이름
  const allowedStations = new Set<string>();
  if (f.station_top3) for (const s of f.station_top3) allowedStations.add(s.name);
  const stationMatches = text.match(/([가-힣A-Za-z0-9]{2,10})역/g) || [];
  for (const m of stationMatches) {
    const stem = m.replace(/역$/, '');
    if (!allowedStations.has(stem)) return { hallucinated: true, offending: m };
  }

  // 2. 동/구/광역
  const REGIONS = [
    /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*(?:특별시|광역시|도)?/,
    /[가-힣]{2,4}구\s/, /[가-힣]{1,4}동\s/,
    /강남|강북|강동|강서|종로|중구|용산|성동|광진|동대문|중랑|성북|도봉|노원|은평|서대문|마포|양천|영등포|동작|관악|서초|송파|광진|구로|금천/,
    /사당|노량진|명동|광화문|을지로|충무로|이태원|홍대|신촌|건대|성수|왕십리|압구정|청담|신사|논현|역삼|선릉|삼성/,
  ];
  for (const re of REGIONS) {
    const m = text.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }

  // 3. 건물명 (facts.building_name 등장 시 reject)
  if (f.building_name && f.building_name.length >= 2 && text.includes(f.building_name)) {
    return { hallucinated: true, offending: f.building_name };
  }

  // 4. 층수 표기 (중복)
  if (/(?:해당)?\s*\d+\s*층(?!\s*[건집])|총\s*\d+\s*층|\d+층\s*건물|\d+층\/\d+층/.test(text)) {
    const m = text.match(/(?:해당)?\s*\d+\s*층|\d+층\/\d+층/);
    return { hallucinated: true, offending: m ? m[0] : '층수' };
  }

  // 5. 룸/욕실 개수 (중복)
  if (/(?:룸|방|욕실|화장실)\s*[\d.]+\s*개|[\d.]+\s*(?:룸|방|욕실|화장실)\s*(?:구조)?/.test(text)) {
    const m = text.match(/(?:룸|방|욕실|화장실)\s*[\d.]+\s*개|[\d.]+\s*(?:룸|방|욕실|화장실)/);
    return { hallucinated: true, offending: m ? m[0] : '룸/욕실 개수' };
  }

  // 6. 구체 옵션 (옵션 칩 중복)
  if (/에어컨|세탁기|냉장고|인덕션|싱크대|가스레인지|전자레인지|식기세척기|건조기|TV|텔레비전|오븐|비데|붙박이장|책상|책장|침대|소파|식탁|커튼|블라인드|엘리베이터|주방\s*가전/.test(text)) {
    const m = text.match(/에어컨|세탁기|냉장고|인덕션|싱크대|가스레인지|전자레인지|식기세척기|건조기|TV|텔레비전|오븐|비데|붙박이장|책상|책장|침대|소파|식탁|커튼|블라인드|엘리베이터|주방\s*가전/);
    return { hallucinated: true, offending: m ? m[0] : '옵션' };
  }

  // 7. 가격/면적/관리비 (카드 중복)
  if (/(?:보증금|월세|전세|매매가|관리비|공과금)|[\d,]+\s*(?:만원|억|평|㎡|m²)|준공\s*\d+년?/.test(text)) {
    const m = text.match(/보증금|월세|전세|매매가|관리비|[\d,]+\s*(?:만원|억|평|㎡|m²)/);
    return { hallucinated: true, offending: m ? m[0] : '가격/면적' };
  }

  // 8. 학교/시세/환경
  const TOPICS = [
    /대학교|캠퍼스|학원가|교육특구|학세권/,
    /미세먼지|공기질|황사/,
    /치안|범죄|안전등급/,
    /상권|상가\s*밀집/,
    /공원|산책로|하천|산[\s\.,]/,
    /시세|평균\s*가격|호가/,
    /역세권|초역세권|주요\s*지하철역/,
    /도보권/,
  ];
  for (const re of TOPICS) {
    const m = text.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }

  // 9. 마케팅 과장
  const MKT = [/따뜻한|포근한|감성|보금자리|힐링|아늑한/, /끝판왕|천국|가성비|완벽한|최고의\s*매물/];
  for (const re of MKT) {
    const m = text.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }

  return { hallucinated: false };
}

// ── Symbolic Fallback (LLM 모두 실패 시) — 자연 산문 ──
export function buildSymbolicFallback(f: BriefingFacts): string {
  const sentences: string[] = [];

  // 1. 신축 + 풀옵션 + 즉시입주 — 매물 가치 보석 같은 조합
  const features: string[] = [];
  if (f.is_new_building) features.push('5년 이내 신축으로 시설 상태가 좋고');
  if (f.is_full_option) features.push('풀옵션 구성이라 별도의 가전 구매 없이 바로 거주가 가능합니다');
  if (features.length === 2) {
    sentences.push(`${features[0]}, ${features[1]}.`);
  } else if (features.length === 1) {
    sentences.push(features[0].replace(/^/, '') + '.');
  } else if (f.is_full_option) {
    sentences.push('풀옵션 구성이라 별도의 가전 구매 없이 바로 거주가 가능합니다.');
  }

  // 2. 즉시입주
  if (f.is_immediate_movein) {
    sentences.push('현재 공실 상태라 빠른 이사 일정에 맞춰 즉시 거주를 시작하실 수 있습니다.');
  }

  // 3. 교통
  if (f.station_top3 && f.station_top3.length > 0) {
    const walkable = f.station_top3.filter((s) => {
      const min = s.walk_minutes ?? Math.round(s.distance_m / 80);
      return min <= 15;
    });
    if (walkable.length > 0) {
      const top = walkable[0];
      const min = top.walk_minutes ?? Math.round(top.distance_m / 80);
      sentences.push(`${top.name}역(${top.line})까지 도보 ${min}분 거리로 출퇴근 동선이 편리합니다.`);
      if (walkable.length > 1) {
        const second = walkable[1];
        const min2 = second.walk_minutes ?? Math.round(second.distance_m / 80);
        if (second.name !== top.name) {
          sentences.push(`${second.name}역(${second.line})도 도보 ${min2}분 거리에 있어 노선 활용도가 높습니다.`);
        }
      }
    }
  }

  // 4. 주차
  if (f.has_parking) {
    sentences.push('차량 보유자도 주차 공간이 확보되어 있어 부담 없이 이용하실 수 있습니다.');
  }

  // 5. 추천 대상
  const r = f.rooms_for_target ?? 1;
  const target = r >= 3 ? '3~4인 가족' : r >= 2 ? '신혼부부나 2인 가구' : '1인 직장인이나 학생';
  sentences.push(`${target}분께 추천드릴 수 있는 매물입니다.`);

  return sentences.length > 0 ? sentences.join(' ') : '추천 정보 검토 중입니다.';
}

// ── Title (헤드라인) ──
export function buildSymbolicTitle(f: BriefingFacts): string {
  const parts: string[] = [];
  if (f.station_top3 && f.station_top3.length > 0) {
    const top = f.station_top3[0];
    const min = top.walk_minutes ?? Math.round(top.distance_m / 80);
    if (min <= 5) parts.push(`${top.name}역 도보 ${min}분`);
    else if (min <= 10) parts.push(`${top.name}역 가까운`);
  }
  if (f.is_new_building) parts.push('신축');
  if (f.is_full_option) parts.push('풀옵션');
  parts.push(f.type);
  return parts.join(' ').slice(0, 30);
}
