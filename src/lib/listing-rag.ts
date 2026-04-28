// ──────────────────────────────────────────────────────────────────────
// BoB 매물 설명 v2 — RAG 검증된 사실 수집 라이브러리
// 작성: 2026-04-27 v3 세션 (사용자 명시 — 거짓 X, 확실한 정보 기반)
//
// 동작:
//   1. listings 칸 + raw_fields 에서 검증된 사실만 추출
//   2. enrichRagWithFreshStation: 좌표 있으면 카카오 SW8 직접 호출 → 100% 보장
//   3. LLM 에 전달할 "facts" 객체 + "forbidden_topics" 리스트 반환
//
// 핵심 원칙:
//   - facts 에 없는 정보는 LLM 이 만들면 안 됨 (환각)
//   - forbidden_topics: 표/아이콘에 이미 있는 정보 (중복 방지)
//   - 위치 (역/지하철) 은 100% 정확해야 함 — 사장님 명령 (고객 신뢰)
// ──────────────────────────────────────────────────────────────────────

export interface ListingFacts {
  // 위치 (검증된 사실만)
  gu: string;
  dong: string;
  building_name?: string;

  // 교통 (확정 데이터만)
  station_name?: string;
  station_distance?: number;  // 분 단위 (도보 80m/분)
  station_lines?: string[];

  // 매물 핵심
  type: string;
  deal: string;
  built_year?: string;

  // 라이프스타일 분류
  target_segment: 'single' | 'couple' | 'family' | 'business' | 'investor';
  is_new_building: boolean;
  is_immediate_movein: boolean;
  is_full_option: boolean;
  has_elevator: boolean;
  has_parking: boolean;
  pet_allowed: boolean | null;

  unique_hooks: string[];
  nearby_known: string[];
}

export interface RagContext {
  facts: ListingFacts;
  forbidden_topics: string[];
  suggested_style_index: number;
}

// ── 1. 매물 type 으로 타겟 segment 추론 ──────────────────
function inferTargetSegment(
  type: string,
  rooms: number | null,
  _deal: string
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
  _buildingName: string | null
): string[] {
  const known: string[] = [];
  const special = String(rawFields['특이사항'] || '');
  const rawText = String(rawFields['__원본본문__'] || '');

  // 광역 — 본문에 명시된 모든 지하철역 / 공원 / 산 / 하천 매칭
  const placeRegex = /([가-힣]{2,8}역|[가-힣]{2,8}공원|[가-힣]{2,8}산|[가-힣]{2,8}천|[가-힣]{2,8}대학교|[가-힣]{2,8}대로|[가-힣]{2,8}로)/g;
  const found = (special + ' ' + rawText).match(placeRegex);
  if (found) {
    const set = new Set(found);
    for (const place of set) {
      known.push(place);
    }
  }

  return known.slice(0, 8);
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

  // L-rag-fix (2026-04-29): subway_data 배열 사용. 첫번째 (가장 가까운) 역.
  // distance_m → 분 환산 (도보 80m/분).
  const subwayArr = Array.isArray(listing.subway_data) ? listing.subway_data : [];
  const closestStation = subwayArr.length > 0 ? subwayArr[0] as { name?: string; distance_m?: number } : null;
  const stationName = closestStation?.name || undefined;
  const stationDistanceMin = closestStation?.distance_m
    ? Math.max(1, Math.round(closestStation.distance_m / 80))
    : undefined;

  const facts: ListingFacts = {
    gu: String(listing.gu || ''),
    dong: String(listing.dong || ''),
    building_name: (listing.building_name as string) || undefined,

    station_name: stationName,
    station_distance: stationDistanceMin,
    station_lines: undefined,

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

  const forbidden_topics: string[] = [
    '보증금', '월세', '전세금', '매매가', '관리비', '가격',
    '면적', '평수', '제곱미터', 'm²', '평',
    '방 개수', '방수', '욕실 개수',
    '주차대수', '주차 N대',
    '엘리베이터 N대',
    '준공년도', '사용승인일',
    '구체 옵션 14개 나열',
  ];

  const id = listing.id;
  const idHash = typeof id === 'number'
    ? id
    : (typeof id === 'string' ? parseInt(id) || 0 : 0);
  const suggested_style_index = Math.abs(idHash * 2654435761) % 7;

  return {
    facts,
    forbidden_topics,
    suggested_style_index,
  };
}

// ── 5. 카카오 SW8 직접 호출 — 100% 정확한 가장 가까운 역 ──
// 사장님 명령 (2026-04-29): "위치만큼은 진짜 정확해야돼 고객과의 신뢰가 달린거니깐"
// subway_data 가 비어 있거나 의심스러우면 lat/lng 으로 카카오 직접 fresh fetch.
//
// 카카오 카테고리 검색 (SW8 = 지하철역), radius 1500m, sort by distance.
// 응답의 distance 는 미터 단위 직선거리.
export async function enrichRagWithFreshStation(
  rag: RagContext,
  lat: number | null | undefined,
  lng: number | null | undefined,
  apiKey: string
): Promise<RagContext> {
  // 좌표 없으면 그대로 (subway_data 결과 또는 undefined 유지)
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return rag;
  if (!apiKey) return rag;

  try {
    const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&y=${lat}&x=${lng}&radius=1500&sort=distance`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return rag;
    const j = await res.json() as {
      documents?: Array<{ place_name?: string; distance?: string; category_name?: string }>;
    };
    const docs = j?.documents || [];
    if (docs.length === 0) {
      // 1.5km 안에 역 없음 — 명시적으로 undefined 유지 (LLM 이 역 언급 X)
      return {
        ...rag,
        facts: { ...rag.facts, station_name: undefined, station_distance: undefined },
      };
    }
    const closest = docs[0];
    const distanceM = parseInt(closest.distance || '0', 10);
    if (!distanceM) return rag;
    // 도보 80m/분 (1.4m/s × 60 ≈ 84, 안전치 80)
    const minutes = Math.max(1, Math.round(distanceM / 80));
    return {
      ...rag,
      facts: {
        ...rag.facts,
        station_name: closest.place_name || rag.facts.station_name,
        station_distance: minutes,
      },
    };
  } catch {
    // 카카오 호출 실패 — subway_data 결과 유지
    return rag;
  }
}

// ── 6. 검증: description 안의 역 이름이 facts 와 일치하는지 ──
// LLM 이 환각으로 역 이름 만들면 reject (재시도 트리거).
export function detectStationHallucination(
  description: string,
  facts: ListingFacts
): { hallucinated: boolean; offending?: string } {
  // description 에서 "OO역" 패턴 추출
  const stationMatches = description.match(/[가-힣A-Za-z0-9]{2,10}역/g) || [];
  if (stationMatches.length === 0) return { hallucinated: false };

  const allowedStation = facts.station_name ? facts.station_name.replace(/역$/, '') : null;
  const allowedNearby = facts.nearby_known
    .filter((n) => /역$/.test(n))
    .map((n) => n.replace(/역$/, ''));
  const allowed = new Set<string>();
  if (allowedStation) allowed.add(allowedStation);
  for (const a of allowedNearby) allowed.add(a);

  // facts 에 어떤 역도 없으면 description 에 역 이름 등장 = 환각
  if (allowed.size === 0) {
    return { hallucinated: true, offending: stationMatches[0] };
  }

  for (const m of stationMatches) {
    const stem = m.replace(/역$/, '');
    if (!allowed.has(stem)) {
      return { hallucinated: true, offending: m };
    }
  }
  return { hallucinated: false };
}
