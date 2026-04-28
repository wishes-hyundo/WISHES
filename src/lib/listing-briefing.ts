// listing-briefing — Hybrid (사실 + 자연 산문 + 친근 톤 + 시각 배치)
// 사장님 명령:
//   • 마케팅 효과 — 친근감 + 진심
//   • 시각 배치 — 읽기 편하게, 눈에 잘 들어오게
//   • 위치노출 X (건물명, 동/구), 중복 X (층수/룸/옵션)

import type { NearestStation } from '@/lib/subway-finder';

export interface BriefingFacts {
  type: string;
  deal: string;
  is_full_option: boolean;
  has_parking: boolean;
  is_immediate_movein: boolean;
  is_new_building: boolean;
  rooms_for_target: number | null;
  station_top3?: NearestStation[];
  building_name?: string | null;
  gu?: string | null;
  dong?: string | null;
}

export function buildBriefingPrompt(f: BriefingFacts): string {
  const r = f.rooms_for_target ?? 1;
  const target = r >= 3 ? '3~4인 가족' : r >= 2 ? '신혼부부나 2인 가구' : '1인 직장인이나 학생';

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

  return `당신은 13년차 부동산 중개사입니다. 검증된 사실만 사용해서 고객에게 진심으로 추천하는 따뜻하고 친근한 한국어 글을 작성하세요.

[검증된 사실 — 이것만 사용. 변경/추가 X]
- 매물: ${f.type} (${f.deal})
${f.is_new_building ? '- 5년 이내 신축' : ''}
${f.is_full_option ? '- 풀옵션' : ''}
${f.has_parking ? '- 주차 가능' : ''}
${f.is_immediate_movein ? '- 즉시입주 가능 (공실)' : ''}
- 추천 대상: ${target}
${stationLines ? `- 가까운 지하철역:\n${stationLines}` : ''}

[톤 — 친근하고 진심 있게]
• 13년 경력 동네 중개사가 단골 고객에게 직접 추천하는 톤
• 어미는 부드럽게: "~드려요", "~이에요", "~거든요" 자연스럽게 (딱딱한 "~합니다" 반복 X)
• 인사말 OK: "안녕하세요", "정성껏 추천드리는 매물이에요"
• 친근 표현 OK: "직접 보시면 마음에 드실 거예요", "꼭 한번 들러 보세요", "연락 주세요"
• 진심 표현 OK: "정말 좋은 매물", "강력하게 추천드려요", "흔치 않은 조건"

[시각 배치 — 단락 구조]
정확히 3~4 단락으로 작성. 각 단락 사이는 빈 줄(\\n\\n) 으로 명확히 구분.

  1단락 — 인사 + 핵심 한 줄 추천 (1~2문장)
  2단락 — 매물 가치 자연스러운 설명 (2~3문장)
  3단락 — 교통/위치 가치 (1~2문장, 위 표기된 역만)
  4단락 (선택) — 추천 대상 + 행동 유도 마무리 (1~2문장)

[작성 규칙]
1. 한 단락은 2~3문장 (너무 길지 X)
2. 위 사실에 없는 정보 절대 추가 X:
   • 다른 역 이름 (위에 있는 역 외 절대 X)
   • 동/구/광역 지역 (관악구/신림동/강남/강북/종로/사당 등)
   • 건물명 절대 X (위치 추측 가능)
   • 학교/대학교/캠퍼스/학원가 X
   • 미세먼지/치안/공원/시세 X
3. 기본정보·옵션 카드 중복 X:
   • 층수 / 룸 개수 / 욕실 개수 / 면적 / 평수 X
   • 구체 옵션 (에어컨/세탁기/냉장고/인덕션/싱크대/엘리베이터 등) X
   • 가격/보증금/월세/관리비/주차비 X
4. 마케팅 과장 형용사는 신중히:
   • "따뜻한"/"포근한"/"감성"/"보금자리"/"힐링"/"아늑한" X (감각 단어)
   • "끝판왕"/"천국"/"가성비"/"완벽한 매물" X (과장)
   • "정말 좋은", "정말 편한", "강력 추천" 같은 진솔한 강조는 OK

[형식 — JSON만, description 에 \\n\\n 단락 구분 명확히]
{
  "title": "헤드라인 (15~28자, 친근한 톤, 핵심 가치 1~2개)",
  "description": "본문 (3~4단락, 단락 사이 \\n\\n, 200~400자)"
}`;
}

export function detectBriefingHallucination(
  text: string,
  f: BriefingFacts
): { hallucinated: boolean; offending?: string } {
  // 1. 다른 역
  const allowed = new Set<string>();
  if (f.station_top3) for (const s of f.station_top3) allowed.add(s.name);
  const matches = text.match(/([가-힣A-Za-z0-9]{2,10})역/g) || [];
  for (const m of matches) {
    const stem = m.replace(/역$/, '');
    if (!allowed.has(stem)) return { hallucinated: true, offending: m };
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

  // 3. 건물명
  if (f.building_name && f.building_name.length >= 2 && text.includes(f.building_name)) {
    return { hallucinated: true, offending: f.building_name };
  }

  // 4. 층수
  if (/(?:해당)?\s*\d+\s*층(?!\s*[건집])|총\s*\d+\s*층|\d+층\s*건물|\d+층\/\d+층/.test(text)) {
    const m = text.match(/(?:해당)?\s*\d+\s*층|\d+층\/\d+층/);
    return { hallucinated: true, offending: m ? m[0] : '층수' };
  }

  // 5. 룸/욕실
  if (/(?:룸|방|욕실|화장실)\s*[\d.]+\s*개|[\d.]+\s*(?:룸|방|욕실|화장실)/.test(text)) {
    const m = text.match(/(?:룸|방|욕실|화장실)\s*[\d.]+\s*개|[\d.]+\s*(?:룸|방|욕실|화장실)/);
    return { hallucinated: true, offending: m ? m[0] : '룸/욕실' };
  }

  // 6. 구체 옵션 (옵션 칩 중복)
  if (/에어컨|세탁기|냉장고|인덕션|싱크대|가스레인지|전자레인지|식기세척기|건조기|TV|텔레비전|오븐|비데|붙박이장|책상|책장|침대|소파|식탁|커튼|블라인드|엘리베이터|주방\s*가전/.test(text)) {
    const m = text.match(/에어컨|세탁기|냉장고|인덕션|싱크대|가스레인지|전자레인지|식기세척기|건조기|TV|텔레비전|오븐|비데|붙박이장|책상|책장|침대|소파|식탁|커튼|블라인드|엘리베이터|주방\s*가전/);
    return { hallucinated: true, offending: m ? m[0] : '옵션' };
  }

  // 7. 가격/면적
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

  // 9. 마케팅 과장 (감각/감성 단어만 — 진솔한 강조는 허용)
  const MKT_BAN = [
    /따뜻한|포근한|아늑한|감성|보금자리|힐링/,
    /끝판왕|천국|가성비|완벽한\s*매물|최고의\s*매물/,
  ];
  for (const re of MKT_BAN) {
    const m = text.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }

  return { hallucinated: false };
}

// ── Symbolic Fallback (LLM 실패 시) — 친근 톤 + 단락 구분 ──
export function buildSymbolicFallback(f: BriefingFacts): string {
  const paragraphs: string[] = [];

  // 1단락 — 인사 + 추천 한 줄
  const greetings: string[] = [];
  if (f.is_new_building && f.is_full_option) {
    greetings.push(`안녕하세요. 신축에 풀옵션까지 갖춘 좋은 ${f.type} 매물이에요.`);
  } else if (f.is_new_building) {
    greetings.push(`안녕하세요. 신축이라 시설 깔끔한 ${f.type} 매물 추천드려요.`);
  } else if (f.is_full_option) {
    greetings.push(`안녕하세요. 풀옵션으로 바로 입주 가능한 ${f.type} 매물이에요.`);
  } else {
    greetings.push(`안녕하세요. 정성껏 추천드리는 ${f.type} 매물이에요.`);
  }
  paragraphs.push(greetings.join(' '));

  // 2단락 — 매물 가치
  const valueLines: string[] = [];
  if (f.is_new_building && f.is_full_option) {
    valueLines.push('5년 이내 신축으로 시설 상태가 정말 좋고, 풀옵션이라 이사할 때 가전 걱정 없이 짐만 들고 들어가실 수 있어요.');
  } else if (f.is_new_building) {
    valueLines.push('5년 이내 신축이라 시설 상태가 정말 좋아요.');
  } else if (f.is_full_option) {
    valueLines.push('풀옵션이라 이사할 때 가전 걱정 없이 바로 입주 가능하시고요.');
  }
  if (f.is_immediate_movein) {
    valueLines.push('현재 공실 상태로 즉시 입주가 가능해서, 빠른 이사 일정에도 잘 맞춰드릴 수 있어요.');
  }
  if (valueLines.length > 0) paragraphs.push(valueLines.join(' '));

  // 3단락 — 교통
  const trafficLines: string[] = [];
  if (f.station_top3 && f.station_top3.length > 0) {
    const walkable = f.station_top3.filter((s) => {
      const min = s.walk_minutes ?? Math.round(s.distance_m / 80);
      return min <= 15;
    });
    if (walkable.length > 0) {
      const top = walkable[0];
      const min = top.walk_minutes ?? Math.round(top.distance_m / 80);
      trafficLines.push(`${top.name}역(${top.line})까지 도보 ${min}분 거리라 출퇴근이 정말 편하실 거예요.`);
      if (walkable.length > 1) {
        const second = walkable[1];
        const min2 = second.walk_minutes ?? Math.round(second.distance_m / 80);
        if (second.name !== top.name) {
          trafficLines.push(`${second.name}역(${second.line})도 도보 ${min2}분 거리에 있어서 노선 활용도가 높아요.`);
        }
      }
    }
  }
  if (f.has_parking) {
    trafficLines.push('차량 가지고 계신 분들도 주차 공간이 마련되어 있어 안심하고 이용하실 수 있어요.');
  }
  if (trafficLines.length > 0) paragraphs.push(trafficLines.join(' '));

  // 4단락 — 추천 대상 + 행동 유도
  const r = f.rooms_for_target ?? 1;
  const target = r >= 3 ? '3~4인 가족' : r >= 2 ? '신혼부부나 2인 가구' : '1인 직장인이나 학생';
  paragraphs.push(`${target}분께 정말 잘 맞는 매물이에요. 직접 보시면 마음에 드실 테니 편하게 연락 주세요!`);

  return paragraphs.join('\n\n');
}

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
