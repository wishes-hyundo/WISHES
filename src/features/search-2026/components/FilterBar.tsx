'use client';

/**
 * FilterBar — /search 재구축 필터 바 (P2)
 *
 * 명세서 §2 + 필터 표준(★search_필터_표준.md) 기준.
 * ★ 적응형 필터: 매물유형·거래유형에 따라 필터 행이 달라진다.
 *   · 토지   → 방·욕실·룸형태·층·준공·주차·주거옵션 숨김, 면적만
 *   · 상업용 → 방·욕실·반려동물·풀옵션 숨김 (상업 전용 필터는 P1 후속)
 *   · 거래유형 → 매매=매매가만 / 전세=보증금만 / 월세·전월세=보증금+월세
 * 상태: useSearchStore. 옵션 값: FILTER_OPTIONS (types.ts 단일 출처).
 */

import { FILTER_OPTIONS, type SearchFilters, type SearchOptionKey } from '../types';
import { useSearchStore } from '../store';
import styles from './FilterBar.module.css';

type Mode = 'residential' | 'commercial' | 'land' | 'all';

const RESIDENTIAL = new Set(['원룸', '오피스텔', '아파트', '빌라']);
const COMMERCIAL = new Set(['사무실', '상가']);

/** 선택된 매물유형으로 필터 모드 판정 */
function deriveMode(types?: string[]): Mode {
  if (!types || types.length === 0) return 'all';
  if (types.every((t) => t === '토지')) return 'land';
  if (types.every((t) => RESIDENTIAL.has(t))) return 'residential';
  if (types.every((t) => COMMERCIAL.has(t))) return 'commercial';
  return 'all';
}

/** 주거 전용 추가필터 옵션 (상업·토지에선 숨김) */
const RESIDENTIAL_OPTS = new Set<SearchOptionKey>(['no_full_option', 'full_option_only', 'pet_ok', 'balcony']);

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

interface RangeDef {
  label: string; min: keyof SearchFilters; max: keyof SearchFilters; unit: string;
  deals?: string[];  // 이 거래유형일 때만 노출 (없으면 항상)
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

  // 거래유형별 가격 칸 노출 판정
  const deals = filters.deals ?? [];
  const showRange = (r: RangeDef) => !r.deals || deals.length === 0 || r.deals.some((d) => deals.includes(d));

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
    if (v.startsWith('min:')) { setFilter('builtYearMin', Number(v.slice(4))); setFilter('builtYearMax', undefined); }
    else { setFilter('builtYearMax', Number(v.slice(4)) - 1); setFilter('builtYearMin', undefined); }
  };
  const bathChips = FILTER_OPTIONS.bathrooms.map((b, i) => ({
    value: String(i), label: b, active: i === 0 ? !filters.bathroomsMin : filters.bathroomsMin === i,
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

  // 모드별 행 노출
  const showRooms = mode === 'residential' || mode === 'all';
  const showBath = showRooms;
  const showStructure = mode !== 'land';   // 룸형태·층·준공·주차
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
          <span className={styles.detailHint}>
            {mode === 'land' ? '면적 중심' : mode === 'commercial' ? '상업용' : '방 · 룸형태 · 층 · 준공 · 욕실 · 주차 · 가격 · 면적'}
          </span>
          <span className={detailOpen ? `${styles.caret} ${styles.caretUp}` : styles.caret} aria-hidden="true">▾</span>
        </button>
      </div>

      {detailOpen && (
        <div className={styles.detail}>
          {showRooms && (
            <ChipRow label="방 갯수" chips={roomChips} onPick={(v) => (v === '전체' ? setFilter('roomCounts', undefined) : toggleValue('roomCounts', v))} />
          )}
          {showStructure && <ChipRow label="룸형태" chips={shapeChips} onPick={pickSingle('roomShape', '전체')} />}
          {showStructure && <ChipRow label="층구분" chips={floorChips} onPick={pickSingle('floorType', '전체')} />}
          {showStructure && <ChipRow label="준공년도" chips={yearChips} onPick={pickYear} />}
          {showBath && <ChipRow label="욕실" chips={bathChips} onPick={pickNum('bathroomsMin')} />}
          {showStructure && <ChipRow label="주차대수" chips={parkChips} onPick={pickNum('parkingMin')} />}

          <div className={styles.row}>
            <span className={styles.rowLabel}>추가필터</span>
            <div className={styles.checks}>
              {optList.map((o) => {
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

          {[...PRICE_RANGES.filter(showRange), ...AREA_RANGES].map((r) => (
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

          {mode === 'commercial' && (
            <div className={styles.noteRow}>상가·사무실 전용 필터(권리금·전기용량·간판·추천업종)는 후속 보강 예정 — 필터 표준 문서 §A·§D 참조</div>
          )}
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
