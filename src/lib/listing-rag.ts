// ──────────────────────────────────────────────────────────────────────
// BoB 매물 설명 v2 — RAG 검증된 사실 수집 라이브러리
// 작성: 2026-04-27 v3 세션 (사용자 명시 — 거짓 X, 확실한 정보 기반)
//
// 동작:
//   1. listings 칸 + raw_fields 에서 검증된 사실만 추출
//   2. 향후 카카오 directions / OSM Overpass 추가 가능 (Phase 2)
//   3. LLM 에 전달할 "facts" 객체 + "forbidden_topics" 리스트 반환
//
// 핵심 원칙:
//   - facts 에 없는 정보는 LLM 이 만들면 안 됨 (환각)
//   - forbidden_topics: 표/아이콘에 이미 있는 정보 (중복 방지)
// ──────────────────────────────────────────────────────────────────────

export interface ListingFacts {
  // 위치 (검증된 사실만)
  gu: string;        // 예: "관악구"
  dong: string;      // 예: "신림동"
  building_name?: string;  // 예: "케이뷰오피스텔1차"

  // 교통 (확정 데이터만)
  station_name?: string;     // 예: "신림역" (DB 검증)
  station_distance?: number;  // 분 단위
  station_lines?: string[];   // 예: ["2호선", "신림선"]

  // 매물 핵심 (분류 용도, 표 정보 X)
  type: string;       // 예: "오피스텔"
  deal: string;       // 예: "월세"
  built_year?: string;  // 예: "2023"

  // 라이프스타일 분류 (어필 타겟)
  target_segment: 'single' | 'couple' | 'family' | 'business' | 'investor';
  is_new_building: boolean;  // 5년 이내 신축
  is_immediate_movein: boolean;  // 즉시입주
  is_full_option: boolean;
  has_elevator: boolean;
  has_parking: boolean;
  pet_allowed: boolean | null;

  // 매물별 차별점 (raw_fields 에서 추출)
  unique_hooks: string[];  // 예: ["수리완료", "코너세대", "법인 전속관리"]

  // 주변 정보 (있으면)
  nearby_known: string[];  // 예: ["도림천 산책로 인근"] (DB 또는 raw 검증)
}

export interface RagContext {
  facts: ListingFacts;

  // LLM 한테 사용 금지 알려줘야 할 정보 (이미 표/아이콘에 표시)
  forbidden_topics: string[];

  // 가장 어울리는 톤 추천 (스타일 풀에서 hash 로 선택)
  suggested_style_index: number;
}

// ── 1. 매물 type 으로 타겟 segment 추론 ──────────────────
function inferTargetSegment(
  type: string,
  rooms: number | null,
  deal: string
): ListingFacts['target_segment'] {
  if (type === '상가' || type === '사무실' || type === '지식산업센터') return 'business';
  if (type === '토지' || type === '건물') return 'investor';
  if (type === '아파트') {
    if (rooms && rooms >= 3) return 'family';
    return 'couple';
  }
  if (type === '주택' || type === '빌라') {
    if (rooms && rooms >= 3) return 'family';
    return 'couple';
  }
  if (type === '오피스텔' || type === '원룸') {
    if (rooms && rooms >= 2) return 'couple';
    return 'single';
  }
  if (type === '투룸') return 'couple';
  if (type === '쓰리룸') return 'family';
  return 'single';
}

// ── 2. raw_fields 에서 차별점 hook 추출 ──────────────────
function extractUniqueHooks(rawFields: Record<string, unknown>): string[] {
  const hooks: string[] = [];
  const special = String(rawFields['특이사항'] || '').toLowerCase();
  const rawText = String(rawFields['__원본본문__'] || '').toLowerCase();
  const combined = special + ' ' + rawText;

  // 검증된 차별점 키워드 (실제 raw 본문에 있는지 확인)
  const checks: Array<[string, string]> = [
    ['수리완료', '리모델링 완료'],
    ['수리', '리모델링'],
    ['신축', '신축'],
    ['풀옵션', '풀옵션'],
    ['단기', '단기 임대 가능'],
    ['전속', '단지 전속 관리'],
    ['코너', '코너세대'],
    ['남향', '남향'],
    ['남동', '남동향'],
    ['남서', '남서향'],
    ['고층', '고층'],
    ['저층', '저층'],
    ['복층', '복층 구조'],
    ['테라스', '테라스 보유'],
    ['베란다', '베란다 보유'],
    ['주차', '주차 가능'],
    ['cctv', 'CCTV'],
    ['반려', '반려동물 가능'],
    ['애견', '반려동물 가능'],
    ['애묘', '반려동물 가능'],
    ['시스템', '시스템 에어컨'],
    ['건조기', '건조기 보유'],
    ['빌트인', '빌트인 가구'],
    ['붙박이', '붙박이장 보유'],
    ['공기청정', '공기청정 시설'],
  ];

  const seen = new Set<string>();
  for (const [keyword, label] of checks) {
    if (combined.includes(keyword) && !seen.has(label)) {
      hooks.push(label);
      seen.add(label);
    }
  }

  return hooks.slice(0, 6);
}

// ── 3. 주변 환경 — DB 검증된 것만 ───────────────────────
function extractNearbyKnown(
  rawFields: Record<string, unknown>,
  buildingName: string | null
): string[] {
  const known: string[] = [];
  const special = String(rawFields['특이사항'] || '');
  const rawText = String(rawFields['__원본본문__'] || '');

  // 매물 본문에 명시된 주변 정보만 추출 (LLM 한테 추가 정보 만들지 마라)
  const placeRegex = /(도림천|관악산|봉천공원|보라매공원|신림역|봉천역|서울대입구역|남부순환로)/g;
  const found = (special + ' ' + rawText).match(placeRegex);
  if (found) {
    const set = new Set(found);
    for (const place of set) {
      known.push(place);
    }
  }

  return known.slice(0, 5);
}

// ── 4. 메인: 매물 데이터 → RAG context ─────────────────
export function buildRagContext(listing: Record<string, unknown>): RagContext {
  const rawFields = (listing.raw_fields as Record<string, unknown>) || {};

  const target_segment = inferTargetSegment(
    String(listing.type || ''),
    (listing.rooms as number) || null,
    String(listing.deal || '')
  );

  const builtYearStr = String(listing.built_year || '');
  const builtYear = parseInt(builtYearStr.match(/\d{4}/)?.[0] || '0');
  const currentYear = new Date().getFullYear();
  const isNewBuilding = builtYear > 0 && (currentYear - builtYear) <= 5;

  const availableDate = String(listing.available_date || rawFields['입주가능일'] || '');
  const isImmediateMovein = /즉시|공실/.test(availableDate);

  const facts: ListingFacts = {
    gu: String(listing.gu || ''),
    dong: String(listing.dong || ''),
    building_name: (listing.building_name as string) || undefined,

    station_name: (listing.station_name as string) || undefined,
    station_distance: (listing.station_distance as number) || undefined,
    station_lines: undefined, // Phase 2: 정부 API 로 보강

    type: String(listing.type || ''),
    deal: String(listing.deal || ''),
    built_year: builtYearStr || undefined,

    target_segment,
    is_new_building: isNewBuilding,
    is_immediate_movein: isImmediateMovein,
    is_full_option: !!listing.full_option,
    has_elevator: !!listing.elevator,
    has_parking: !!listing.parking || ((listing.parking_spaces as number) || 0) > 0,
    pet_allowed: typeof listing.pet === 'boolean' ? listing.pet : null,

    unique_hooks: extractUniqueHooks(rawFields),
    nearby_known: extractNearbyKnown(rawFields, (listing.building_name as string) || null),
  };

  // 표/아이콘에 이미 표시되는 정보 — LLM 절대 언급 X
  const forbidden_topics: string[] = [
    '보증금', '월세', '전세금', '매매가', '관리비', '가격',
    '면적', '평수', '제곱미터', 'm²', '평',
    '방 개수', '방수', '욕실 개수',
    '주차대수', '주차 N대',
    '엘리베이터 N대',
    '준공년도', '사용승인일',
    '구체 옵션 14개 나열', // 옵션 표에 있음
  ];

  // 다양성: 매물 ID 해시 → 스타일 인덱스 (0~6)
  const id = listing.id;
  const idHash = typeof id === 'number'
    ? id
    : (typeof id === 'string' ? parseInt(id) || 0 : 0);
  const suggested_style_index = Math.abs(idHash * 2654435761) % 7; // golden ratio hash

  return {
    facts,
    forbidden_topics,
    suggested_style_index,
  };
}
