// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FilterAccordion — 12 추가필터 아코디언 (v7 §6)
//
// 🎯 목적
//   Row 3 chips 는 "자주 쓰는 6-7개" 만 노출. 깊은 필터(가격/면적 범위,
//   방 4+, 편의시설 세트, 방향/층수/입주조건 등) 는 이 아코디언에 격납.
//   v7 §6 "12 추가필터 accordion" 스펙.
//
// 📐 구조
//   12 섹션 각각:
//     - header: [icon] [label] [active count badge] [▽/△]
//     - body  : 섹션별 UI (range slider / checkbox / chip grid)
//   각 섹션 열림 상태는 store.accordionOpen 으로 localStorage 영속
//
// 📎 상태 매핑
//   1) price       → filter.minPrice/maxPrice         (매매가)
//   2) deposit     → filter.minDeposit/maxDeposit     (보증금/전세금)
//   3) monthly     → filter.minMonthly/maxMonthly     (월세)
//   4) area        → filter.minArea/maxArea           (전용면적 m²)
//   5) roomsMore   → filter.rooms (4+, 5+, 6+)        (Row3 확장)
//   6) propertyTypes → filter.propertyTypes           (아파트/오피스텔…)
//   7) newBuild    → filter.newBuildYears (1/3/5/10)
//   8) nearStation → filter.nearStation (300/500/1000)
//   9) amenities   → filter.features (CCTV, 택배함, 경비, 보안, 무인택배, 헬스장, 카페)
//  10) floorLevel  → filter.features (저층/중층/고층/반지층/옥탑)
//  11) direction   → filter.features (남향/동남향/서향/…)
//  12) moveIn      → filter.features (즉시입주/1개월/3개월)
//
// ♿ 접근성
//   각 header: role="button" + aria-expanded + aria-controls
//   body: id 연결, role="region"
//   Enter/Space 로 토글 (button 기본 동작)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMemo, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Coins,
  Wallet,
  Banknote,
  Ruler,
  DoorOpen,
  Building2,
  Sparkles,
  Train,
  Wrench,
  Layers3,
  Compass,
  CalendarDays,
} from 'lucide-react';
import { useMap2026Store, type FilterState, type PropertyCategory } from '../store';

// ─────────────────────────────────────────────────────────────────
// 공용 섹션 프레임
// ─────────────────────────────────────────────────────────────────
// L-mapfilter2 (2026-04-23): emoji prop → Icon prop.
//   이전에는 text-[14px] 의 이모지를 렌더해 "아기 장난 같다" 는 피드백을 받음.
//   Lucide 아이콘 14px 로 전문성·일관성 확보. 각 섹션 의미별 아이콘 매핑:
//     price→Coins, deposit→Wallet, monthly→Banknote, area→Ruler,
//     roomsMore→DoorOpen, propTypes→Building2, newBuild→Sparkles,
//     station→Train, amenities→Wrench, floorLevel→Layers3,
//     direction→Compass, moveIn→CalendarDays.
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface SectionProps {
  id: string;
  Icon: IconComponent;
  label: string;
  activeCount: number;
  children: ReactNode;
}

function Section({ id, Icon, label, activeCount, children }: SectionProps) {
  const open = useMap2026Store((s) => !!s.accordionOpen[id]);
  const toggleAccordion = useMap2026Store((s) => s.toggleAccordion);
  const panelId = `fa-panel-${id}`;

  return (
    <div className="border-b border-neutral-100 last:border-b-0">
      <button
        type="button"
        onClick={() => toggleAccordion(id)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900"
      >
        <span className="flex items-center gap-2">
          <Icon className="size-[14px] text-neutral-600" aria-hidden="true" />
          <span className="text-[13px] font-semibold text-neutral-800">{label}</span>
          {activeCount > 0 && (
            <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10.5px] font-bold text-white tabular-nums">
              {activeCount}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="size-4 text-neutral-500" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4 text-neutral-500" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div id={panelId} role="region" aria-label={label} className="px-4 pb-3 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Range 입력 (min/max 숫자 쌍)
// ─────────────────────────────────────────────────────────────────
interface RangeProps {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  unit: string;
  placeholderMin?: string;
  placeholderMax?: string;
  step?: number;
}

function RangeInput({ min, max, onChange, unit, placeholderMin, placeholderMax, step = 1 }: RangeProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        value={min ?? ''}
        step={step}
        onChange={(e) => {
          const v = e.target.value === '' ? null : Number(e.target.value);
          onChange(Number.isFinite(v) ? v : null, max);
        }}
        placeholder={placeholderMin ?? '최소'}
        className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-[12.5px] tabular-nums focus:border-neutral-900 focus:outline-none"
      />
      <span className="text-neutral-400">~</span>
      <input
        type="number"
        inputMode="numeric"
        value={max ?? ''}
        step={step}
        onChange={(e) => {
          const v = e.target.value === '' ? null : Number(e.target.value);
          onChange(min, Number.isFinite(v) ? v : null);
        }}
        placeholder={placeholderMax ?? '최대'}
        className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-[12.5px] tabular-nums focus:border-neutral-900 focus:outline-none"
      />
      <span className="text-[12px] text-neutral-500">{unit}</span>
      {(min != null || max != null) && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className="ml-auto text-[11px] text-neutral-500 hover:text-neutral-900 underline-offset-2 hover:underline"
        >
          해제
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Toggle chip (multi-select 또는 single radio)
// ─────────────────────────────────────────────────────────────────
interface ToggleChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToggleChip({ active, onClick, children }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'rounded-full px-3 py-1.5 text-[12px] transition',
        active
          ? 'bg-neutral-900 text-white shadow-sm'
          : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// 카테고리별 propertyTypes 옵션
// ─────────────────────────────────────────────────────────────────
const PROPERTY_TYPES_BY_CATEGORY: Record<PropertyCategory, string[]> = {
  residence: ['아파트', '오피스텔', '빌라', '원룸', '단독주택', '다세대', '도시형생활주택'],
  retail_office: ['상가', '사무실', '지식산업센터', '공유오피스', '상가주택', '상가건물'],
  land: ['대지', '전', '답', '임야', '잡종지', '과수원'],
  investment: ['수익형', '재건축', '재개발', '분양권', '경매', '급매'],
};

// ─────────────────────────────────────────────────────────────────
// feature 그룹 라벨 (v7 §6 참조)
// ─────────────────────────────────────────────────────────────────
// L-mapfilter1 (2026-04-23): 반려동물/주차/엘리베이터 추가 — 이전엔 상단
//   SmartChips (ResidenceChips) 에서만 토글 가능했고 아코디언에는 누락돼 있어
//   "추가 필터" 가 전 필드 커버리지를 제공하지 못했다. 상단=원터치 프리셋,
//   아코디언=완전한 편의시설 체크박스 로 대칭화.
const AMENITIES = [
  '반려동물', '주차', '엘리베이터',
  'CCTV', '택배함', '경비실', '무인택배', '보안', '헬스장', '카페',
] as const;
const FLOOR_LEVELS = ['저층', '중층', '고층', '반지하', '옥탑'] as const;
const DIRECTIONS = ['남향', '동남향', '동향', '서향', '서남향', '북향'] as const;
const MOVE_IN = ['즉시입주', '1개월 이내', '3개월 이내', '협의가능'] as const;

// feature 리스트 중 N 개가 filter.features 에 존재하는지 카운트
function countFeat(features: string[], list: readonly string[]): number {
  let n = 0;
  for (const f of list) if (features.includes(f)) n += 1;
  return n;
}

// ─────────────────────────────────────────────────────────────────
// 섹션별 활성 카운트 계산 (헤더 배지용)
// ─────────────────────────────────────────────────────────────────
function activeCountFor(filter: FilterState, section: string): number {
  switch (section) {
    case 'price':      return filter.minPrice != null || filter.maxPrice != null ? 1 : 0;
    case 'deposit':    return filter.minDeposit != null || filter.maxDeposit != null ? 1 : 0;
    case 'monthly':    return filter.minMonthly != null || filter.maxMonthly != null ? 1 : 0;
    case 'area':       return filter.minArea != null || filter.maxArea != null ? 1 : 0;
    // L-mapfilter1 (2026-04-23): roomsMore 를 전체 방 수(1/2/3/4+/5+/6+) 로 확장.
    //   상단 ResidenceChips 1/2/3 과 아코디언이 같은 store 필드(rooms) 를 공유해
    //   어느 쪽에서 토글해도 동일하게 반영된다.
    case 'roomsMore':  return filter.rooms.length;
    case 'propTypes':  return filter.propertyTypes.length;
    case 'newBuild':   return filter.newBuildYears != null ? 1 : 0;
    case 'station':    return filter.nearStation != null ? 1 : 0;
    case 'amenities':  return countFeat(filter.features, AMENITIES);
    case 'floorLevel': return countFeat(filter.features, FLOOR_LEVELS);
    case 'direction':  return countFeat(filter.features, DIRECTIONS);
    case 'moveIn':     return countFeat(filter.features, MOVE_IN);
    default:           return 0;
  }
}

// ─────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────
export interface FilterAccordionProps {
  /** 기본 닫힘. 헤더 ± 버튼으로 전체 펼침/접음 */
  showCollapseAll?: boolean;
  /** 특정 섹션만 렌더 (카테고리 맥락 등에서 subset 표시) */
  sections?: string[];
}

const ALL_SECTIONS = [
  'price', 'deposit', 'monthly', 'area',
  'roomsMore', 'propTypes', 'newBuild', 'station',
  'amenities', 'floorLevel', 'direction', 'moveIn',
] as const;

export function FilterAccordion({ showCollapseAll = true, sections }: FilterAccordionProps) {
  const filter = useMap2026Store((s) => s.filter);
  const setFilter = useMap2026Store((s) => s.setFilter);
  const toggleRoom = useMap2026Store((s) => s.toggleRoom);
  const togglePropertyType = useMap2026Store((s) => s.togglePropertyType);
  const toggleFeature = useMap2026Store((s) => s.toggleFeature);
  const accordionOpen = useMap2026Store((s) => s.accordionOpen);
  const setAccordion = useMap2026Store((s) => s.setAccordion);

  const activeList = sections ?? ALL_SECTIONS;
  const openCount = useMemo(
    () => activeList.filter((id) => accordionOpen[id]).length,
    [accordionOpen, activeList]
  );

  const totalActive = useMemo(
    () => activeList.reduce((n, id) => n + activeCountFor(filter, id), 0),
    [filter, activeList]
  );

  const expandAll = () => activeList.forEach((id) => setAccordion(id, true));
  const collapseAll = () => activeList.forEach((id) => setAccordion(id, false));

  const propTypeOptions = PROPERTY_TYPES_BY_CATEGORY[filter.category];

  return (
    <section
      aria-label="12 추가필터"
      className="rounded-xl bg-white ring-1 ring-neutral-200"
    >
      <header className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-neutral-900">추가 필터</h3>
          {totalActive > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-700 px-2 py-0.5 text-[10.5px] font-bold text-white tabular-nums">
              {totalActive} 적용
            </span>
          )}
        </div>
        {showCollapseAll && (
          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={openCount === activeList.length ? collapseAll : expandAll}
              className="rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            >
              {openCount === activeList.length ? '모두 접기' : '모두 펼치기'}
            </button>
          </div>
        )}
      </header>

      <div>
        {/* 1. 가격 (매매가) */}
        {activeList.includes('price') && (
          <Section id="price" Icon={Coins} label="가격 (매매가)" activeCount={activeCountFor(filter, 'price')}>
            <RangeInput
              min={filter.minPrice}
              max={filter.maxPrice}
              onChange={(min, max) => setFilter({ minPrice: min, maxPrice: max })}
              unit="만원"
              placeholderMin="0"
              placeholderMax="제한없음"
              step={1000}
            />
            <p className="mt-1.5 text-[11px] text-neutral-500">* 매매 · 전세 · 단기거래 price 컬럼 기준</p>
          </Section>
        )}

        {/* 2. 보증금 */}
        {activeList.includes('deposit') && (
          <Section id="deposit" Icon={Wallet} label="보증금 / 전세금" activeCount={activeCountFor(filter, 'deposit')}>
            <RangeInput
              min={filter.minDeposit}
              max={filter.maxDeposit}
              onChange={(min, max) => setFilter({ minDeposit: min, maxDeposit: max })}
              unit="만원"
              placeholderMin="0"
              placeholderMax="제한없음"
              step={500}
            />
          </Section>
        )}

        {/* 3. 월세 */}
        {activeList.includes('monthly') && (
          <Section id="monthly" Icon={Banknote} label="월세" activeCount={activeCountFor(filter, 'monthly')}>
            <RangeInput
              min={filter.minMonthly}
              max={filter.maxMonthly}
              onChange={(min, max) => setFilter({ minMonthly: min, maxMonthly: max })}
              unit="만원"
              placeholderMin="0"
              placeholderMax="제한없음"
              step={10}
            />
          </Section>
        )}

        {/* 4. 전용면적 */}
        {activeList.includes('area') && (
          <Section id="area" Icon={Ruler} label="전용면적" activeCount={activeCountFor(filter, 'area')}>
            <RangeInput
              min={filter.minArea}
              max={filter.maxArea}
              onChange={(min, max) => setFilter({ minArea: min, maxArea: max })}
              unit="m²"
              placeholderMin="0"
              placeholderMax="제한없음"
              step={1}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { lo: 0,   hi: 33,  label: '소형 (~10평)' },
                { lo: 33,  hi: 66,  label: '중형 (10~20평)' },
                { lo: 66,  hi: 132, label: '대형 (20~40평)' },
                { lo: 132, hi: null, label: '초대형 (40평~)' },
              ].map((p) => {
                const active =
                  filter.minArea === p.lo &&
                  filter.maxArea === (p.hi ?? null);
                return (
                  <ToggleChip
                    key={p.label}
                    active={active}
                    onClick={() =>
                      active
                        ? setFilter({ minArea: null, maxArea: null })
                        : setFilter({ minArea: p.lo, maxArea: p.hi })
                    }
                  >
                    {p.label}
                  </ToggleChip>
                );
              })}
            </div>
          </Section>
        )}

        {/* 5. 방 수 — 전체 (1/2/3/4+/5+/6+). L-mapfilter1 (2026-04-23): 상단
            ResidenceChips 의 원룸/투룸/쓰리룸 과 동일 store 필드를 공유하므로
            아코디언에서도 접근 가능하도록 확장. 이전엔 4+/5+/6+ 만 노출되어
            "모두 펼치기" 시 1/2/3 을 놓치는 UX 구멍이 있었다. */}
        {activeList.includes('roomsMore') && (
          <Section id="roomsMore" Icon={DoorOpen} label="방 수" activeCount={activeCountFor(filter, 'roomsMore')}>
            <div className="flex flex-wrap gap-1.5">
              {[
                { n: 1, label: '원룸' },
                { n: 2, label: '투룸' },
                { n: 3, label: '쓰리룸' },
                { n: 4, label: '4개 이상' },
                { n: 5, label: '5개 이상' },
                { n: 6, label: '6개 이상' },
              ].map(({ n, label }) => {
                const active = filter.rooms.includes(n);
                return (
                  <ToggleChip key={n} active={active} onClick={() => toggleRoom(n)}>
                    {label}
                  </ToggleChip>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">* 상단 &ldquo;빠른 선택&rdquo; 칩과 같은 필드 — 양쪽 어디서나 선택 가능.</p>
          </Section>
        )}

        {/* 6. 부동산 유형 (카테고리별 옵션) */}
        {activeList.includes('propTypes') && (
          <Section id="propTypes" Icon={Building2} label="부동산 유형" activeCount={activeCountFor(filter, 'propTypes')}>
            <div className="flex flex-wrap gap-1.5">
              {propTypeOptions.map((t) => (
                <ToggleChip
                  key={t}
                  active={filter.propertyTypes.includes(t)}
                  onClick={() => togglePropertyType(t)}
                >
                  {t}
                </ToggleChip>
              ))}
            </div>
          </Section>
        )}

        {/* 7. 신축 연식 */}
        {activeList.includes('newBuild') && (
          <Section id="newBuild" Icon={Sparkles} label="신축 연식" activeCount={activeCountFor(filter, 'newBuild')}>
            <div className="flex flex-wrap gap-1.5">
              {[1, 3, 5, 10].map((y) => {
                const active = filter.newBuildYears === y;
                return (
                  <ToggleChip
                    key={y}
                    active={active}
                    onClick={() =>
                      setFilter({ newBuildYears: active ? null : y })
                    }
                  >
                    {y}년 이내
                  </ToggleChip>
                );
              })}
            </div>
          </Section>
        )}

        {/* 8. 역세권 거리 */}
        {activeList.includes('station') && (
          <Section id="station" Icon={Train} label="역세권 거리" activeCount={activeCountFor(filter, 'station')}>
            <div className="flex flex-wrap gap-1.5">
              {[
                { m: 300,  label: '도보 5분 (300m)' },
                { m: 500,  label: '도보 8분 (500m)' },
                { m: 1000, label: '도보 15분 (1km)' },
              ].map((s) => {
                const active = filter.nearStation === s.m;
                return (
                  <ToggleChip
                    key={s.m}
                    active={active}
                    onClick={() =>
                      setFilter({ nearStation: active ? null : s.m })
                    }
                  >
                    {s.label}
                  </ToggleChip>
                );
              })}
            </div>
          </Section>
        )}

        {/* 9. 편의시설 */}
        {activeList.includes('amenities') && (
          <Section id="amenities" Icon={Wrench} label="편의시설" activeCount={activeCountFor(filter, 'amenities')}>
            <div className="flex flex-wrap gap-1.5">
              {AMENITIES.map((a) => (
                <ToggleChip
                  key={a}
                  active={filter.features.includes(a)}
                  onClick={() => toggleFeature(a)}
                >
                  {a}
                </ToggleChip>
              ))}
            </div>
          </Section>
        )}

        {/* 10. 층수 */}
        {activeList.includes('floorLevel') && (
          <Section id="floorLevel" Icon={Layers3} label="층수" activeCount={activeCountFor(filter, 'floorLevel')}>
            <div className="flex flex-wrap gap-1.5">
              {FLOOR_LEVELS.map((f) => (
                <ToggleChip
                  key={f}
                  active={filter.features.includes(f)}
                  onClick={() => toggleFeature(f)}
                >
                  {f}
                </ToggleChip>
              ))}
            </div>
          </Section>
        )}

        {/* 11. 방향 */}
        {activeList.includes('direction') && (
          <Section id="direction" Icon={Compass} label="방향" activeCount={activeCountFor(filter, 'direction')}>
            <div className="flex flex-wrap gap-1.5">
              {DIRECTIONS.map((d) => (
                <ToggleChip
                  key={d}
                  active={filter.features.includes(d)}
                  onClick={() => toggleFeature(d)}
                >
                  {d}
                </ToggleChip>
              ))}
            </div>
          </Section>
        )}

        {/* 12. 입주 조건 */}
        {activeList.includes('moveIn') && (
          <Section id="moveIn" Icon={CalendarDays} label="입주 가능" activeCount={activeCountFor(filter, 'moveIn')}>
            <div className="flex flex-wrap gap-1.5">
              {MOVE_IN.map((m) => (
                <ToggleChip
                  key={m}
                  active={filter.features.includes(m)}
                  onClick={() => toggleFeature(m)}
                >
                  {m}
                </ToggleChip>
              ))}
            </div>
          </Section>
        )}
      </div>
    </section>
  );
}
