/**
 * search-2026 — 표시 포맷 유틸 (P3)
 * 가격·면적을 한국 부동산 관례대로 표기. 레거시 content.js formatPrice/formatArea 대응.
 */

import type { SearchListing } from './types';

/** 만원 단위 숫자 → "5억 8,000" / "9,500" */
export function formatManwon(n?: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '-';
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const rest = n % 10000;
    return rest > 0 ? `${eok}억 ${rest.toLocaleString()}` : `${eok}억`;
  }
  return n.toLocaleString();
}

/** 매물 거래유형에 맞춘 가격 문자열 */
export function formatPrice(l: SearchListing): string {
  const deal = l.deal || '';
  if (deal === '매매') return formatManwon(l.price);
  if (deal === '전세') return formatManwon(l.deposit);
  if (deal === '월세' || deal === '전월세') {
    const dep = formatManwon(l.deposit);
    const mon = l.monthly != null && l.monthly > 0 ? l.monthly.toLocaleString() : '-';
    return `${dep} / ${mon}`;
  }
  return formatManwon(l.price ?? l.deposit);
}

/** 면적 — "59.9㎡ (18평)" */
export function formatArea(l: SearchListing): string {
  const m2 = l.area_m2;
  if (m2 == null || !Number.isFinite(m2) || m2 <= 0) return '';
  const py = Math.round((m2 / 3.30579) * 10) / 10;
  return `${m2}㎡ (${py}평)`;
}

/** 층 — "3 / 12층" */
export function formatFloor(l: SearchListing): string {
  const cur = l.floor_current;
  const tot = l.floor_total;
  if (cur == null && tot == null) return '';
  if (tot != null) return `${cur ?? '-'} / ${tot}층`;
  return `${cur}층`;
}
