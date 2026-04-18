// 매물 제목 표시 유틸리티
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 크롤링/자동생성된 제목이 "서울 강남구 역삼동 752-38 3층" 같이 지번이 그대로 노출되는 경우,
// 동·유형·면적·층수 기반으로 정보성 제목을 생성. 최대 35자.

import { formatFloor } from './formatFloor';

// 지번(lot number) 패턴: 숫자-숫자 (예: 752-38) 또는 산 + 숫자
const LOT_NUMBER_PATTERN = /\b\d+-\d+\b|산\s?\d+-?\d*/;

// 제목에 전체 주소·지번이 포함되어 있는지
function hasRawAddress(title: string | null | undefined): boolean {
  if (!title) return false;
  if (LOT_NUMBER_PATTERN.test(title)) return true;
  // 특·광역시/도 + 구/군 + 동 패턴이 모두 들어간 경우도 재가공 대상
  const tokens = title.trim().split(/\s+/);
  if (tokens.length >= 4 && (title.includes('시') || title.includes('도')) && (title.includes('구') || title.includes('군')) && title.includes('동')) {
    return true;
  }
  return false;
}

interface ListingLike {
  title?: string | null;
  dong?: string | null;
  type?: string | null;
  area_m2?: number | null;
  area?: number | null;
  floor_current?: string | number | null;
  floor_total?: string | number | null;
  floor?: string | number | null;
  deal?: string | null;
}

/**
 * 매물 제목 표시용 문자열을 반환.
 * - 지번이 포함된 자동 생성 제목이면 "[동] [유형] [면적]㎡ [층]층" 형태로 재가공.
 * - 이미 세일즈 카피 형태면 원본 그대로 반환 (단, 35자 초과 시 절삭).
 */
export function displayTitle(listing: ListingLike): string {
  const raw = (listing.title || '').trim();
  const area = listing.area_m2 ?? listing.area ?? 0;
  const floor = formatFloor({
    floor_current: listing.floor_current ?? null,
    floor_total: listing.floor_total ?? null,
    floor: listing.floor ?? null,
  } as any);

  const buildInformative = () => {
    const parts: string[] = [];
    if (listing.dong) parts.push(listing.dong);
    if (listing.type) parts.push(listing.type);
    if (area > 0) parts.push(`${Math.round(area)}㎡`);
    if (floor) parts.push(floor);
    const result = parts.filter(Boolean).join(' ');
    return result || '매물';
  };

  // 1) 제목이 비어있거나 지번·전체주소 포함 → 정보성 제목 생성
  if (!raw || hasRawAddress(raw)) {
    return buildInformative().slice(0, 35);
  }

  // 2) 이미 세일즈 카피 형태 → 원본 (35자 절삭)
  if (raw.length <= 35) return raw;
  return raw.slice(0, 34) + '…';
}
