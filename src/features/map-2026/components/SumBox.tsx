// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SumBox — 현재 조건 요약 (v7 §6 통합 패널)
//
// 구조
//   상단  : 총 N개 매물 · [공유] 버튼
//   행    : 거래 / 매물 / 위치 / 가격 / 조건 / 통근 / 입주  (max 7)
//   각행  : [이모지] [라벨] [값] [소스 태그] [clear-X]
//
// 규칙 (v7 미세 거슬림 폴리시 §9)
//   1. 5개 초과 시 "+더보기" 토글 — 접힘 상태에서 5개만 노출
//   2. conflict row(충돌) 는 접힘이어도 top 5 슬롯에 강제 promote
//   3. 소스 태그: 필터/검색/URL — 어디서 설정됐는지 배지 표시
//   4. 공유 버튼 → POST /api/short-url → CopyToast 3-state 표시
//
// 접근성
//   section[aria-label="현재 적용된 검색 조건"]
//   각 clear 버튼: aria-label="{라벨} 해제"
//   토글 버튼: aria-expanded 상태 표시
//
// 성능
//   rows 계산은 useMemo. 공유 버튼 클릭 시에만 fetch.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMemo, useCallback, useRef } from 'react';
import { Share2, ChevronDown, ChevronUp, X, AlertTriangle } from 'lucide-react';
import {
  useMap2026Store,
  COMMERCIAL_PURPOSE_LABEL,
  CATEGORY_THEME,
  type FilterState,
} from '../store';
import { formatKRW } from '../lib/priceFormat';
import { useCopyToast } from './CopyToast';
import { filterToParams } from '../hooks/useFilterUrlSync';

// ─── 행 타입 ────────────────────────────────────────
type SumSource = 'filter' | 'search' | 'url' | 'scope';

interface SumRow {
  id: string;
  emoji: string;
  label: string;
  value: string;
  source: SumSource;
  conflict?: string;   // 충돌 사유(있으면 conflict 스타일 + top 5 promote)
  clear: () => void;
}

// ─── range → 라벨 포맷터 ────────────────────────────
function rangeLabel(
  min: number | null,
  max: number | null,
  fmt: (n: number) => string,
  unit = ''
): string {
  const lo = min != null ? fmt(min) + unit : null;
  const hi = max != null ? fmt(max) + unit : null;
  if (lo && hi) return `${lo} ~ ${hi}`;
  if (lo) return `${lo} 이상`;
  if (hi) return `${hi} 이하`;
  return '';
}

// ─── 충돌 감지 ──────────────────────────────────────
function detectConflicts(filter: FilterState): Map<string, string> {
  const conflicts = new Map<string, string>();

  // 주거 전용 feature 가 비주거에 붙어 있음
  if (filter.category !== 'residence' && filter.features.includes('반려동물')) {
    conflicts.set('feat-반려동물', '주거 카테고리에서만 유효');
  }
  if (filter.category !== 'residence' && filter.rooms.length > 0) {
    conflicts.set('rooms', '주거 카테고리에서만 유효');
  }
  if (filter.category !== 'retail_office' && filter.purposes.length > 0) {
    conflicts.set('purposes', '상가/사무실 카테고리에서만 유효');
  }

  // 전세인데 월세 범위가 있는 경우
  const wantsDeposit = filter.deals.includes('전세') || filter.deals.includes('월세');
  const wantsMonthly = filter.deals.includes('월세') || filter.deals.includes('단기');
  if ((filter.minMonthly != null || filter.maxMonthly != null) && !wantsMonthly && filter.deals.length > 0) {
    conflicts.set('monthly', '월세/단기 거래에서만 유효');
  }
  if ((filter.minDeposit != null || filter.maxDeposit != null) && !wantsDeposit && filter.deals.length > 0) {
    conflicts.set('deposit', '전세/월세 거래에서만 유효');
  }
  if ((filter.minPrice != null || filter.maxPrice != null) && !filter.deals.includes('매매') && filter.deals.length > 0) {
    conflicts.set('price', '매매 거래에서만 유효');
  }

  return conflicts;
}

export interface SumBoxProps {
  /** 총 매물 개수 (기본: store.listings.length) */
  totalCount?: number;
  /** 표시 시작 시 접힘 여부 (기본 false — 펼침) */
  initialCollapsed?: boolean;
  /** 공유 생성 context (기본 'map') */
  shareContext?: 'map' | 'search' | 'admin' | 'other';
  /** 컴팩트 모드 (사이드바용) */
  compact?: boolean;
}

export function SumBox({
  totalCount,
  shareContext = 'map',
  compact = false,
}: SumBoxProps) {
  const filter = useMap2026Store((s) => s.filter);
  const scope = useMap2026Store((s) => s.scope);
  const nlQuery = useMap2026Store((s) => s.nlQuery);
  const sort = useMap2026Store((s) => s.sort);
  const listingsCount = useMap2026Store((s) => s.listings.length);
  const expanded = useMap2026Store((s) => s.sumBoxExpanded);
  const toggleExpanded = useMap2026Store((s) => s.toggleSumBoxExpanded);
  const setFilter = useMap2026Store((s) => s.setFilter);
  const toggleDeal = useMap2026Store((s) => s.toggleDeal);
  const toggleRoom = useMap2026Store((s) => s.toggleRoom);
  const togglePurpose = useMap2026Store((s) => s.togglePurpose);
  const toggleFeature = useMap2026Store((s) => s.toggleFeature);
  const clearFilter = useMap2026Store((s) => s.clearFilter);
  const setNlQuery = useMap2026Store((s) => s.setNlQuery);

  const toast = useCopyToast();

  const total = totalCount ?? listingsCount;
  const theme = CATEGORY_THEME[filter.category];

  // ─── 행 계산 ─────────────────────────────────────
  const { rows, conflictCount } = useMemo(() => {
    const conflicts = detectConflicts(filter);
    const list: SumRow[] = [];

    // 1. 거래
    if (filter.deals.length > 0) {
      list.push({
        id: 'deals',
        emoji: '💳',
        label: '거래',
        value: filter.deals.join(', '),
        source: 'filter',
        clear: () => filter.deals.forEach((d) => toggleDeal(d)),
      });
    }

    // 2. 매물 (propertyTypes + purposes)
    const propLabels: string[] = [...filter.propertyTypes];
    filter.purposes.forEach((p) => propLabels.push(COMMERCIAL_PURPOSE_LABEL[p]?.label ?? p));
    if (propLabels.length > 0) {
      list.push({
        id: 'types',
        emoji: '🏘️',
        label: '매물',
        value: propLabels.join(', '),
        source: 'filter',
        conflict: conflicts.get('purposes'),
        clear: () => {
          setFilter({ propertyTypes: [] });
          filter.purposes.forEach((p) => togglePurpose(p));
        },
      });
    }

    // 방 개수
    if (filter.rooms.length > 0) {
      list.push({
        id: 'rooms',
        emoji: '🚪',
        label: '방',
        value: filter.rooms
          .map((n) => (n === 1 ? '원룸' : n === 2 ? '투룸' : n >= 3 ? '쓰리룸+' : `${n}룸`))
          .join(', '),
        source: 'filter',
        conflict: conflicts.get('rooms'),
        clear: () => filter.rooms.forEach((n) => toggleRoom(n)),
      });
    }

    // 3. 위치 (역 도보)
    if (filter.nearStation != null) {
      const min = Math.round(filter.nearStation / 60);
      list.push({
        id: 'station',
        emoji: '🚇',
        label: '위치',
        value: `역 도보 ${min}분`,
        source: 'filter',
        clear: () => setFilter({ nearStation: null }),
      });
    }

    // 4. 가격 (deal 종류별)
    const priceLabel = rangeLabel(filter.minPrice, filter.maxPrice, formatKRW);
    if (priceLabel) {
      list.push({
        id: 'price',
        emoji: '💰',
        label: '매매',
        value: priceLabel,
        source: 'filter',
        conflict: conflicts.get('price'),
        clear: () => setFilter({ minPrice: null, maxPrice: null }),
      });
    }
    const depositLabel = rangeLabel(filter.minDeposit, filter.maxDeposit, formatKRW);
    if (depositLabel) {
      list.push({
        id: 'deposit',
        emoji: '🔑',
        label: '보증금',
        value: depositLabel,
        source: 'filter',
        conflict: conflicts.get('deposit'),
        clear: () => setFilter({ minDeposit: null, maxDeposit: null }),
      });
    }
    const monthlyLabel = rangeLabel(filter.minMonthly, filter.maxMonthly, (n) => String(n), '만');
    if (monthlyLabel) {
      list.push({
        id: 'monthly',
        emoji: '📅',
        label: '월세',
        value: monthlyLabel,
        source: 'filter',
        conflict: conflicts.get('monthly'),
        clear: () => setFilter({ minMonthly: null, maxMonthly: null }),
      });
    }

    // 5. 면적
    const areaLabel = rangeLabel(filter.minArea, filter.maxArea, (n) => String(n), 'm²');
    if (areaLabel) {
      list.push({
        id: 'area',
        emoji: '📐',
        label: '면적',
        value: areaLabel,
        source: 'filter',
        clear: () => setFilter({ minArea: null, maxArea: null }),
      });
    }

    // 6. 신축
    if (filter.newBuildYears != null) {
      list.push({
        id: 'newbuild',
        emoji: '🏗️',
        label: '입주',
        value: `${filter.newBuildYears}년 이내 신축`,
        source: 'filter',
        clear: () => setFilter({ newBuildYears: null }),
      });
    }

    // 7. 조건 (features)
    filter.features.forEach((f) =>
      list.push({
        id: `feat-${f}`,
        emoji: '✨',
        label: '조건',
        value: f,
        source: 'filter',
        conflict: conflicts.get(`feat-${f}`),
        clear: () => toggleFeature(f),
      })
    );

    // 8. 사진 필수
    if (filter.hasImages) {
      list.push({
        id: 'photos',
        emoji: '📷',
        label: '조건',
        value: '사진 있음',
        source: 'filter',
        clear: () => setFilter({ hasImages: false }),
      });
    }

    // 9. 자연어 검색 (있으면 최상단)
    if (nlQuery.trim()) {
      list.unshift({
        id: 'nlq',
        emoji: '🔍',
        label: '검색',
        value: `"${nlQuery.trim()}"`,
        source: 'search',
        clear: () => setNlQuery(''),
      });
    }

    const cc = list.filter((r) => r.conflict).length;
    return { rows: list, conflictCount: cc };
  }, [
    filter,
    nlQuery,
    setFilter,
    toggleDeal,
    toggleRoom,
    togglePurpose,
    toggleFeature,
    setNlQuery,
  ]);

  // ─── 접힘 규칙: conflict 행 최우선 top 5 promote ──
  const visibleRows = useMemo(() => {
    if (expanded || rows.length <= 5) return rows;
    const conflicts = rows.filter((r) => r.conflict);
    const rest = rows.filter((r) => !r.conflict);
    const top = [...conflicts, ...rest].slice(0, 5);
    // 원래 순서 유지
    const allowed = new Set(top.map((r) => r.id));
    return rows.filter((r) => allowed.has(r.id));
  }, [rows, expanded]);

  // ─── 공유 핸들러 ─────────────────────────────────
  const inFlightRef = useRef(false);
  const onShare = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    toast.show({ state: 'loading' });
    try {
      const sp = filterToParams(filter, { sort, nlQuery });
      const qs = sp.toString();
      const targetUrl = qs ? `/map?${qs}` : '/map';

      const resp = await fetch('/api/short-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target_url: targetUrl,
          context: shareContext,
          scope: scope === 'mine' ? 'mine' : 'all',
        }),
      });
      const json = (await resp.json()) as {
        success: boolean;
        short_url?: string;
        error?: string;
      };

      if (!resp.ok || !json.success || !json.short_url) {
        throw new Error(json.error ?? `HTTP ${resp.status}`);
      }

      // 클립보드 복사
      const urlWithScheme = `https://${json.short_url}`;
      try {
        await navigator.clipboard.writeText(urlWithScheme);
      } catch {
        // 폴백: execCommand
        const textarea = document.createElement('textarea');
        textarea.value = urlWithScheme;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
        } finally {
          document.body.removeChild(textarea);
        }
      }

      toast.show({ state: 'success', shortUrl: json.short_url });
    } catch (err) {
      console.warn('[SumBox] share failed:', err);
      toast.show({
        state: 'error',
        message: '단축 URL 생성 실패',
        onRetry: onShare,
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [filter, sort, nlQuery, scope, shareContext, toast]);

  // ─── 렌더 ────────────────────────────────────────
  if (rows.length === 0) return null;

  const hiddenCount = rows.length - visibleRows.length;

  return (
    <section
      aria-label="현재 적용된 검색 조건"
      className={[
        'flex flex-col gap-2 rounded-xl border bg-white',
        compact ? 'p-3' : 'p-4',
        theme.ring,
        'ring-1',
      ].join(' ')}
    >
      {/* 헤더 — 총 N개 + 공유 */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {theme.emoji} {theme.label} · 현재 조건
          </span>
          {scope === 'mine' && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              내 매물
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-[12px] font-bold text-neutral-900">
            {total.toLocaleString('ko-KR')}개
          </span>
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-1 rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            aria-label="현재 조건 공유 (단축 URL 생성)"
          >
            <Share2 className="size-3" aria-hidden="true" />
            공유
          </button>
        </div>
      </header>

      {conflictCount > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span>
            <b>{conflictCount}개 조건이 현재 카테고리와 충돌</b> — 아래 노란 표시를 확인하세요.
          </span>
        </div>
      )}

      {/* 행 리스트 */}
      <ul className="flex flex-col gap-1">
        {visibleRows.map((r) => (
          <li
            key={r.id}
            className={[
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]',
              r.conflict
                ? 'bg-amber-50 ring-1 ring-amber-200'
                : 'bg-neutral-50 hover:bg-neutral-100',
            ].join(' ')}
          >
            <span className="shrink-0 text-[13px]" aria-hidden="true">
              {r.emoji}
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-neutral-500">
              {r.label}
            </span>
            <span className="flex-1 truncate font-medium text-neutral-900">
              {r.value}
            </span>
            <span
              className={[
                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                r.source === 'filter'
                  ? 'bg-neutral-200 text-neutral-700'
                  : r.source === 'search'
                  ? 'bg-blue-100 text-blue-700'
                  : r.source === 'url'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-amber-100 text-amber-700',
              ].join(' ')}
              title={`출처: ${r.source}`}
            >
              {r.source}
            </span>
            {r.conflict && (
              <span
                className="shrink-0 text-[10px] font-medium text-amber-700"
                title={r.conflict}
              >
                ⚠ 충돌
              </span>
            )}
            <button
              type="button"
              onClick={r.clear}
              aria-label={`${r.label} ${r.value} 해제`}
              className="shrink-0 rounded-full p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-500"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {/* 더보기/접기 + 전체 초기화 */}
      <footer className="flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px]">
        {rows.length > 5 ? (
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            className="flex items-center gap-1 font-medium text-neutral-600 hover:text-neutral-900"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3" aria-hidden="true" />
                접기
              </>
            ) : (
              <>
                <ChevronDown className="size-3" aria-hidden="true" />
                +{hiddenCount}개 더 보기
              </>
            )}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => {
            clearFilter();
            setNlQuery('');
          }}
          className="font-medium text-neutral-500 hover:text-red-700"
        >
          전체 초기화
        </button>
      </footer>
    </section>
  );
}
