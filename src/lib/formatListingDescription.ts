// 매물 설명 표시 유틸리티 (세일즈 카피형 자동 생성)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 원칙
//   · 전체 주소/지번 노출 금지 (동 단위까지만 허용)
//   · 매물 상세 모달의 모든 rich 데이터를 조합해 자연스러운 세일즈 카피 생성
//   · 한 줄 + 짧은 보강 문장의 2단 구조가 기본
//   · 동일한 훅이 제목과 중복으로 반복되지 않도록 소프트 필터링
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 우선순위
//   1) listing.ai_description 이 세팅되어 있으면 그대로 사용 (AI 생성 설명)
//   2) raw description 이 주소 나열형이 아니면 그대로 사용
//   3) 자동 생성 — rich 데이터 기반 다각도 조합

import { formatFloor } from './formatFloor';

const LOT_NUMBER_PATTERN = /\b\d+-\d+\b|산\s?\d+-?\d*/;

// 설명이 "실은 주소/지번 덩어리"일 때 거르는 함수
function isRawAddressDescription(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length < 8) return true;
  if (LOT_NUMBER_PATTERN.test(t) && t.length < 40) return true;
  // "서울시 관악구 신림동 123-45" 스타일
  if (
    (t.includes('시') || t.includes('도')) &&
    (t.includes('구') || t.includes('군')) &&
    t.includes('동') &&
    t.length < 50
  ) {
    return true;
  }
  return false;
}

interface ListingLike {
  id?: number | string | null;
  title?: string | null;
  ai_title?: string | null;
  ai_description?: string | null;
  description?: string | null;
  building_name?: string | null;
  dong?: string | null;
  type?: string | null;
  deal?: string | null;
  area_m2?: number | null;
  area_pyeong?: number | null;
  area?: number | null;
  floor_current?: string | number | null;
  floor_total?: string | number | null;
  total_floors?: string | number | null;
  floor?: string | number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  full_option?: boolean | null;
  parking?: boolean | null;
  elevator?: boolean | null;
  pet?: boolean | null;
  balcony?: boolean | null;
  direction?: string | null;
  station_name?: string | null;
  station_distance?: number | null;
  near_subway?: string | null;
  subway_distance?: number | null;
  build_year?: string | number | null;
  built_year?: string | number | null;
  features?: string[] | null;
}

// 옵션 불리언 → 한글 라벨
function collectOptionLabels(l: ListingLike): string[] {
  const out: string[] = [];
  if (l.full_option === true) out.push('풀옵션');
  if (l.parking === true) out.push('주차');
  if (l.elevator === true) out.push('엘리베이터');
  if (l.pet === true) out.push('반려동물 가능');
  if (l.balcony === true) out.push('베란다');
  return out;
}

function directionLabel(d?: string | null): string | null {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  if (/남동/.test(s)) return '남동향';
  if (/남서/.test(s)) return '남서향';
  if (/남/.test(s)) return '남향';
  if (/동/.test(s)) return '동향';
  if (/서/.test(s)) return '서향';
  if (/북/.test(s)) return '북향';
  return null;
}

// 자연스러운 한국어 열거 ", " + 마지막만 " · " 로 묶기 (과하지 않게)
function joinKo(items: string[], sep = ', '): string {
  return items.filter(Boolean).join(sep);
}

function pickStationPhrase(l: ListingLike): string | null {
  const station = l.station_name ?? l.near_subway ?? null;
  const dist = l.station_distance ?? l.subway_distance ?? null;
  if (station && typeof dist === 'number' && dist > 0 && dist <= 15) {
    return `${station} 도보 ${dist}분`;
  }
  if (station && typeof dist === 'number' && dist > 0) {
    return `${station} ${dist}분 거리`;
  }
  if (station) return `${station} 인근`;
  return null;
}

function pickAreaPhrase(l: ListingLike): string | null {
  const py = l.area_pyeong ?? 0;
  const m2 = l.area_m2 ?? l.area ?? 0;
  if (py && py >= 5) return `${Math.round(py)}평`;
  if (m2 && m2 > 0) return `${Math.round(Number(m2))}㎡`;
  return null;
}

function pickRoomPhrase(l: ListingLike): string | null {
  const r = typeof l.rooms === 'number' ? l.rooms : 0;
  const b = typeof l.bathrooms === 'number' ? l.bathrooms : 0;
  if (r >= 1 && b >= 1) return `방 ${r}개·욕실 ${b}개`;
  if (r >= 1) return `방 ${r}개`;
  return null;
}

function pickYearPhrase(l: ListingLike): string | null {
  const y = l.built_year ?? l.build_year ?? null;
  if (typeof y !== 'number' || !y) return null;
  if (y >= 2023) return '신축';
  if (y >= 2018) return '준신축';
  if (y >= 2010) return `${y}년 준공`;
  return null;
}

function pickFloorPhrase(l: ListingLike): string | null {
  const f = formatFloor({
    floor_current: l.floor_current ?? null,
    floor_total: l.floor_total ?? l.total_floors ?? null,
    floor: l.floor ?? null,
  } as any);
  return f || null;
}

function pickDongPhrase(l: ListingLike): string | null {
  const dong = (l.dong || '').trim();
  if (!dong) return null;
  return dong;
}

function pickTypePhrase(l: ListingLike): string | null {
  const t = (l.type || '').trim();
  return t || null;
}

// 자동 생성 — 데이터 기반 2문장 구조
function buildAutoDescription(l: ListingLike): string {
  const dong = pickDongPhrase(l);
  const type = pickTypePhrase(l);
  const station = pickStationPhrase(l);
  const area = pickAreaPhrase(l);
  const rooms = pickRoomPhrase(l);
  const year = pickYearPhrase(l);
  const floor = pickFloorPhrase(l);
  const dir = directionLabel(l.direction);
  const options = collectOptionLabels(l);
  const features = Array.isArray(l.features) ? l.features.slice(0, 4) : [];

  // ── 1문장: 지역 · 건물 · 구조 핵심 ──
  const lead: string[] = [];
  if (dong) lead.push(`${dong}`);
  if (station) lead.push(station);
  if (area) lead.push(area);
  if (rooms) lead.push(rooms);
  if (type && !(rooms && /룸/.test(type))) lead.push(type);

  // ── 2문장: 훅·옵션·층·방향 ──
  const hooks: string[] = [];
  if (year) hooks.push(year);
  if (floor) hooks.push(floor);
  if (dir) hooks.push(dir);
  if (options.length) hooks.push(options.slice(0, 3).join('·'));

  const first = joinKo(lead, ' · ');
  const second = hooks.length ? hooks.join(' · ') : '';

  // features 에 담긴 자유 텍스트는 자연어 보강 (중복 제거)
  const seen = new Set<string>([first, second]);
  const featLine = features
    .map((x) => String(x).trim())
    .filter((x) => x && !Array.from(seen).some((s) => s.includes(x)))
    .slice(0, 3)
    .join(' · ');

  // 문장 조립 — 빈 조각은 자연스럽게 스킵
  const sentences: string[] = [];
  if (first) sentences.push(first + (type || rooms ? ' 매물입니다.' : ' 매물.'));
  if (second) sentences.push(second + '.');
  if (featLine) sentences.push(featLine + '.');

  const out = sentences.join(' ').trim();
  if (out) return out;

  // 최종 폴백 — 정말 데이터가 부실할 때만
  if (dong && type) return `${dong} ${type} 매물입니다. 자세한 조건은 문의 주세요.`;
  if (type) return `${type} 매물입니다. 자세한 조건은 문의 주세요.`;
  return '매물 정보는 상세 페이지에서 확인해 주세요.';
}

/**
 * 매물 설명 표시용 문자열을 반환.
 * 우선순위:
 *   1) ai_description (세일즈 카피형 AI 생성)
 *   2) raw description (주소 나열형이 아닐 때)
 *   3) rich 데이터 기반 자동 생성
 */
export function displayDescription(listing: ListingLike, opts?: { maxLength?: number }): string {
  const max = opts?.maxLength ?? 180;

  const ai = (listing.ai_description || '').trim();
  if (ai && !isRawAddressDescription(ai)) {
    return ai.length > max ? ai.slice(0, max - 1) + '…' : ai;
  }

  const raw = (listing.description || '').trim();
  if (raw && !isRawAddressDescription(raw)) {
    return raw.length > max ? raw.slice(0, max - 1) + '…' : raw;
  }

  const auto = buildAutoDescription(listing);
  return auto.length > max ? auto.slice(0, max - 1) + '…' : auto;
}
