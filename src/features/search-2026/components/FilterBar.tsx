'use client';

/**
 * FilterBar — /search 재구축 필터 바 (P2)
 *
 * 명세서 §2 기준. 계층형(progressive disclosure):
 *   · 핵심 필터(거래유형·매물종류)는 항상 노출
 *   · 상세 필터(방·룸형태·층·준공·거실·주차·추가필터·가격·면적)는 펼침
 *   · 적용 중인 필터는 칩으로 요약, 칩 ✕ 로 개별 해제
 * 상태: useSearchStore (Zustand). 옵션 값: FILTER_OPTIONS (types.ts 단일 출처).
 */

import { FILTER_OPTIONS, type SearchFilters, type SearchOptionKey } from '../types';
import { useSearchStore } from '../store';
import styles from './FilterBar.module.css';

interface ChipRowProps {
  label: string;
  chips: { value: string; label: string; active: boolean }[];
  onPick: (value: string) => void;
}
function ChipRow({ label, chips, onPick }: ChipRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.chips}>
        {chips.map((c) => (
          <button
            key={c.value}
            type="button"
            className={c.active ? `${styles.chip} ${styles.chipOn}` : styles.chip}
            onClick={() => onPick(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const RANGES: { label: string; min: keyof SearchFilters; max: keyof SearchFilters; unit: string }[] = [
  { label: '기준가', min: 'minBase', max: 'maxBase', unit: '만원' },
  { label: '보증금', min: 'minDeposit', max: 'maxDeposit', unit: '만원' },
  { label: '월세', min: 'minMonthly', max: 'maxMonthly', unit: '만원' },
  { label: '매매가', min: 'minSale', max: 'maxSale', unit: '만원' },
  { label: '전용면적', min: 'minArea', max: 'maxArea', unit: '㎡' },
  { label: '공급면적', min: 'minSupply', max: 'maxSupply', unit: '㎡' },
];

export function FilterBar() {
  const { filters, detailOpen, setFilter, toggleValue, toggleDetail, reset } = useSearchStore();

  // ── 핵심 필터 ──
  const dealChips = FILTER_OPTIONS.deals.map((d) => ({
    value: d, label: d,
    active: d === '전체' ? !filters.deals?.length : !!filters.deals?.includes(d),
  }));
  const typeChips = FILTER_OPTIONS.types.map((t) => ({
    value: t, label: t,
    active: t === '전체' ? !filters.types?.length : !!filters.types?.includes(t),
  }));
  const pickDeal = (v: string) => (v === '전체' ? setFilter('deals', undefined) : toggleValue('deals', v));
  const pickType = (v: string) => (v === '전체' ? setFilter('types', undefined) : toggleValue('types', v));

  // ── 상세 필터 ──
  const roomChips = FILTER_OPTIONS.roomCounts.map((r) => ({
    value: r, label: r,
    active: r === '전체' ? !filters.roomCounts?.length : !!filters.roomCounts?.includes(r),
  }));
  const shapeChips = FILTER_OPTIONS.roomShapes.map((s) => ({
    value: s, label: s, active: s === '전체' ? !filters.roomShape : filters.roomShape === s,
  }));
  const floorChips = FILTER_OPTIONS.floorTypes.map((f) => ({
    value: f, label: f, active: f === '전체' ? !filters.floorType : filters.floorType === f,
  }));
  const livingChips = FILTER_OPTIONS.livingSizes.map((l) => ({
    value: l, label: l, active: l === '전체' ? !filters.livingSize : filters.livingSize === l,
  }));
  const yearChips = [
    { value: '0', label: '전체', active: !filters.builtYearMin },
    ...FILTER_OPTIONS.builtYears.map((y) => ({
      value: String(y), label: `${y}~`, active: filters.builtYearMin === y,
    })),
  ];
  const parkChips = [
    { value: '0', label: '전체', active: !filters.parkingMin },
    ...FILTER_OPTIONS.parkingMins.map((n) => ({
      value: String(n), label: `${n}대+`, active: filters.parkingMin === n,
    })),
  ];

  const pickSingle = <K extends keyof SearchFilters>(key: K, total: string) => (v: string) =>
    setFilter(key, (v === total ? undefined : v) as SearchFilters[K]);
  const pickNum = <K extends keyof SearchFilters>(key: K) => (v: string) =>
    setFilter(key, (v === '0' ? undefined : Number(v)) as SearchFilters[K]);

  // ── 적용 필터 칩 ──
  const applied: { key: string; label: string; remove: () => void }[] = [];
  filters.deals?.forEach((d) => applied.push({ key: `deal-${d}`, label: d, remove: () => toggleValue('deals', d) }));
  filters.types?.forEach((t) => applied.push({ key: `type-${t}`, label: t, remove: () => toggleValue('types', t) }));
  filters.roomCounts?.forEach((r) => applied.push({ key: `room-${r}`, label: `방 ${r}`, remove: () => toggleValue('roomCounts', r) }));
  if (filters.roomShape) applied.push({ key: 'shape', label: filters.roomShape, remove: () => setFilter('roomShape', undefined) });
  if (filters.floorType) applied.push({ key: 'floor', label: filters.floorType, remove: () => setFilter('floorType', undefined) });
  if (filters.livingSize) applied.push({ key: 'living', label: filters.livingSize, remove: () => setFilter('livingSize', undefined) });
  if (filters.builtYearMin) applied.push({ key: 'year', label: `${filters.builtYearMin}년 이후`, remove: () => setFilter('builtYearMin', undefined) });
  if (filters.parkingMin) applied.push({ key: 'park', label: `주차 ${filters.parkingMin}대+`, remove: () => setFilter('parkingMin', undefined) });
  filters.options?.forEach((o) => {
    const opt = FILTER_OPTIONS.options.find((x) => x.key === o);
    if (opt) applied.push({ key: `opt-${o}`, label: opt.label, remove: () => toggleValue('options', o) });
  });

  return (
    <div className={styles.bar}>
      <div className={styles.core}>
        <ChipRow label="거래유형" chips={dealChips} onPick={pickDeal} />
        <ChipRow label="매물종류" chips={typeChips} onPick={pickType} />
        <button type="button" className={styles.detailToggle} onClick={toggleDetail}>
          <span>상세 필터</span>
          <span className={styles.detailHint}>방 · 층 · 준공 · 면적 · 주차 외</span>
          <span className={detailOpen ? `${styles.caret} ${styles.caretUp}` : styles.caret} aria-hidden="true">▾</span>
        </button>
      </div>

      {detailOpen && (
        <div className={styles.detail}>
          <ChipRow label="방 갯수" chips={roomChips} onPick={(v) => (v === '전체' ? setFilter('roomCounts', undefined) : toggleValue('roomCounts', v))} />
          <ChipRow label="룸형태" chips={shapeChips} onPick={pickSingle('roomShape', '전체')} />
          <ChipRow label="층구분" chips={floorChips} onPick={pickSingle('floorType', '전체')} />
          <ChipRow label="준공년도" chips={yearChips} onPick={pickNum('builtYearMin')} />
          <ChipRow label="거실크기" chips={livingChips} onPick={pickSingle('livingSize', '전체')} />
          <ChipRow label="주차대수" chips={parkChips} onPick={pickNum('parkingMin')} />

          <div className={styles.row}>
            <span className={styles.rowLabel}>추가필터</span>
            <div className={styles.checks}>
              {FILTER_OPTIONS.options.map((o) => {
                const on = !!filters.options?.includes(o.key as SearchOptionKey);
                return (
                  <button
                    key={o.key}
                    type="button"
                    className={on ? `${styles.check} ${styles.checkOn}` : styles.check}
                    onClick={() => toggleValue('options', o.key)}
                  >
                    <span className={styles.box} aria-hidden="true" />
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {RANGES.map((r) => (
            <div className={styles.row} key={r.label}>
              <span className={styles.rowLabel}>{r.label}</span>
              <div className={styles.rangeWrap}>
                <input
                  type="number" inputMode="numeric" placeholder="최소"
                  className={styles.numInput}
                  value={(filters[r.min] as number | undefined) ?? ''}
                  onChange={(e) => setFilter(r.min, (e.target.value ? Number(e.target.value) : undefined) as never)}
                />
                <span className={styles.tilde}>~</span>
                <input
                  type="number" inputMode="numeric" placeholder="최대"
                  className={styles.numInput}
                  value={(filters[r.max] as number | undefined) ?? ''}
                  onChange={(e) => setFilter(r.max, (e.target.value ? Number(e.target.value) : undefined) as never)}
                />
                <span className={styles.unit}>{r.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {applied.length > 0 && (
        <div className={styles.applied}>
          <span className={styles.appliedLabel}>적용중</span>
          {applied.map((a) => (
            <button key={a.key} type="button" className={styles.appliedChip} onClick={a.remove}>
              {a.label}
              <span className={styles.appliedX} aria-hidden="true">✕</span>
            </button>
          ))}
          <button type="button" className={styles.resetBtn} onClick={reset}>전체 초기화</button>
        </div>
      )}
    </div>
  );
}

export default FilterBar;
