// listing-briefing — Hybrid + 다양성 (수백 패턴, 매물별 결정적)
// 사장님 명령:
//   • 친근감 + 진심 + 시각 배치 (3~4 단락)
//   • 패턴 수십 수백 가지 매물마다 다양하게
// 다양성 = 매물 ID 해시 → pool 에서 결정적 선택 (같은 매물은 항상 같은 글)

import type { NearestStation } from '@/lib/subway-finder';

export interface BriefingFacts {
  id: number;  // 다양성 해시 시드
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

// ── 결정적 해시 (golden ratio) ──
function hashPick<T>(seed: number, salt: string, pool: T[]): T {
  let h = seed;
  for (let i = 0; i < salt.length; i++) h = (h * 31 + salt.charCodeAt(i)) | 0;
  return pool[Math.abs(h * 2654435761) % pool.length];
}

// ── 인사말 풀 (15개) ──
const GREETINGS: ((type: string) => string)[] = [
  (t) => `안녕하세요. 정성껏 추천드리는 ${t} 매물이에요.`,
  (t) => `안녕하세요. 단골 고객님께 먼저 보여드리고 싶었던 ${t}예요.`,
  (t) => `오늘은 정말 좋은 ${t} 하나 소개해드릴게요.`,
  (t) => `안녕하세요! 좋은 조건의 ${t} 골라서 추천드려요.`,
  (_t) => `이런 조건의 매물 흔치 않은데, 한번 보세요.`,
  (t) => `오랜만에 마음에 드는 ${t}라 추천드립니다.`,
  (_t) => `급하신 분께 딱 좋은 매물이라 우선 안내드려요.`,
  (_t) => `안녕하세요. 직접 가서 확인하고 추천드리는 매물이에요.`,
  (_t) => `안녕하세요. 꼼꼼히 살펴본 매물이라 자신 있게 추천드려요.`,
  (t) => `이번에 새로 들어온 ${t} 중 컨디션 좋은 곳이라 보여드려요.`,
  (_t) => `안녕하세요. 이런 매물을 찾고 계셨다면 꼭 보세요.`,
  (_t) => `안녕하세요. 직접 가보고 깜짝 놀란 매물이에요.`,
  (_t) => `고객님 조건에 잘 맞을 것 같아 우선 안내드려요.`,
  (_t) => `조건 좋은 매물이라 빠르게 알려드려요.`,
  (_t) => `안녕하세요. 정말 자신 있게 추천드릴 수 있는 매물이에요.`,
];

// ── 신축 표현 풀 (8개) ──
const NEW_PHRASES = [
  '5년 이내 신축이라 시설 상태가 정말 좋아요.',
  '지은 지 얼마 안된 새 건물이라 깔끔합니다.',
  '신축에 가까운 컨디션이라 들어가서 보시면 마음에 드실 거예요.',
  '최근에 지어진 깔끔한 건물이라 시설 컨디션이 좋아요.',
  '5년 이내 신축이라 내부도 외관도 깨끗해요.',
  '새 건물이라 별다른 손볼 곳 없이 그대로 들어가시면 됩니다.',
  '신축급 컨디션이라 새것 같은 느낌으로 거주하실 수 있어요.',
  '갓 지어진 건물이라 시설 상태가 정말 만족스러우실 거예요.',
];

// ── 풀옵션 표현 풀 (8개) ──
const FULLOPT_PHRASES = [
  '풀옵션이라 짐만 들고 바로 들어가시면 됩니다.',
  '필요한 가전이 다 갖춰져 있어 추가 비용 부담이 없어요.',
  '풀옵션 구성이라 이사 비용 절감되고 편하게 이사하실 수 있어요.',
  '가전 풀세트라 따로 사실 필요 없어요.',
  '풀옵션이 있어 입주 즉시 생활이 가능합니다.',
  '필수 가전이 모두 마련되어 있어 신경 쓰실 게 적어요.',
  '풀옵션 구성으로 가전 비용 부담이 없어 부담이 줄어요.',
  '가전이 다 있어서 따로 챙기실 게 적습니다.',
];

// ── 즉시입주 풀 (6개) ──
const IMMEDIATE_PHRASES = [
  '현재 공실 상태라 즉시 입주가 가능해요.',
  '지금 바로 입주하실 수 있어요. 빠른 이사에도 잘 맞춰드릴 수 있어요.',
  '원하시는 날짜에 맞춰 바로 들어가실 수 있어 일정 잡기 편해요.',
  '공실이라 빠르게 이사 일정 잡으실 수 있어요.',
  '계약 후 바로 입주가 가능해서 급하신 분들께 딱이에요.',
  '즉시 입주 가능한 매물이라 일정 부담 적으세요.',
];

// ── 교통 풀 (10개) — {name}, {line}, {min} 치환 ──
const TRAFFIC_PHRASES = [
  '{name}역({line})까지 도보 {min}분이라 출퇴근이 정말 편하실 거예요.',
  '{name}역까지 걸어서 {min}분이라 매일 다니기 좋아요. {line} 노선이라 활용도도 높고요.',
  '도보 {min}분 안에 {name}역({line})이 있어 교통이 정말 편리합니다.',
  '출퇴근하시기 좋게 {name}역({line})이 도보 {min}분 거리예요.',
  '{name}역({line}) 가는 길이 {min}분 안 걸려서 일상 동선이 편해요.',
  '{name}역({line})까지 도보 {min}분이라 시간 절약되시고 편하실 거예요.',
  '걸어서 {min}분이면 {name}역({line})이라 교통 부담이 거의 없어요.',
  '{name}역({line})까지 천천히 걸어도 {min}분이라 출퇴근이 부담 없어요.',
  '{name}역({line}) 가까운 위치라 도보 {min}분이면 편하게 이용하실 수 있어요.',
  '도보 {min}분 거리에 {name}역({line})이 있어 통근이 수월합니다.',
];

// ── 두 번째 역 표현 (5개) ──
const SECOND_STATION_PHRASES = [
  '{name}역({line})도 도보 {min}분이라 노선 활용도가 높아요.',
  '{name}역({line})도 도보 {min}분 안에 있어서 다른 노선도 편하게 타실 수 있어요.',
  '추가로 {name}역({line})도 도보 {min}분이면 닿아서 교통 선택지가 많아요.',
  '{name}역({line})까지도 {min}분 거리라 노선 변경이 편리합니다.',
  '근처에 {name}역({line})도 있어서 {min}분이면 가실 수 있어요.',
];

// ── 주차 표현 풀 (6개) ──
const PARKING_PHRASES = [
  '차량 가지고 계신 분들도 주차 공간이 마련되어 있어 안심하고 이용하실 수 있어요.',
  '주차도 가능하니 차 있으신 분께 부담이 적어요.',
  '주차 공간이 확보되어 있어 차량 보유자에게 좋아요.',
  '차 있으신 분도 걱정 없이 이용하실 수 있도록 주차 공간이 있어요.',
  '주차장이 있으니 차량 운영하시는 분께 편리해요.',
  '주차 가능해서 차 있으신 분들도 부담 없이 거주하실 수 있어요.',
];

// ── 추천 대상 + 마무리 풀 (12개) ──
const CTA_PHRASES = [
  '{target}분께 정말 잘 맞는 매물이에요. 편하게 연락 주세요!',
  '{target}분께 추천드리고 싶은 매물입니다. 직접 보시면 마음에 드실 거예요.',
  '{target}에게 안성맞춤인 조건이에요. 꼭 한번 들러보세요.',
  '{target}분이라면 놓치기 아까운 매물이에요. 미리 보러 오세요.',
  '{target}분께 자신 있게 추천드려요. 언제든 연락 주시면 보여드릴게요.',
  '{target}분께 잘 어울리는 조건이에요. 시간 되실 때 한번 와서 보세요.',
  '{target}분이라면 분명 마음에 드실 거예요. 지금 바로 연락 주세요.',
  '{target}분께 권해드리고 싶은 매물이에요. 궁금하시면 편하게 문의 주세요.',
  '{target}분이 보시면 만족하실 매물이에요. 직접 와서 확인해 보세요.',
  '{target}분이라면 후회 없으실 거예요. 일정 맞춰 안내해드릴게요.',
  '{target}분께 딱 맞는 컨디션이에요. 미루지 마시고 한번 보러 오세요.',
  '{target}에게 어울리는 매물이라 자신 있게 권해드려요. 연락 주시면 친절히 안내해드릴게요.',
];

// ── 추천 대상 표현 풀 (각 카테고리 5개) ──
const TARGET_POOLS: Record<string, string[]> = {
  family: ['3~4인 가족', '아이 키우시는 가족', '자녀와 함께 거주하실 가족', '가족 단위 입주', '3~4인 가구'],
  couple: ['신혼부부', '신혼이나 2인 가구', '커플이나 신혼부부', '2인 거주 예정인 분', '신혼이나 동거 가구'],
  single: ['1인 직장인이나 학생', '혼자 거주하시는 분', '직장인 1인 가구', '1인 자취하시는 분', '직장인이나 학생 1인 거주'],
};

// ── 풀에서 fact 기반 선택 ──
function pickGreeting(f: BriefingFacts): string {
  const fn = hashPick(f.id, 'greet', GREETINGS);
  return fn(f.type);
}

function pickValueParagraph(f: BriefingFacts): string {
  const parts: string[] = [];
  if (f.is_new_building) parts.push(hashPick(f.id, 'new', NEW_PHRASES));
  if (f.is_full_option) parts.push(hashPick(f.id, 'opt', FULLOPT_PHRASES));
  if (f.is_immediate_movein) parts.push(hashPick(f.id, 'imm', IMMEDIATE_PHRASES));
  return parts.join(' ');
}

function pickTrafficParagraph(f: BriefingFacts): string {
  if (!f.station_top3 || f.station_top3.length === 0) return '';
  const walkable = f.station_top3.filter((s) => {
    const min = s.walk_minutes ?? Math.round(s.distance_m / 80);
    return min <= 15;
  });
  if (walkable.length === 0) return '';

  const parts: string[] = [];
  const top = walkable[0];
  const min = top.walk_minutes ?? Math.round(top.distance_m / 80);
  parts.push(
    hashPick(f.id, 'traffic1', TRAFFIC_PHRASES)
      .replace('{name}', top.name).replace('{line}', top.line).replace('{min}', String(min))
  );

  if (walkable.length > 1) {
    const second = walkable[1];
    const min2 = second.walk_minutes ?? Math.round(second.distance_m / 80);
    if (second.name !== top.name) {
      parts.push(
        hashPick(f.id, 'traffic2', SECOND_STATION_PHRASES)
          .replace('{name}', second.name).replace('{line}', second.line).replace('{min}', String(min2))
      );
    }
  }

  if (f.has_parking) {
    parts.push(hashPick(f.id, 'park', PARKING_PHRASES));
  }
  return parts.join(' ');
}

function pickCtaParagraph(f: BriefingFacts): string {
  const r = f.rooms_for_target ?? 1;
  const cat = r >= 3 ? 'family' : r >= 2 ? 'couple' : 'single';
  const target = hashPick(f.id, 'target', TARGET_POOLS[cat]);
  return hashPick(f.id, 'cta', CTA_PHRASES).replace('{target}', target);
}

// ── prompt — 매물별 페르소나/톤 변동 (다양성) ──
const PERSONAS = [
  { name: '동네 단골 중개사', tone: '친근하고 따뜻한' },
  { name: '신혼집 전문 중개사', tone: '정중하고 다정한' },
  { name: '직장인 매물 전문 중개사', tone: '간결하고 효율적인' },
  { name: '꼼꼼한 13년차 베테랑', tone: '신뢰감 있고 진중한' },
  { name: '활기찬 동네 중개사', tone: '밝고 활기찬' },
  { name: '친절한 시니어 중개사', tone: '편안하고 친절한' },
  { name: '트렌디한 젊은 중개사', tone: '캐주얼하고 트렌디한' },
  { name: '꼼꼼히 가서 보는 중개사', tone: '실용적이고 솔직한' },
];

const HEADLINE_PATTERNS = [
  '{station} 도보 {min}분 {feature} {type}',
  '{feature} {type}, {station} 가까워요',
  '{station} 가까운 {feature} {type}',
  '바로 입주 가능한 {feature} {type}',
  '{feature} {type} | {station} 도보권',
  '{station} 도보 {min}분 거리 {type}',
  '{type} 추천! {feature} 갖춘 매물',
  '{feature} {type} | 신속 입주 가능',
  '{type} 매물 — {feature} | {station}',
  '꼭 보셔야 할 {feature} {type}',
  '{station} {min}분 {type}',
  '바로 들어갈 수 있는 {type} | {feature}',
];

export function buildBriefingPrompt(f: BriefingFacts): string {
  const persona = hashPick(f.id, 'persona', PERSONAS);
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

  return `당신은 13년차 ${persona.name}입니다. ${persona.tone} 어조로 검증된 사실만 사용해서 고객에게 추천하는 글을 작성하세요.

[검증된 사실 — 변경/추가 X]
- 매물: ${f.type} (${f.deal})
${f.is_new_building ? '- 5년 이내 신축' : ''}
${f.is_full_option ? '- 풀옵션' : ''}
${f.has_parking ? '- 주차 가능' : ''}
${f.is_immediate_movein ? '- 즉시입주 가능' : ''}
- 추천 대상: ${target}
${stationLines ? `- 가까운 지하철역:\n${stationLines}` : ''}

[톤 — ${persona.tone}]
• 어미는 부드럽게: ~드려요/~이에요/~거든요/~합니다 자연스럽게 변형
• 인사말 OK, 친근 표현 OK, 진심 표현 OK
• 매번 다른 단어/문장으로 — 같은 패턴 반복 X

[시각 배치 — 정확히 3~4 단락, 단락 사이 빈 줄(\\n\\n)]
1단락: 인사 + 핵심 추천 (1~2문장)
2단락: 매물 가치 (2~3문장)
3단락: 교통/주차 (1~2문장)
4단락: 추천 대상 + 행동 유도 (1~2문장)

[작성 규칙]
1. 위 사실에 없는 정보 추가 X (다른 역/동/구/광역/건물명/학교/시세/환경 모두 X)
2. 카드 중복 X (층수/룸/욕실/구체옵션/엘리베이터/가격/면적 X)
3. 마케팅 과장 형용사 X (따뜻한/포근한/감성/보금자리/끝판왕/완벽한)
4. 진솔한 강조는 OK (정말 좋은/강력 추천/흔치 않은)
5. 매번 다른 표현 사용 — 패턴 다양화 노력

[형식 — JSON만]
{
  "title": "헤드라인 (15~28자)",
  "description": "본문 (3~4단락, 단락 사이 \\n\\n, 200~400자)"
}`;
}

// ── 환각 검증 (변경 없음) ──
export function detectBriefingHallucination(
  text: string,
  f: BriefingFacts
): { hallucinated: boolean; offending?: string } {
  const allowed = new Set<string>();
  if (f.station_top3) for (const s of f.station_top3) allowed.add(s.name);
  const matches = text.match(/([가-힣A-Za-z0-9]{2,10})역/g) || [];
  for (const m of matches) {
    const stem = m.replace(/역$/, '');
    if (!allowed.has(stem)) return { hallucinated: true, offending: m };
  }

  // 1.5 숫자 검증 — '{역}역 ~ 도보 N분' 의 N 이 facts 의 walk_minutes 와 일치하는지
  if (f.station_top3) {
    // '신림역 도보 4분', '봉천역까지 5분', '신림역(2호선) 도보 4분' 등 모든 변형
    const walkPattern = /([가-힣A-Za-z0-9]{2,10})역(?:\([^)]+\))?(?:까지)?(?:\s|[\u00b7,])*도보(?:로)?\s*(\d+)\s*분/g;
    let wm: RegExpExecArray | null;
    while ((wm = walkPattern.exec(text)) !== null) {
      const stationName = wm[1];
      const claimedMin = parseInt(wm[2], 10);
      const factStation = f.station_top3.find((s) => s.name === stationName);
      if (factStation) {
        const realMin = factStation.walk_minutes ?? Math.round(factStation.distance_m / 80);
        // 1분 오차 허용 (반올림 차이)
        if (Math.abs(claimedMin - realMin) > 1) {
          return { hallucinated: true, offending: `${stationName}역 도보 ${claimedMin}분 (실제 ${realMin}분)` };
        }
      }
    }
    // '5분 거리' 같은 모호한 거리 표기도 검사
    const vagueDistPattern = /([가-힣A-Za-z0-9]{2,10})역(?:\([^)]+\))?(?:까지|도)?\s*([\d]+)\s*분\s*(?:거리|이내|안)/g;
    while ((wm = vagueDistPattern.exec(text)) !== null) {
      const stationName = wm[1];
      const claimedMin = parseInt(wm[2], 10);
      const factStation = f.station_top3.find((s) => s.name === stationName);
      if (factStation) {
        const realMin = factStation.walk_minutes ?? Math.round(factStation.distance_m / 80);
        if (Math.abs(claimedMin - realMin) > 1) {
          return { hallucinated: true, offending: `${stationName}역 ${claimedMin}분 거리 (실제 ${realMin}분)` };
        }
      }
    }
  }

  const REGIONS = [
    /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*(?:특별시|광역시|도)?/,
    // 동/구 다음 모든 조사 (의/은/는/이/가/에/로/에서/으로) + 공백 + 끝
    /[가-힣]{2,4}구(?:[\s에의은는이가로])/, /[가-힣]{1,4}동(?:[\s에의은는이가로]|$)/,
    /강남|강북|강동|강서|종로|중구|용산|성동|광진|동대문|중랑|성북|도봉|노원|은평|서대문|마포|양천|영등포|동작|관악|서초|송파|광진|구로|금천/,
    /사당|노량진|명동|광화문|을지로|충무로|이태원|홍대|신촌|건대|성수|왕십리|압구정|청담|신사|논현|역삼|선릉|삼성/,
    /먹자골목|카페거리|상가\s*밀집|풍부한\s*생활편의/,  // 광역 추측 표현
  ];
  for (const re of REGIONS) {
    const m = text.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }

  if (f.building_name && f.building_name.length >= 2 && text.includes(f.building_name)) {
    return { hallucinated: true, offending: f.building_name };
  }

  if (/(?:해당)?\s*\d+\s*층(?!\s*[건집])|총\s*\d+\s*층|\d+층\s*건물|\d+층\/\d+층/.test(text)) {
    const m = text.match(/(?:해당)?\s*\d+\s*층|\d+층\/\d+층/);
    return { hallucinated: true, offending: m ? m[0] : '층수' };
  }
  if (/(?:룸|방|욕실|화장실)\s*[\d.]+\s*개|[\d.]+\s*(?:룸|방|욕실|화장실)/.test(text)) {
    const m = text.match(/(?:룸|방|욕실|화장실)\s*[\d.]+\s*개|[\d.]+\s*(?:룸|방|욕실|화장실)/);
    return { hallucinated: true, offending: m ? m[0] : '룸/욕실' };
  }
  if (/에어컨|세탁기|냉장고|인덕션|싱크대|가스레인지|전자레인지|식기세척기|건조기|TV|텔레비전|오븐|비데|붙박이장|책상|책장|침대|소파|식탁|커튼|블라인드|엘리베이터|주방\s*가전/.test(text)) {
    const m = text.match(/에어컨|세탁기|냉장고|인덕션|싱크대|가스레인지|전자레인지|식기세척기|건조기|TV|텔레비전|오븐|비데|붙박이장|책상|책장|침대|소파|식탁|커튼|블라인드|엘리베이터|주방\s*가전/);
    return { hallucinated: true, offending: m ? m[0] : '옵션' };
  }
  if (/(?:보증금|월세|전세|매매가|관리비|공과금)|[\d,]+\s*(?:만원|억|평|㎡|m²)|준공\s*\d+년?/.test(text)) {
    const m = text.match(/보증금|월세|전세|매매가|관리비|[\d,]+\s*(?:만원|억|평|㎡|m²)/);
    return { hallucinated: true, offending: m ? m[0] : '가격/면적' };
  }
  const TOPICS = [
    /대학교|대학가|캠퍼스|학원가|교육특구|학세권/,
    /교통\s*허브|교통\s*요지|교통\s*중심/,
    /젊은\s*세대|활동적인\s*동네|활기찬\s*동네|활기\s*넘치는/,
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
  const MKT_BAN = [/따뜻한|포근한|아늑한|감성|보금자리|힐링/, /끝판왕|천국|가성비|완벽한\s*매물|최고의\s*매물/];
  for (const re of MKT_BAN) {
    const m = text.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }
  return { hallucinated: false };
}

// ── Symbolic Fallback (해시 기반 풀 선택, 매물별 다양) ──
export function buildSymbolicFallback(f: BriefingFacts): string {
  const paragraphs: string[] = [];
  paragraphs.push(pickGreeting(f));
  const value = pickValueParagraph(f);
  if (value) paragraphs.push(value);
  const traffic = pickTrafficParagraph(f);
  if (traffic) paragraphs.push(traffic);
  paragraphs.push(pickCtaParagraph(f));
  return paragraphs.join('\n\n');
}

// ── Title — 헤드라인 패턴 풀 + 해시 ──
export function buildSymbolicTitle(f: BriefingFacts): string {
  const features: string[] = [];
  if (f.is_new_building) features.push('신축');
  if (f.is_full_option) features.push('풀옵션');
  const feature = features.join(' ') || '추천';

  let station = '', min = '';
  if (f.station_top3 && f.station_top3.length > 0) {
    const top = f.station_top3[0];
    const m = top.walk_minutes ?? Math.round(top.distance_m / 80);
    if (m <= 15) {
      station = `${top.name}역`;
      min = String(m);
    }
  }

  const pattern = hashPick(f.id, 'headline', HEADLINE_PATTERNS);
  let title = pattern
    .replace('{station}', station || '역세')
    .replace('{min}', min || '5')
    .replace('{feature}', feature)
    .replace('{type}', f.type);
  // station 없으면 패턴 단순화
  if (!station) title = `${feature} ${f.type}`;
  return title.slice(0, 30);
}
