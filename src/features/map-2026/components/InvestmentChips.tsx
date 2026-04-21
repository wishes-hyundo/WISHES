// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// InvestmentChips — 💰 투자 탭 전용 칩
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 수익형 부동산 투자자 관점: 수익률·공실률·승계·리모델링 가능성.
// 테마: violet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { TrendingUp, AlertTriangle, FileSignature, Wrench } from 'lucide-react';
import { useMap2026Store } from '../store';

const YIELD_THRESHOLDS = [
  { value: 4, label: '4%↑' },
  { value: 5, label: '5%↑' },
  { value: 6, label: '6%↑' },
  { value: 7, label: '7%↑' },
] as const;

export function InvestmentChips() {
  const filter = useMap2026Store((s) => s.filter);
  const toggleFeature = useMap2026Store((s) => s.toggleFeature);

  const hasLowVacancy = filter.features.includes('공실률낮음');
  const hasLeaseTransfer = filter.features.includes('임대차승계');
  const hasRemodelable = filter.features.includes('리모델링가능');

  // 수익률 하한선은 features 에 "수익률N+" 형태로 저장 (단일 선택)
  const activeYield = filter.features.find((f) => f.startsWith('수익률'));

  return (
    <div className="flex flex-col gap-2">
      {/* Row A — 수익률 임계값 (단일 선택) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-neutral-500">
          <TrendingUp className="size-3" />
          수익률
        </span>
        {YIELD_THRESHOLDS.map(({ value, label }) => {
          const key = `수익률${value}+`;
          const active = activeYield === key;
          return (
            <button
              key={value}
              onClick={() => {
                // 기존 수익률 태그 제거 후 새로 추가 (단일 선택 보장)
                if (activeYield) toggleFeature(activeYield);
                if (!active) toggleFeature(key);
              }}
              className={yieldChipClass(active)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Row B — 투자 특화 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => toggleFeature('공실률낮음')}
          className={chipClass(hasLowVacancy)}
          title="공실률 10% 미만"
        >
          <AlertTriangle className="size-3.5" />
          공실률↓
        </button>

        <button
          onClick={() => toggleFeature('임대차승계')}
          className={chipClass(hasLeaseTransfer)}
          title="기존 임차인 승계 가능"
        >
          <FileSignature className="size-3.5" />
          임대차승계
        </button>

        <button
          onClick={() => toggleFeature('리모델링가능')}
          className={chipClass(hasRemodelable)}
          title="리모델링·증축 가능"
        >
          <Wrench className="size-3.5" />
          리모델링
        </button>
      </div>
    </div>
  );
}

function yieldChipClass(active: boolean): string {
  return [
    'flex items-center rounded-full px-3 py-1.5 text-[12.5px] font-semibold tabular-nums transition',
    active
      ? 'bg-violet-600 text-white shadow-sm'
      : 'bg-violet-50 text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100',
  ].join(' ');
}

function chipClass(active: boolean): string {
  return [
    'flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] transition',
    active
      ? 'bg-violet-600 text-white shadow-sm'
      : 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100',
  ].join(' ');
}
