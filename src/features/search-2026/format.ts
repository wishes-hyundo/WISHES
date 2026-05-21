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

/**
 * 주소 표기 — base(주소/제목)와 detail(동·호 또는 address_detail)을 중복 없이 결합.
 * raw address 가 이미 층·동 정보를 품고 있어 detail 을 그대로 붙이면 토큰이 중복된다.
 *  (a) 토큰 겹침 결합: base 의 끝 N 토큰 == detail 의 앞 N 토큰이면 겹친 만큼 제거.
 *  (b) 결합 후 연속 중복 토큰 축약.
 * base 가 이미 detail 을 부분 문자열로 포함하면 결합 자체를 생략.
 */
export function displayAddress(l: SearchListing): string {
  const base = String(l.address || l.title || '주소 미상').trim();
  const detail = ([l.building_dong, l.building_ho].filter(Boolean).join(' ').trim())
    || String(l.address_detail ?? '').trim();

  let combined = base;
  if (detail && !base.includes(detail)) {
    const bt = base.split(/\s+/).filter(Boolean);
    const dt = detail.split(/\s+/).filter(Boolean);
    // (a) 토큰 겹침 결합 — base 끝 N == detail 앞 N
    let overlap = 0;
    const maxN = Math.min(bt.length, dt.length);
    for (let n = maxN; n >= 1; n--) {
      if (bt.slice(bt.length - n).join(' ') === dt.slice(0, n).join(' ')) { overlap = n; break; }
    }
    combined = [...bt, ...dt.slice(overlap)].join(' ');
  }
  // (b) 연속 중복 토큰 축약
  const tokens = combined.split(/\s+/).filter(Boolean);
  const dedup: string[] = [];
  for (const t of tokens) {
    if (dedup[dedup.length - 1] !== t) dedup.push(t);
  }
  return dedup.join(' ');
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

/* ── 소재지 그룹핑 (P3 §3-2) ────────────────────────────────
 * 기준(대표님 확정 2026-05-21, 데이터 분석 기반):
 *  같은 시/도+구+동 안에서 — ① 지번이 동일하거나, ② 건물명이 동일하면
 *  (필지가 달라도) 한 묶음. union-find 로 ①②를 모두 연결 → 전이 그룹.
 *  개수 제한 없음. 큰 건물(오피스텔·지산)은 수십~백 건도 한 그룹이 정상.
 * ───────────────────────────────────────────────────────── */

export interface LocationGroup {
  key: string;
  label: string;          // 소재지 표기 (시도+구+동 + 지번/건물명)
  listings: SearchListing[];
}

/** address 에서 동까지의 앞부분(시도+구+동) */
function regionPrefix(l: SearchListing): string {
  const addr = String(l.address ?? '').trim();
  const dong = String(l.dong ?? '').trim();
  if (dong && addr.includes(dong)) {
    return addr.slice(0, addr.indexOf(dong) + dong.length).trim();
  }
  return dong || addr;
}

/** 동 이후 첫 번지 토큰 = 지번 (예: 1547-8) */
function jibunOf(l: SearchListing): string | null {
  const addr = String(l.address ?? '').trim();
  const dong = String(l.dong ?? '').trim();
  const rest = dong && addr.includes(dong) ? addr.slice(addr.indexOf(dong) + dong.length) : addr;
  const m = rest.match(/(\d+(?:-\d+)?)/);
  return m ? m[1] : null;
}

function bldgKey(l: SearchListing): string | null {
  const b = String(l.building_name ?? '').replace(/\s+/g, '').trim();
  return b.length >= 2 ? b : null;
}

/**
 * 매물 목록을 소재지 단위로 묶는다. 표시 순서(첫 등장)는 보존.
 * 1건짜리 그룹도 그대로 1개 그룹으로 반환(렌더 측에서 단일 카드 처리).
 */
export function groupByLocation(listings: SearchListing[]): LocationGroup[] {
  const n = listings.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const jSeen = new Map<string, number>();
  const bSeen = new Map<string, number>();
  listings.forEach((l, i) => {
    const region = regionPrefix(l);
    const j = jibunOf(l);
    if (j) {
      const k = `${region}|J|${j}`;
      if (jSeen.has(k)) union(i, jSeen.get(k)!); else jSeen.set(k, i);
    }
    const b = bldgKey(l);
    if (b) {
      const k = `${region}|B|${b}`;
      if (bSeen.has(k)) union(i, bSeen.get(k)!); else bSeen.set(k, i);
    }
  });

  const buckets = new Map<number, SearchListing[]>();
  const order: number[] = [];
  listings.forEach((l, i) => {
    const r = find(i);
    if (!buckets.has(r)) { buckets.set(r, []); order.push(r); }
    buckets.get(r)!.push(l);
  });

  return order.map((r) => {
    const arr = buckets.get(r)!;
    const head = arr[0];
    const region = regionPrefix(head);
    const tail = bldgKey(head) ? String(head.building_name).trim() : (jibunOf(head) ?? '');
    return { key: `g${r}`, label: [region, tail].filter(Boolean).join(' '), listings: arr };
  });
}
