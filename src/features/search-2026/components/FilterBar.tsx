'use client';

/**
 * FilterBar — /search 재구축 필터 바 (P2)
 *
 * 통합 최종안(2026-05-21 확정):
 *   · 압축 1줄 바 — 거래유형·매물종류 칩 + [상세 필터] 버튼
 *   · 상세 필터 — 6칸 컬럼 그리드(방갯수·룸형태·층구분·준공년도·욕실·주차)
 *     + 추가필터 + 가격/면적/특이사항 (레거시 ws-filter-grid 형태)
 *   · 적응형 — 매물유형(토지/상업/주거)·거래유형에 따라 칸 자동 조정
 * 기준: ★search_완전기능명세서.md §2 · ★search_필터_표준.md
 * 옵션별 실시간 매물 수(faceted count)는 faceting 백엔드 RPC 후속.
 */

import { FILTER_OPTIONS, type SearchFilters, type SearchOptionKey } from '../types';
import { useSearchStore } from '../store';
import styles from './FilterBar.module.css';

type Mode = 'residential' | 'commercial' | 'land' | 'all';

const RESIDENTIAL = new Set(['원룸', '오피스텔', '아파트', '빌라']);
const COMMERCIAL = new Set(['사무실', '상가']);

function deriveMode(types?: string[]): Mode {
  if (!types || types.length === 0) return 'all';
  if (types.every((t) => t === '토지')) return 'land';
  if (types.every((t) => RESIDENTIAL.has(t))) return 'residential';
  if (types.every((t) => COMMERCIAL.has(t))) return 'commercial';
  return 'all';
}

const RESIDENTIAL_OPTS = new Set<SearchOptionKey>(['no_full_option', 'full_option_only', 'pet_ok', 'balcony']);

type Opt = { value: string; label: string; active: boolean };

/** 상세 필터 그리드 컬럼 */
function GridCol({ title, opts, onPick }: { title: string; opts: Opt[]; onPick: (v: string) => void }) {
  return (
    <div className={styles.gcol}>
      <div className={styles.gcolHead}>{title}</div>
      <div className={styles.gcolBody}>
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            className={o.active ? `${styles.gopt} ${styles.goptOn}` : styles.gopt}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface RangeDef {
  label: string; min: keyof SearchFilters; max: keyof SearchFilters; unit: string; deals?: string[];
}
const PRICE_RANGES: RangeDef[] = [
  { label: '기준가', min: 'minBase', max: 'maxBase', unit: '만원' },
  { label: '보증금', min: 'minDeposit', max: 'maxDeposit', unit: '만원', deals: ['월세', '전세', '전월세'] },
  { label: '월세', min: 'minMonthly', max: 'maxMonthly', unit: '만원', deals: ['월세', '전월세'] },
  { label: '매매가', min: 'minSale', max: 'maxSale', unit: '만원', deals: ['매매'] },
];
const AREA_RANGES: RangeDef[] = [
  { label: '전용면적', min: 'minArea', max: 'maxArea', unit: '㎡' },
  { label: '공급면적', min: 'minSupply', max: 'maxSupply', unit: '㎡' },
];

export function FilterBar() {
  const { filters, detailOpen, setFilter, toggleValue, toggleDetail, reset } = useSearchStore();
  const mode = deriveMode(filters.types);

  const detailCount =
    (filters.roomCounts?.length ?? 0) + (filters.options?.length ?? 0) +
    [filters.roomShape, filters.floorType, filters.builtYearMin, filters.builtYearMax,
     filters.bathroomsMin, filters.parkingMin,
     filters.minBase, filters.maxBase, filters.minDeposit, filters.maxDeposit,
     filters.minMonthly, filters.maxMonthly, filters.minSale, filters.maxSale,
     filters.minArea, filters.maxArea, filters.minSupply, filters.maxSupply]
      .filter((v) => v != null).length;

  const deals = filters.deals ?? [];
  const showRange = (r: RangeDef) => !r.deals || deals.length === 0 || r.deals.some((d) => deals.includes(d));

  // ── 핵심 칩 ──
  const dealChips: Opt[] = FILTER_OPTIONS.deals.filter((d) => d !== '전체').map((d) => ({
    value: d, label: d, active: !!filters.deals?.includes(d),
  }));
  const typeChips: Opt[] = FILTER_OPTIONS.types.filter((t) => t !== '전체').map((t) => ({
    value: t, label: t, active: !!filters.types?.includes(t),
  }));

  // ── 그리드 컬럼용 옵션 ──
  const roomOpts: Opt[] = FILTER_OPTIONS.roomCounts.map((r) => ({
    value: r, label: r, active: r === '전체' ? !filters.roomCounts?.length : !!filters.roomCounts?.includes(r),
  }));
  const shapeOpts: Opt[] = FILTER_OPTIONS.roomShapes.map((s) => ({
    value: s, label: s, active: s === '전체' ? !filters.roomShape : filters.roomShape === s,
  }));
  const floorOpts: Opt[] = FILTER_OPTIONS.floorTypes.map((f) => ({
    value: f, label: f, active: f === '전체' ? !filters.floorType : filters.floorType === f,
  }));
  const yearOpts: Opt[] = [
    { value: 'all', label: '전체', active: !filters.builtYearMin && !filters.builtYearMax },
    ...FILTER_OPTIONS.builtYears.map((y) => ({ value: `min:${y}`, label: `${y}~`, active: filters.builtYearMin === y })),
    ...FILTER_OPTIONS.builtYearsBefore.map((y) => ({ value: `max:${y}`, label: `~${y}`, active: filters.builtYearMax === y - 1 })),
  ];
  const bathOpts: Opt[] = FILTER_OPTIONS.bathrooms.map((b, i) => ({
    value: String(i), label: b, active: i === 0 ? !filters.bathroomsMin : filters.bathroomsMin === i,
  }));
  const parkOpts: Opt[] = [
    { value: '0', label: '전체', active: !filters.parkingMin },
    ...FILTER_OPTIONS.parkingMins.map((n) => ({ value: String(n), label: `${n}대 이상`, active: filters.parkingMin === n })),
  ];

  const pickRoom = (v: string) => (v === '전체' ? setFilter('roomCounts', undefined) : toggleValue('roomCounts', v));
  const pickShape = (v: string) => setFilter('roomShape', v === '전체' ? undefined : v);
  const pickFloor = (v: string) => setFilter('floorType', v === '전체' ? undefined : v);
  const pickYear = (v: string) => {
    if (v === 'all') { setFilter('builtYearMin', undefined); setFilter('builtYearMax', undefined); return; }
    if (v.startsWith('min:')) { setFilter('builtYearMin', Number(v.slice(4))); setFilter('builtYearMax', undefined); }
    else { setFilter('builtYearMax', Number(v.slice(4)) - 1); setFilter('builtYearMin', undefined); }
  };
  const pickBath = (v: string) => setFilter('bathroomsMin', v === '0' ? undefined : Number(v));
  const pickPark = (v: string) => setFilter('parkingMin', v === '0' ? undefined : Number(v));

  // 모드별 컬럼 구성
  const showRooms = mode === 'residential' || mode === 'all';
  const showStructure = mode !== 'land';
  const cols: { title: string; opts: Opt[]; onPick: (v: string) => void }[] = [];
  if (showRooms) cols.push({ title: '방 갯수', opts: roomOpts, onPick: pickRoom });
  if (showStructure) {
    cols.push({ title: '룸형태', opts: shapeOpts, onPick: pickShape });
    cols.push({ title: '층구분', opts: floorOpts, onPick: pickFloor });
    cols.push({ title: '준공년도', opts: yearOpts, onPick: pickYear });
  }
  if (showRooms) cols.push({ title: '욕실', opts: bathOpts, onPick: pickBath });
  if (showStructure) cols.push({ title: '주차', opts: parkOpts, onPick: pickPark });

  const optList = FILTER_OPTIONS.options.filter(
    (o) => mode === 'residential' || mode === 'all' || !RESIDENTIAL_OPTS.has(o.key as SearchOptionKey),
  );

  // ── 적용 필터 칩 ──
  const applied: { key: string; label: string; remove: () => void }[] = [];
  filters.deals?.forEach((d) => applied.push({ key: `deal-${d}`, label: d, remove: () => toggleValue('deals', d) }));
  filters.types?.forEach((t) => applied.push({ key: `type-${t}`, label: t, remove: () => toggleValue('types', t) }));
  filters.roomCounts?.forEach((r) => applied.push({ key: `room-${r}`, label: `방 ${r}`, remove: () => toggleValue('roomCounts', r) }));
  if (filters.roomShape) applied.push({ key: 'shape', label: filters.roomShape, remove: () => setFilter('roomShape', undefined) });
  if (filters.floorType) applied.push({ key: 'floor', label: filters.floorType, remove: () => setFilter('floorType', undefined) });
  if (filters.builtYearMin) applied.push({ key: 'ymin', label: `${filters.builtYearMin}년 이후`, remove: () => setFilter('builtYearMin', undefined) });
  if (filters.builtYearMax) applied.push({ key: 'ymax', label: `${filters.builtYearMax + 1}년 이전`, remove: () => setFilter('builtYearMax', undefined) });
  if (filters.bathroomsMin) applied.push({ key: 'bath', label: `욕실 ${filters.bathroomsMin}개 이상`, remove: () => setFilter('bathroomsMin', undefined) });
  if (filters.parkingMin) applied.push({ key: 'park', label: `주차 ${filters.parkingMin}대 이상`, remove: () => setFilter('parkingMin', undefined) });
  filters.options?.forEach((o) => {
    const opt = FILTER_OPTIONS.options.find((x) => x.key === o);
    if (opt) applied.push({ key: `opt-${o}`, label: opt.label, remove: () => toggleValue('options', o) });
  });

  return (
    <div className={styles.bar}>
      <div className={styles.core}>
        <div className={styles.compactRow}>
          {dealChips.map((c) => (
            <button key={`d-${c.value}`} type="button"
              className={c.active ? `${styles.chip} ${styles.chipOn}` : styles.chip}
              onClick={() => toggleValue('deals', c.value)}>{c.label}</button>
          ))}
          <span className={styles.barDivider} aria-hidden="true" />
          {typeChips.map((c) => (
            <button key={`t-${c.value}`} type="button"
              className={c.active ? `${styles.chip} ${styles.chipOn}` : styles.chip}
              onClick={() => toggleValue('types', c.value)}>{c.label}</button>
          ))}
          <button type="button"
            className={detailOpen ? `${styles.detailBtn} ${styles.detailBtnOn}` : styles.detailBtn}
            onClick={toggleDetail}>
            <span className={styles.detailBtnIco} aria-hidden="true">☰</span>
            상세 필터{detailCount > 0 ? ` (${detailCount})` : ''}
            <span className={detailOpen ? `${styles.caret} ${styles.caretUp}` : styles.caret} aria-hidden="true">▾</span>
          </button>
        </div>
      </div>

      {detailOpen && (
        <div className={styles.detail}>
          {cols.length > 0 && (
            <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
              {cols.map((c) => (
                <GridCol key={c.title} title={c.title} opts={c.opts} onPick={c.onPick} />
              ))}
            </div>
          )}

          <div className={styles.extra}>
            <div className={styles.extraLabel}>추가 필터</div>
            <div className={styles.checks}>
              {optList.map((o) => {
                const on = !!filters.options?.includes(o.key as SearchOptionKey);
                return (
                  <button key={o.key} type="button"
                    className={on ? `${styles.check} ${styles.checkOn}` : styles.check}
                    onClick={() => toggleValue('options', o.key)}>
                    <span className={styles.box} aria-hidden="true" />
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.ranges}>
            {[...PRICE_RANGES.filter(showRange), ...AREA_RANGES].map((r) => (
              <div className={styles.rangeRow} key={r.label}>
                <span className={styles.rangeLabel}>{r.label}</span>
                <input type="number" inputMode="numeric" placeholder="최소" className={styles.numInput}
                  value={(filters[r.min] as number | undefined) ?? ''}
                  onChange={(e) => setFilter(r.min, (e.target.value ? Number(e.target.value) : undefined) as never)} />
                <span className={styles.tilde}>~</span>
                <input type="number" inputMode="numeric" placeholder="최대" className={styles.numInput}
                  value={(filters[r.max] as number | undefined) ?? ''}
                  onChange={(e) => setFilter(r.max, (e.target.value ? Number(e.target.value) : undefined) as never)} />
                <span className={styles.unit}>{r.unit}</span>
              </div>
            ))}
            <div className={styles.rangeRow}>
              <span className={styles.rangeLabel}>특이사항</span>
              <input type="text" placeholder="건물명·주소·설명 키워드" className={styles.kwInput}
                value={filters.keyword ?? ''}
                onChange={(e) => setFilter('keyword', e.target.value || undefined)} />
            </div>
          </div>
        </div>
      )}

      {applied.length > 0 && (
        <div className={styles.applied}>
          <span className={styles.appliedLabel}>적용중</span>
          {applied.map((a) => (
            <button key={a.key} type="button" className={styles.appliedChip} onClick={a.remove}>
              {a.label}<span className={styles.appliedX} aria-hidden="true">✕</span>
            </button>
          ))}
          <button type="button" className={styles.resetBtn} onClick={reset}>전체 초기화</button>
        </div>
      )}
    </div>
  );
}

export default FilterBar;
