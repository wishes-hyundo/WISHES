// 매물 제목 표시 유틸리티
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 원칙: 메모리 feedback_title_no_address — 제목에 전체 주소 노출 금지 (세일즈 카피형으로)
//
// 전략
//  1) 원본 title 이 이미 세일즈 카피 형태 (주소·지번 패턴 없음) → 그대로 사용
//  2) 원본이 "서울 관악구 신림동 1605-6 2층 303호" 처럼 주소 기반 자동생성 →
//     [건물명|동] + 유형 + [면적] + [층] + [세일즈 훅] 조합으로 재가공
//  3) building_name 이 "2층 303호" 같은 호수 전용 문자열이면 건물명으로 취급하지 않음
//  4) 세일즈 훅: 신축 / 역세권 / 주차가능 / 풀옵션 / 반려동물 / 엘리베이터 / 남향 등
//     (해당 매물의 boolean/meta 필드를 우선 사용, 없으면 description 텍스트 휴리스틱)
//  5) 최종 길이 35자 초과 시 절삭
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { formatFloor } from './formatFloor';

// 지번(lot number) 패턴: 숫자-숫자 (예: 752-38) 또는 산 + 숫자
const LOT_NUMBER_PATTERN = /\b\d+-\d+\b|산\s?\d+-?\d*/;

// 제목에 전체 주소·지번이 포함되어 있는지
function hasRawAddress(title: string | null | undefined): boolean {
  if (!title) return false;
  if (LOT_NUMBER_PATTERN.test(title)) return true;
  const tokens = title.trim().split(/\s+/);
  if (
    tokens.length >= 4 &&
    (title.includes('시') || title.includes('도')) &&
    (title.includes('구') || title.includes('군')) &&
    title.includes('동')
  ) {
    return true;
  }
  return false;
}

// 건물명이 "실제 건물명" 인지 ("N층 N호", "N호" 등 단순 호수 전용은 제외)
function isRealBuildingName(name?: string | null): boolean {
  if (!name) return false;
  const t = String(name).trim();
  if (!t) return false;
  if (/^\d+\s*층\s*\d+\s*호$/.test(t)) return false;
  if (/^\d+\s*호$/.test(t)) return false;
  if (/^\d+\s*동\s*\d+\s*호$/.test(t)) return false;
  if (/^B?\d+\s*호$/.test(t)) return false;
  if (/^(지하|반지하|옥탑)\s*\d*호?$/.test(t)) return false;
  // 한글 2자 이상 들어있어야 건물명 후보
  if (!/[가-힣]{2,}/.test(t)) return false;
  return true;
}

interface ListingLike {
  title?: string | null;
  building_name?: string | null;
  dong?: string | null;
  type?: string | null;
  area_m2?: number | null;
  area?: number | null;
  floor_current?: string | number | null;
  floor_total?: string | number | null;
  floor?: string | number | null;
  deal?: string | null;
  // 세일즈 훅용 메타
  full_option?: boolean | null;
  parking?: boolean | null;
  elevator?: boolean | null;
  pet?: boolean | null;
  balcony?: boolean | null;
  direction?: string | null;
  // 실제 DB 컬럼: station_name (역명), station_distance (도보 분)
  station_name?: string | null;
  station_distance?: number | null;
  // 하위호환용 alias (다른 모듈에서 표준화 전 이름을 쓸 수 있음)
  near_subway?: string | null;
  subway_distance?: number | null;
  build_year?: number | null;
  built_year?: number | null;
  description?: string | null;
}

// 매물로부터 가장 강한 세일즈 훅 1개 선정
function pickSalesHook(listing: ListingLike): string | null {
  const year = listing.built_year ?? listing.build_year ?? null;
  if (typeof year === 'number' && year >= 2020) return '신축';

  const stationText = listing.station_name ?? listing.near_subway ?? null;
  const distance = listing.station_distance ?? listing.subway_distance ?? null;
  const nearText = [stationText, listing.description, listing.title]
    .filter(Boolean)
    .join(' ');
  if (
    (typeof distance === 'number' && distance > 0 && distance <= 5) ||
    /역세권|도보\s?\d+분|\d+호선/i.test(nearText)
  ) {
    return '역세권';
  }
  if (listing.full_option === true) return '풀옵션';
  if (listing.parking === true) return '주차가능';
  if (listing.elevator === true) return '엘리베이터';
  if (listing.pet === true) return '반려동물';
  if (listing.balcony === true) return '베란다';
  if (listing.direction && /남/.test(listing.direction)) return '남향';
  return null;
}

/**
 * 매물 제목 표시용 문자열을 반환.
 * - 원본이 세일즈 카피 형태면 그대로 (35자 초과 시 절삭)
 * - 주소·지번 패턴이면 [건물명|동] + 유형 + [면적] + [층] + [세일즈훅] 로 재가공
 */
export function displayTitle(listing: ListingLike): string {
  const raw = (listing.title || '').trim();
  const area = listing.area_m2 ?? listing.area ?? 0;
  const floor = formatFloor({
    floor_current: listing.floor_current ?? null,
    floor_total: listing.floor_total ?? null,
    floor: listing.floor ?? null,
  } as any);
  const realBuilding = isRealBuildingName(listing.building_name)
    ? String(listing.building_name).trim()
    : null;

  // 1) 이미 세일즈 카피 형태 → 원본 사용
  if (raw && !hasRawAddress(raw)) {
    if (raw.length <= 35) return raw;
    return raw.slice(0, 34) + '…';
  }

  // 2) 재가공
  const parts: string[] = [];
  if (realBuilding) parts.push(realBuilding);
  else if (listing.dong) parts.push(listing.dong);
  if (listing.type) parts.push(listing.type);
  if (area && area > 0) parts.push(`${Math.round(Number(area))}㎡`);
  if (floor) parts.push(floor);

  const base = parts.filter(Boolean).join(' ') || '매물';
  const hook = pickSalesHook(listing);
  if (hook) {
    const combined = `${base} · ${hook}`;
    if (combined.length <= 35) return combined;
  }
  return base.length <= 35 ? base : base.slice(0, 34) + '…';
}
