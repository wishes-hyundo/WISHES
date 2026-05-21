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


/** 거래유형별 월세 표기 — "보증금 / 월세" */
function monthlyStr(deposit?: number | null, monthly?: number | null): string {
  const dep = formatManwon(deposit);
  const mon = monthly != null && monthly > 0 ? monthly.toLocaleString() : '-';
  return `${dep} / ${mon}`;
}

/**
 * 복합거래 대응 — 한 매물이 매매·전세·월세를 동시에 내놓을 수 있다.
 * 주 거래유형(deal) + 보조 컬럼(price·deposit_jeonse·monthly_alt·deposit_alt)을
 * 모두 읽어 표시할 가격 줄을 배열로 반환. 데이터가 한 가지뿐이면 1줄.
 */
export function priceLines(l: SearchListing): { deal: string; value: string }[] {
  const deal = l.deal || '';
  const out: { deal: string; value: string }[] = [];

  if (deal === '매매') out.push({ deal: '매매', value: formatManwon(l.price) });
  else if (deal === '전세') out.push({ deal: '전세', value: formatManwon(l.deposit) });
  else if (deal === '월세' || deal === '전월세') out.push({ deal: '월세', value: monthlyStr(l.deposit, l.monthly) });

  // 보조(복합) 가격
  if (deal !== '매매' && l.price != null && l.price > 0)
    out.push({ deal: '매매', value: formatManwon(l.price) });
  if (deal !== '전세' && l.deposit_jeonse != null && l.deposit_jeonse > 0)
    out.push({ deal: '전세', value: formatManwon(l.deposit_jeonse) });
  if (deal !== '월세' && deal !== '전월세' && l.monthly_alt != null && l.monthly_alt > 0)
    out.push({ deal: '월세', value: monthlyStr(l.deposit_alt, l.monthly_alt) });

  return out.length ? out : [{ deal, value: formatPrice(l) }];
}


/**
 * 복합거래 병합 — 같은 주소·동호수인데 거래유형만 다른 별도 행들을
 * 한 매물로 합친다. 실측: 66,232 유닛 중 2,148곳이 복합거래(전세 행 + 월세 행 등).
 * address_detail 이 있을 때만 병합(같은 유닛임을 확신할 수 있을 때).
 * 표시 순서는 보존.
 */
export function mergeUnitDeals(listings: SearchListing[]): SearchListing[] {
  const groups = new Map<string, SearchListing[]>();
  const order: string[] = [];
  for (const l of listings) {
    const detail = String(l.address_detail ?? '').trim();
    const key = detail ? `${String(l.address ?? '').trim()}|${detail}` : `__solo_${l.id}`;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(l);
  }
  const out: SearchListing[] = [];
  for (const key of order) {
    const grp = groups.get(key)!;
    if (grp.length === 1 || new Set(grp.map((g) => g.deal)).size <= 1) {
      out.push(...grp);
      continue;
    }
    const base: SearchListing = { ...grp[0] };
    for (const g of grp) {
      if (g.deal === '매매' && g.price != null && base.deal !== '매매') base.price = g.price;
      if (g.deal === '전세' && g.deposit != null && base.deal !== '전세') base.deposit_jeonse = g.deposit;
      if ((g.deal === '월세' || g.deal === '전월세') && g.monthly != null && base.deal !== '월세' && base.deal !== '전월세') {
        base.monthly_alt = g.monthly;
        base.deposit_alt = g.deposit ?? null;
      }
    }
    out.push(base);
  }
  return out;
}
