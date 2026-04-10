/**
 * 층수 포맷팅 유틸리티
 * 지하층을 한국어로 변환하고 층수를 올바른 형식으로 표시합니다.
 */

import type { Listing } from '@/types';

/**
 * 단일 층수 문자열을 한국어로 변환
 * @param floor - 층수 문자열 (e.g., "B1", "B2", "0.5", "1", "3")
 * @returns 포맷된 층수 (e.g., "지하1층", "지하2층", "반지하", "1층", "3층")
 */
export function formatFloorNumber(floor: string): string {
  if (!floor) return '';

  // 반지하 처리 (반지하, 0.5)
  if (floor === '반지하' || floor === '0.5' || floor === '0,5') {
    return '반지하';
  }

  // 지하층 처리 (B1, B2, B3 등)
  const basementMatch = floor.match(/^[Bb](\d+)$/);
  if (basementMatch) {
    const floorNum = basementMatch[1];
    return `지하${floorNum}층`;
  }

  // 숫자만 처리 (3, 10 등)
  const numberMatch = floor.match(/^\d+$/);
  if (numberMatch) {
    return `${floor}층`;
  }

  // 이미 한글이 포함되어 있으면 그대로 반환
  if (floor.includes('층') || floor.includes('지하')) {
    return floor;
  }

  // 그 외의 경우, 층을 추가
  return floor.includes('층') ? floor : `${floor}층`;
}

/**
 * Listing 객체에서 층수를 포맷팅하여 반환
 * @param listing - Listing 객체
 * @returns 포맷된 층수 문자열 (e.g., "지하1층", "3/10층")
 */
export function formatFloor(listing: Listing): string {
  const current = listing.floor_current || listing.floor || '';
  const total = listing.floor_total;

  if (!current) return '';

  const formattedCurrent = formatFloorNumber(current);

  // floor_total이 있으면 현재층/전체층 형식
  if (total) {
    const formattedTotal = formatFloorNumber(total);
    // 이미 "층"이 포함되어 있으면 제거하고 재조합
    const currentWithoutUnit = formattedCurrent.replace(/층$/, '');
    const totalWithoutUnit = formattedTotal.replace(/층$/, '');
    return `${currentWithoutUnit}/${totalWithoutUnit}층`;
  }

  return formattedCurrent;
}

/**
 * 층수 문자열만 포맷팅 (floor_current와 floor_total을 따로 받는 경우)
 * @param floorCurrent - 현재 층수
 * @param floorTotal - 전체 층수 (선택사항)
 * @returns 포맷된 층수 문자열
 */
export function formatFloorWithTotal(
  floorCurrent?: string | null,
  floorTotal?: string | null
): string {
  if (!floorCurrent) return '';

  // floorCurrent에 이미 "/"가 포함된 경우 (예: "2/4") → 그대로 사용
  if (floorCurrent.includes('/')) {
    const parts = floorCurrent.split('/');
    const current = formatFloorNumber(parts[0].trim());
    const total = formatFloorNumber(parts[parts.length - 1].trim());
    const currentWithoutUnit = current.replace(/층$/, '');
    const totalWithoutUnit = total.replace(/층$/, '');
    return `${currentWithoutUnit}/${totalWithoutUnit}층`;
  }

  const formattedCurrent = formatFloorNumber(floorCurrent);

  if (floorTotal) {
    const formattedTotal = formatFloorNumber(floorTotal);
    const currentWithoutUnit = formattedCurrent.replace(/층$/, '');
    const totalWithoutUnit = formattedTotal.replace(/층$/, '');
    return `${currentWithoutUnit}/${totalWithoutUnit}층`;
  }

  return formattedCurrent;
}
