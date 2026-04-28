// ──────────────────────────────────────────────────────────────────────
// BoB 매물 설명 v2 — RAG 검증된 사실 수집 라이브러리 (100% 보장)
// 작성: 2026-04-27 v3 → 2026-04-29 SOTA 강화
//
// 정책 (사장님 명령):
//   - 정확도 99% 도 안돼. 100% 보장.
//   - 위치는 정부 공식 데이터 (subway_stations PostGIS) + 카카오 모빌리티 도보
//   - 데이터 없으면 차라리 "정보 없음" — 잘못된 정보 X
// ──────────────────────────────────────────────────────────────────────

import { findStationsForListing, type NearestStation } from '@/lib/subway-finder';

export interface ListingFacts {
  gu: string;
  dong: string;
  building_name?: string;

  // 100% 보장 위치 정보 (PostGIS + 카카오 도보 routing)
  station_name?: string;
  station_distance?: number;  // 도보 분 (카카오 모빌리티)
  station_lines?: string[];
  station_top3?: NearestStation[];  // top 3 모두 (호선 + 출구 + 도보)

  type: string;
  deal: string;
  built_year?: string;

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

function extractNearbyKnown(
  rawFields: Record<string, unknown>,
  _buildingName: string | null
): string[] {
  const known: string[] = [];
  const special = String(rawFields['특이사항'] || '');
  const rawText = String(rawFields['__원본본문__'] || '');

  const placeRegex = /([가-힣]{2,8}공원|[가-힣]{2,8}산|[가-힣]{2,8}천|[가-힣]{2,8}대학교|[가-힣]{2,8}대로)/g;
  const found = (special + ' ' + rawText).match(placeRegex);
  if (found) {
    const set = new Set(found);
    for (const place of set) {
      known.push(place);
    }
  }

  return known.slice(0, 5);
}

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

  // L-100pct (2026-04-29): subway_data 폐기. enrichRagWithStations 호출 후
  // PostGIS + 카카오 모빌리티 결과만 사용. 환각 X.
  const facts: ListingFacts = {
    gu: String(listing.gu || ''),
    dong: String(listing.dong || ''),
    building_name: (listing.building_name as string) || undefined,

    // 초기 undefined — enrichRagWithStations 가 채움
    station_name: undefined,
    station_distance: undefined,
    station_lines: undefined,
    station_top3: undefined,

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

// ── 100% 보장: PostGIS 정부 공식 + 카카오 모빌리티 도보 ─────
// 좌표 없거나 DB 비었으면 명시적 빈 배열 — LLM 환각 차단
export async function enrichRagWithStations(
  rag: RagContext,
  lat: number | null | undefined,
  lng: number | null | undefined
): Promise<RagContext> {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
    return {
      ...rag,
      facts: {
        ...rag.facts,
        station_name: undefined,
        station_distance: undefined,
        station_top3: [],
      },
    };
  }

  const stations = await findStationsForListing(lat, lng, 3);

  if (stations.length === 0) {
    // 1.5km 안에 역 없음 — 명시적 빈 배열 → AI 역 언급 X
    return {
      ...rag,
      facts: {
        ...rag.facts,
        station_name: undefined,
        station_distance: undefined,
        station_top3: [],
      },
    };
  }

  // top1 을 메인으로, top3 모두 facts 에 보존
  const top1 = stations[0];
  return {
    ...rag,
    facts: {
      ...rag.facts,
      station_name: top1.name,
      station_distance: top1.walk_minutes ?? Math.max(1, Math.round(top1.distance_m / 80)),
      station_lines: stations.map((s) => s.line),
      station_top3: stations,
    },
  };
}

// ── DEPRECATED: 카카오 SW8 단순 검색. 100% 보장 X. ──
// 호환성 유지를 위해 남겨두지만 enrichRagWithStations 사용 권장.
export async function enrichRagWithFreshStation(
  rag: RagContext,
  lat: number | null | undefined,
  lng: number | null | undefined,
  _apiKey: string
): Promise<RagContext> {
  return enrichRagWithStations(rag, lat, lng);
}

// ── 환각 검증: description 안의 역 이름 vs facts ──
export function detectStationHallucination(
  description: string,
  facts: ListingFacts
): { hallucinated: boolean; offending?: string } {
  const stationMatches = description.match(/[가-힣A-Za-z0-9]{2,10}역/g) || [];
  if (stationMatches.length === 0) return { hallucinated: false };

  const allowed = new Set<string>();
  if (facts.station_name) allowed.add(facts.station_name.replace(/역$/, ''));
  if (facts.station_top3) {
    for (const s of facts.station_top3) {
      allowed.add(s.name.replace(/역$/, ''));
    }
  }

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
