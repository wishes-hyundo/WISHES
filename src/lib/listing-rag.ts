// ──────────────────────────────────────────────────────────────────────
// BoB 매물 설명 v2 — RAG 검증된 사실 (100% 보장)
// 강화: 2026-04-29 — station_name 단일 allowed + 광역 키워드 reject
// ──────────────────────────────────────────────────────────────────────

import { findStationsForListing, type NearestStation } from '@/lib/subway-finder';

export interface ListingFacts {
  gu: string;
  dong: string;
  building_name?: string;
  station_name?: string;
  station_distance?: number;
  station_lines?: string[];
  station_top3?: NearestStation[];
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

function inferTargetSegment(type: string, rooms: number | null, _deal: string): ListingFacts['target_segment'] {
  if (type === '상가' || type === '사무실' || type === '지식산업센터') return 'business';
  if (type === '토지' || type === '건물') return 'investor';
  if (type === '아파트') return rooms && rooms >= 3 ? 'family' : 'couple';
  if (type === '주택' || type === '빌라') return rooms && rooms >= 3 ? 'family' : 'couple';
  if (type === '오피스텔' || type === '원룸') return rooms && rooms >= 2 ? 'couple' : 'single';
  if (type === '투룸') return 'couple';
  if (type === '쓰리룸') return 'family';
  return 'single';
}

function extractUniqueHooks(rawFields: Record<string, unknown>): string[] {
  const hooks: string[] = [];
  const combined = (String(rawFields['특이사항'] || '') + ' ' + String(rawFields['__원본본문__'] || '')).toLowerCase();
  const checks: Array<[string, string]> = [
    ['수리완료', '리모델링 완료'], ['신축', '신축'], ['풀옵션', '풀옵션'], ['단기', '단기 임대 가능'],
    ['전속', '단지 전속 관리'], ['코너', '코너세대'], ['남향', '남향'], ['남동', '남동향'], ['남서', '남서향'],
    ['고층', '고층'], ['저층', '저층'], ['복층', '복층 구조'], ['테라스', '테라스 보유'], ['베란다', '베란다 보유'],
    ['주차', '주차 가능'], ['cctv', 'CCTV'], ['반려', '반려동물 가능'], ['시스템', '시스템 에어컨'],
    ['건조기', '건조기 보유'], ['빌트인', '빌트인 가구'], ['붙박이', '붙박이장 보유'], ['공기청정', '공기청정 시설'],
  ];
  const seen = new Set<string>();
  for (const [k, l] of checks) if (combined.includes(k) && !seen.has(l)) { hooks.push(l); seen.add(l); }
  return hooks.slice(0, 6);
}

// 본문 명시 시설 — 역 절대 제외 (환각 방지)
function extractNearbyKnown(rawFields: Record<string, unknown>, _bn: string | null): string[] {
  const known: string[] = [];
  const text = String(rawFields['특이사항'] || '') + ' ' + String(rawFields['__원본본문__'] || '');
  // 공원/산/천/대학교/대로만 (역 / 동 / 구 절대 X — facts.station_name 단일 사용)
  const placeRegex = /([가-힣]{2,8}공원|[가-힣]{2,8}산|[가-힣]{2,8}천|[가-힣]{2,8}대학교|[가-힣]{2,8}대로)/g;
  const found = text.match(placeRegex);
  if (found) for (const p of new Set(found)) known.push(p);
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
  const isNewBuilding = builtYear > 0 && (new Date().getFullYear() - builtYear) <= 5;
  const availableDate = String(listing.available_date || rawFields['입주가능일'] || '');
  const isImmediateMovein = /즉시|공실/.test(availableDate);

  const facts: ListingFacts = {
    gu: String(listing.gu || ''),
    dong: String(listing.dong || ''),
    building_name: (listing.building_name as string) || undefined,
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
    '방 개수', '방수', '욕실 개수', '주차대수',
    '엘리베이터 N대', '준공년도', '사용승인일',
    '구체 옵션 14개 나열',
  ];

  const id = listing.id;
  const idHash = typeof id === 'number' ? id : (typeof id === 'string' ? parseInt(id) || 0 : 0);
  const suggested_style_index = Math.abs(idHash * 2654435761) % 7;

  return { facts, forbidden_topics, suggested_style_index };
}

// 100% 보장: PostGIS + 카카오 모빌리티 도보 — top3 이지만 station_name = top1 만
export async function enrichRagWithStations(
  rag: RagContext,
  lat: number | null | undefined,
  lng: number | null | undefined
): Promise<RagContext> {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
    return { ...rag, facts: { ...rag.facts, station_name: undefined, station_distance: undefined, station_top3: [] } };
  }

  const stations = await findStationsForListing(lat, lng, 3);
  if (stations.length === 0) {
    return { ...rag, facts: { ...rag.facts, station_name: undefined, station_distance: undefined, station_top3: [] } };
  }

  const top1 = stations[0];
  return {
    ...rag,
    facts: {
      ...rag.facts,
      station_name: top1.name,
      station_distance: top1.walk_minutes ?? Math.max(1, Math.round(top1.distance_m / 80)),
      station_lines: [top1.line],  // top1 의 호선만
      station_top3: stations,  // 보존하지만 LLM prompt 에는 top1 만 노출
    },
  };
}

export async function enrichRagWithFreshStation(
  rag: RagContext, lat: number | null | undefined, lng: number | null | undefined, _apiKey: string
): Promise<RagContext> {
  return enrichRagWithStations(rag, lat, lng);
}

// 100% 보장 검증 — facts.station_name 단일만 allowed + 광역 키워드 reject
export function detectStationHallucination(
  description: string,
  facts: ListingFacts
): { hallucinated: boolean; offending?: string } {
  // 1) 광역 키워드 검사 (facts 에 없는 광역 출퇴근 / 도보권 / 다른 동네 추측)
  const FORBIDDEN_PATTERNS = [
    /도보권\s*내/,           // "도보권 내에 있다"
    /도보권\s*에/,           // "도보권에"
    /강남\s*[·,]/,           // "강남·노량진"
    /종로\s*[·,방향]/,       // "종로·방향"
    /사당\s*[·,방향]/,       // "사당·방향"
    /노량진\s*[·,방향]/,
    /명동\s*[·,방향]/,
    /광화문\s*[·,방향]/,
    /시청\s*[·,방향]/,
    /방향\s*출퇴근/,         // "강남 방향 출퇴근"
    /주요\s*지하철역과?\s*가깝/, // "주요 지하철역과 가깝다"
    /역세권/,
  ];
  for (const re of FORBIDDEN_PATTERNS) {
    const m = description.match(re);
    if (m) return { hallucinated: true, offending: m[0] };
  }

  // 2) 역 이름 검사 — facts.station_name (단일) 외 모든 역 reject
  const stationMatches = description.match(/([가-힣A-Za-z0-9]{2,10})역/g) || [];
  if (stationMatches.length === 0) return { hallucinated: false };

  const allowedStem = facts.station_name ? facts.station_name.replace(/역$/, '') : null;
  if (!allowedStem) {
    // facts 에 역 정보 없는데 description 에 역 등장 = 환각
    return { hallucinated: true, offending: stationMatches[0] };
  }

  for (const m of stationMatches) {
    const stem = m.replace(/역$/, '');
    if (stem !== allowedStem) {
      return { hallucinated: true, offending: m };
    }
  }
  return { hallucinated: false };
}
