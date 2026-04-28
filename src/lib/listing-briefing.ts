// ──────────────────────────────────────────────────────────────────────
// listing-briefing — Hybrid (사실 기반 + 자연스러운 산문)
// 작성: 2026-04-29 사장님 명령 "사람이 작성하는것처럼 + 확실한 정보 + 추천 이유"
//
// 흐름:
//   1. facts 추출 (검증된 모든 사실)
//   2. LLM 산문 생성 (facts only, 사실 추가 X)
//   3. 환각 검증 (다른 역/동/구/광역/학교 등 reject)
//   4. retry 3회
//   5. 모두 실패 시 Symbolic Fallback (sentence-level template)
// ──────────────────────────────────────────────────────────────────────

import type { NearestStation } from '@/lib/subway-finder';

export interface BriefingFacts {
  type: string;
  deal: string;
  building_name?: string | null;
  built_year_full?: string | null;       // "2022년 10월 31일"
  floor_current?: number | null;
  floor_total?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  room_shape?: string | null;            // "분리형", "오픈형"
  is_full_option: boolean;
  has_elevator: boolean;
  has_parking: boolean;
  parking_fee?: number | null;
  is_immediate_movein: boolean;
  is_new_building: boolean;
  station_top3?: NearestStation[];
  options_text?: string | null;          // "에어컨, 세탁기, 냉장고, 싱크대, 인덕션"
  special_notes?: string | null;
  // raw user-input gu/dong NOT used in LLM (only sentence-level mention check)
  gu?: string | null;
  dong?: string | null;
}

// ── LLM prompt 빌드 (산문 작성) ──
export function buildBriefingPrompt(f: BriefingFacts): string {
  const parts: string[] = [];

  // 매물 type
  parts.push(`- 매물: ${f.type}${f.deal ? ` (${f.deal})` : ''}`);

  // 건물
  if (f.building_name) parts.push(`- 건물명: ${f.building_name}`);
  if (f.built_year_full) {
    const isNew = f.is_new_building ? ' (5년 이내 신축)' : '';
    parts.push(`- 준공: ${f.built_year_full}${isNew}`);
  }
  if (f.floor_current && f.floor_total) {
    parts.push(`- 해당층/총층: ${f.floor_current}층 / ${f.floor_total}층`);
  }
  if (f.room_shape) parts.push(`- 구조: ${f.room_shape}`);
  if (f.rooms != null || f.bathrooms != null) {
    const r = f.rooms != null ? `룸 ${f.rooms}개` : '';
    const b = f.bathrooms != null ? `욕실 ${f.bathrooms}개` : '';
    parts.push(`- ${[r, b].filter(Boolean).join(' / ')}`);
  }

  // 옵션
  if (f.options_text) parts.push(`- 옵션: ${f.options_text}`);

  // 시설
  const fac: string[] = [];
  if (f.has_elevator) fac.push('엘리베이터');
  if (f.has_parking) {
    const fee = f.parking_fee && f.parking_fee > 0 ? ` (월 ${f.parking_fee}만원)` : '';
    fac.push(`주차 가능${fee}`);
  }
  if (fac.length > 0) parts.push(`- 시설: ${fac.join(', ')}`);

  // 입주
  if (f.is_immediate_movein) parts.push('- 즉시입주 가능 (공실)');

  // 교통 (가까운 역만, 도보 15분 이내)
  if (f.station_top3 && f.station_top3.length > 0) {
    const lines: string[] = [];
    for (const s of f.station_top3) {
      const min = s.walk_minutes ?? Math.round(s.distance_m / 80);
      if (min > 15) continue;
      const exit = s.nearest_exit ? ` ${s.nearest_exit.exit_no}번 출구` : '';
      lines.push(`  • ${s.name}역 (${s.line}) 도보 ${min}분${exit}`);
    }
    if (lines.length > 0) parts.push(`- 교통:\n${lines.join('\n')}`);
  }

  if (f.special_notes && f.special_notes.length < 200) {
    parts.push(`- 매물 등록자 특이사항: ${f.special_notes}`);
  }

  return `당신은 13년차 부동산 중개사입니다. 아래 검증된 사실만 사용해서 고객에게 매물을 추천하는 자연스러운 한국어 산문을 작성하세요.

[검증된 사실 — 이것만 사용. 단 하나도 추가하거나 변경 X]
${parts.join('\n')}

[작성 규칙]
1. 자연스러운 한국어 산문 (5~8 문장, 200~400자)
2. bullet 점 / 이모지 / 마크다운 X (순수 산문체)
3. 위 사실들을 자연스럽게 엮어 "이래서 추천드립니다" 톤으로
4. 위 사실에 없는 정보 추가 절대 X:
   • 위에 없는 다른 역 이름 X (예: 위에 신림만 있으면 강남/서울대입구/낙성대 X)
   • 동/구/광역 지역 이름 X (관악구/신림동/강남/강북/종로/사당 등)
   • 학교/대학교/캠퍼스/학원가/교육특구 X
   • 미세먼지/치안/상권/공원/산책로 X (정보 없음)
   • 시세/가격 추측 X
5. 마케팅 과장 표현 X:
   • "쾌적한", "포근한", "따뜻한", "감성", "보금자리", "끝판왕", "천국", "완벽한" X
6. 사실 그대로 자연스럽게 표현:
   • 도보 4분이면 "출퇴근이 편리합니다" OK
   • 풀옵션이면 "추가 가전 구매 없이 바로 거주" OK
   • 신축이면 "시설이 깨끗합니다" OK
7. 추천 대상 (1인 직장인/신혼/가족) 은 매물 type/rooms 기반으로만 자연스럽게

[형식 — JSON만]
{
  "title": "헤드라인 (15~25자, 매물 핵심 1~2개)",
  "description": "산문 본문 (200~400자, 5~8문장)"
}`;
}

// ── 환각 검증: facts 외 정보 발견 시 reject ──
export function detectBriefingHallucination(
  text: string,
  f: BriefingFacts
): { hallucinated: boolean; offending?: string } {
  // 1. 다른 역 이름 검사
  const allowedStations = new Set<string>();
  if (f.station_top3) {
    for (const s of f.station_top3) {
      allowedStations.add(s.name);
    }
  }
  const stationMatches = text.match(/([가-힣A-Za-z0-9]{2,10})역/g) || [];
  for (const m of stationMatches) {
    const stem = m.replace(/역$/, '');
    if (!allowedStations.has(stem)) {
      return { hallucinated: true, offending: m };
    }
  }

  // 2. 동/구/광역 지역 검사 (facts.gu/dong 포함 모두 reject — 모달 카드에 표시됨)
  const FORBIDDEN_REGIONS = [
    /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*(?:특별시|광역시|도)?/,
    /[가-힣]{2,4}구\s/,
    /[가-힣]{1,4}동\s/,
    /강남|강북|강동|강서|종로|중구|용산|성동|광진|동대문|중랑|성북|도봉|노원|은평|서대문|마포|양천|영등포|동작|관악|서초|송파|광진|구로|금천|영등포|동작|관악|서초|송파/,
    /사당|노량진|명동|광화문|을지로|충무로|이태원|홍대|신촌|건대|성수|왕십리|압구정|청담|신사|논현|역삼|선릉|삼성/,
  ];
  for (const re of FORBIDDEN_REGIONS) {
    const m = text.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }

  // 3. 학교/대학/환경/시세 추측 검사
  const FORBIDDEN_TOPICS = [
    /대학교|캠퍼스|학원가|교육특구|학세권/,
    /미세먼지|공기질|에어컨디션|황사/,
    /치안|범죄|안전등급/,
    /상권|상가/,
    /공원|산책로|하천|산[\s\.,]/,
    /시세|평균\s*가격|호가|평당/,
    /역세권|초역세권|주요\s*지하철역/,
    /도보권/,
  ];
  for (const re of FORBIDDEN_TOPICS) {
    const m = text.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }

  // 4. 마케팅 과장 표현 검사
  const FORBIDDEN_MARKETING = [
    /따뜻한|포근한|감성|보금자리|힐링|아늑한/,
    /끝판왕|천국|가성비|완벽한|최고의\s*매물/,
  ];
  for (const re of FORBIDDEN_MARKETING) {
    const m = text.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }

  return { hallucinated: false };
}

// ── Symbolic Fallback (LLM 모두 실패 시) ──
// 자연스러운 한 단락 산문 형태로 사실들 조립
export function buildSymbolicFallback(f: BriefingFacts): string {
  const sentences: string[] = [];

  // 1. 매물 + 건물 + 신축
  const built = f.built_year_full ? f.built_year_full : '';
  const newStr = f.is_new_building ? '신축에 가까운' : (built ? '안정적으로 자리잡은' : '');
  if (f.building_name && built) {
    sentences.push(`${f.building_name} ${built} 준공된 ${newStr} ${f.type}입니다.`);
  } else if (f.building_name) {
    sentences.push(`${f.building_name}에 위치한 ${f.type}입니다.`);
  } else if (built) {
    sentences.push(`${built} 준공된 ${newStr} ${f.type}입니다.`);
  }

  // 2. 층 + 구조 + 룸욕실
  const floorPart = f.floor_current && f.floor_total ? `${f.floor_current}층(${f.floor_total}층 건물)` : '';
  const shapePart = f.room_shape || '';
  const rbPart = f.rooms != null ? `룸 ${f.rooms}개` : '';
  if (floorPart || shapePart || rbPart) {
    const parts = [floorPart, shapePart, rbPart].filter(Boolean).join(', ');
    sentences.push(`${parts} 구조로 되어 있습니다.`);
  }

  // 3. 시설 (엘리베이터 + 주차)
  if (f.has_elevator && f.has_parking) {
    const fee = f.parking_fee && f.parking_fee > 0 ? ` 주차장도 월 ${f.parking_fee}만원에 이용 가능합니다.` : '';
    sentences.push(`엘리베이터가 있어 짐 이동이 편리하고,${fee}`);
  } else if (f.has_elevator) {
    sentences.push('엘리베이터가 있어 짐 이동이 편리합니다.');
  } else if (f.has_parking) {
    const fee = f.parking_fee && f.parking_fee > 0 ? ` (월 ${f.parking_fee}만원)` : '';
    sentences.push(`주차장도 이용 가능합니다${fee}.`);
  }

  // 4. 옵션 + 즉시입주
  if (f.is_full_option && f.options_text) {
    sentences.push(`${f.options_text} 등 풀옵션으로 추가 가전 구매 없이 바로 거주하실 수 있습니다.`);
  } else if (f.options_text) {
    sentences.push(`${f.options_text} 등이 구비되어 있습니다.`);
  } else if (f.is_full_option) {
    sentences.push('풀옵션 매물로 추가 가전 구매 없이 바로 거주하실 수 있습니다.');
  }
  if (f.is_immediate_movein) {
    sentences.push('현재 공실 상태로 즉시입주가 가능해, 빠른 이사 일정이 필요하신 분께 적합합니다.');
  }

  // 5. 교통
  if (f.station_top3 && f.station_top3.length > 0) {
    const closest = f.station_top3[0];
    const min = closest.walk_minutes ?? Math.round(closest.distance_m / 80);
    if (min <= 15) {
      const exit = closest.nearest_exit ? ` ${closest.nearest_exit.exit_no}번 출구` : '';
      sentences.push(`${closest.name}역(${closest.line})${exit}까지 도보 ${min}분 거리로 출퇴근 동선이 편리합니다.`);
      if (f.station_top3.length > 1) {
        const second = f.station_top3[1];
        const min2 = second.walk_minutes ?? Math.round(second.distance_m / 80);
        if (min2 <= 15 && second.name !== closest.name) {
          sentences.push(`${second.name}역(${second.line})도 도보 ${min2}분 거리에 있어 노선 활용도가 높습니다.`);
        }
      }
    }
  }

  // 6. 추천 대상
  const target = (f.rooms != null && f.rooms <= 1.5) ? '1인 직장인이나 학생' :
                 (f.rooms != null && f.rooms === 2) ? '신혼부부나 2인 가구' :
                 (f.rooms != null && f.rooms >= 3) ? '3~4인 가족' : '거주';
  sentences.push(`${target}분께 추천드릴 수 있는 매물입니다.`);

  return sentences.join(' ');
}

// ── Title 추출 (헤드라인) ──
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
