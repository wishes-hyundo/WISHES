'use client';

/**
 * FilterBar — /search 재구축 필터 바 (P2)
 *
 * 명세서 §2 기준 + 데이터 실측 보강(2026-05-21):
 *   · 방 갯수 — 4~6개 매물(402건) 검색용 '3개 이상'·'4개 이상' 추가
 *   · 준공년도 — 2000년 이전 매물(23,842건) 검색용 '이전' 칩 추가
 *   · 룸형태 — 실제 DB값(전층사용·일부층사용 포함)으로 정정 + 서버 적용
 *   · 욕실 — 신규 (욕실 2개+ 1,671건)
 *   · 반려동물 가능 — 신규 추가필터 (pet=true 2,990건)
 * 모든 옵션은 서버 /api/admin/listings/page 가 실제 SQL로 거른다.
 * 상태: useSearchStore. 옵션 값: FILTER_OPTIONS (types.ts 단일 출처).
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
  // 준공년도 — '이후'(min) + '이전'(max) 통합 단일선택
  const yearChips = [
    { value: 'all', label: '전체', active: !filters.builtYearMin && !filters.builtYearMax },
    ...FILTER_OPTIONS.builtYears.map((y) => ({
      value: `min:${y}`, label: `${y}~`, active: filters.builtYearMin === y,
    })),
    ...FILTER_OPTIONS.builtYearsBefore.map((y) => ({
      value: `max:${y}`, label: `~${y}`, active: filters.builtYearMax === y - 1,
    })),
  ];
  const pickYear = (v: string) => {
    if (v === 'all') { setFilter('builtYearMin', undefined); setFilter('builtYearMax', undefined); return; }
    if (v.startsWith('min:')) {
      setFilter('builtYearMin', Number(v.slice(4))); setFilter('builtYearMax', undefined);
    } else {
      setFilter('builtYearMax', Number(v.slice(4)) - 1); setFilter('builtYearMin', undefined);
    }
  };
  // 욕실 — N개 이상
  const bathChips = FILTER_OPTIONS.bathrooms.map((b, i) => ({
    value: String(i), label: b,
    active: i === 0 ? !filters.bathroomsMin : filters.bathroomsMin === i,
  }));
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
  if (filters.builtYearMin) applied.push({ key: 'ymin', label: `${filters.builtYearMin}년 이후`, remove: () => setFilter('builtYearMin', undefined) });
  if (filters.builtYearMax) applied.push({ key: 'ymax', label: `${filters.builtYearMax + 1}년 이전`, remove: () => setFilter('builtYearMax', undefined) });
  if (filters.bathroomsMin) applied.push({ key: 'bath', label: `욕실 ${filters.bathroomsMin}개 이상`, remove: () => setFilter('bathroomsMin', undefined) });
  if (filters.parkingMin) applied.push({ key: 'park', label: `주차 ${filters.parkingMin}대+`, remove: () => setFilter('parkingMin', undefined) });
  filters.options?.forEach((o) => {
    const opt = FILTER_OPTIONS.options.find((x) => x.key === o);
    if (opt) applied.push({ key: `opt-${o}`, label: opt.label, remove: () => toggleValue('options', o) });
  });

  return (
    <div className={styles.bar}>
      <div className={styles.core}>
        <ChipRow label="거래유형" chips={dealChips} onPick={(v) => (v === '전체' ? setFilter('deals', undefined) : toggleValue('deals', v))} />
        <ChipRow label="매물종류" chips={typeChips} onPick={(v) => (v === '전체' ? setFilter('types', undefined) : toggleValue('types', v))} />
        <button type="button" className={styles.detailToggle} onClick={toggleDetail}>
          <span>상세 필터</span>
          <span className={styles.detailHint}>방 · 룸형태 · 층 · 준공 · 욕실 · 주차 · 가격 · 면적</span>
          <span className={detailOpen ? `${styles.caret} ${styles.caretUp}` : styles.caret} aria-hidden="true">▾</span>
        </button>
      </div>

      {detailOpen && (
        <div className={styles.detail}>
          <ChipRow label="방 갯수" chips={roomChips} onPick={(v) => (v === '전체' ? setFilter('roomCounts', undefined) : toggleValue('roomCounts', v))} />
          <ChipRow label="룸형태" chips={shapeChips} onPick={pickSingle('roomShape', '전체')} />
          <ChipRow label="층구분" chips={floorChips} onPick={pickSingle('floorType', '전체')} />
          <ChipRow label="준공년도" chips={yearChips} onPick={pickYear} />
          <ChipRow label="욕실" chips={bathChips} onPick={pickNum('bathroomsMin')} />
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
