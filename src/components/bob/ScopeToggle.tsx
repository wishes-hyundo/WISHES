'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-bob-A (2026-04-28): ScopeToggle — 내 매물 / 전체 매물 토글
//   옛날 content-v294-scope.js 재현
//   기본: 내 매물 (created_by = 현재 사용자)
//   토글 시: 전체 매물
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import * as React from 'react';
import { User, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Scope = 'mine' | 'all';

export interface ScopeToggleProps {
  value: Scope;
  onChange: (scope: Scope) => void;
  className?: string;
  myCount?: number;
  allCount?: number;
}

export function ScopeToggle({ value, onChange, className, myCount, allCount }: ScopeToggleProps) {
  return (
    <div className={cn('inline-flex bg-wishes-cream rounded-full p-1', className)}>
      <button
        type="button"
        onClick={() => onChange('mine')}
        className={cn(
          'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors',
          value === 'mine'
            ? 'bg-wishes-primary text-white shadow-soft'
            : 'text-wishes-muted hover:text-wishes-text'
        )}
        aria-pressed={value === 'mine'}
      >
        <User className="h-3.5 w-3.5" />
        내 매물
        {typeof myCount === 'number' && (
          <span className={cn('text-[10px] px-1 py-0.5 rounded', value === 'mine' ? 'bg-white/20' : 'bg-wishes-border/50')}>
            {myCount.toLocaleString()}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => onChange('all')}
        className={cn(
          'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors',
          value === 'all'
            ? 'bg-wishes-primary text-white shadow-soft'
            : 'text-wishes-muted hover:text-wishes-text'
        )}
        aria-pressed={value === 'all'}
      >
        <Globe className="h-3.5 w-3.5" />
        전체
        {typeof allCount === 'number' && (
          <span className={cn('text-[10px] px-1 py-0.5 rounded', value === 'all' ? 'bg-white/20' : 'bg-wishes-border/50')}>
            {allCount.toLocaleString()}
          </span>
        )}
      </button>
    </div>
  );
}
