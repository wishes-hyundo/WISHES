// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PreconditionNote — 선결조건 노트 (v7 §9 폴리시)
//
// 목적
//   /admin 대시보드 상단에 "아직 해결되지 않은 선결조건" 배지를 렌더.
//   3가지 기본 에러 (POST /api/listings 500, GET /api/admin/stats 504,
//   DELETE /api/listings/duplicates 400) 를 가시화하여 중개인이
//   "왜 대시보드가 비정상인가?" 를 즉시 알 수 있음.
//
// UX
//   - 24h dismiss (store.precondDismissedAt, localStorage 영속)
//   - 각 항목에 상태 뱃지 (500/504/400/fixed) + 간략 설명 + 자세히 링크
//   - 실제 헬스체크 (optional): /api/_diagnostic 이 있으면 실시간 확인
//
// 접근성
//   role="status" aria-live="polite"
//   ✕ 버튼 aria-label="선결조건 노트 24시간 숨기기"
//
// 사용법
//   <PreconditionNote />  // 자동으로 store.precondDismissedAt 체크
//
// 직접 props 로 override:
//   <PreconditionNote items={[{ id, severity, title, detail }]} />
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { useMap2026Store } from '../store';

export interface PreconditionItem {
  id: string;
  severity: 'error' | 'warn' | 'info';
  code?: string | number;      // HTTP status 또는 에러 코드
  title: string;
  detail?: string;
  href?: string;               // 자세히 링크
}

// L-v7-p2 (2026-04-22): 3건 모두 서버측 수정 완료.
//   - POST /api/admin/listings 500 → created_by 컬럼 신설 + JWT UID 기록
//   - GET /api/admin/stats 504 → 개별 쿼리 타임아웃 + partial 폴백 (항상 200)
//   - DELETE /api/admin/dedup/cleanup 400/405 → DELETE 핸들러 alias 추가
//   아래 목록은 '직전 배포 이전' 잔류 건을 info 로 표시. 실시간 헬스체크는
//   /api/_diagnostic 이 있으면 그쪽이 override.
export const DEFAULT_PRECOND_ITEMS: PreconditionItem[] = [
  {
    id: 'listings-create-500',
    severity: 'info',
    code: 'fixed',
    title: '매물 등록 API 500 → 수정',
    detail: 'POST /api/admin/listings — L-v7-p2 에서 created_by 연결 + 에러 가시화',
    href: '/admin/listings',
  },
  {
    id: 'admin-stats-504',
    severity: 'info',
    code: 'fixed',
    title: '관리자 통계 504 → 완화',
    detail: 'GET /api/admin/stats — 개별 4초 타임아웃 + partial 폴백 (500 → 200 partial)',
    href: '/api/admin/stats',
  },
  {
    id: 'dedup-delete-400',
    severity: 'info',
    code: 'fixed',
    title: '중복 제거 DELETE → 수정',
    detail: 'DELETE /api/admin/dedup/cleanup — L-v7-p2 에서 DELETE 메소드 alias 추가',
    href: '/admin/dedup',
  },
];

// dismiss 유효 시간: 24시간
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

export interface PreconditionNoteProps {
  items?: PreconditionItem[];
  /** dismiss 무시하고 항상 표시 (디버그용) */
  forceShow?: boolean;
}

export function PreconditionNote({
  items = DEFAULT_PRECOND_ITEMS,
  forceShow = false,
}: PreconditionNoteProps) {
  const dismissedAt = useMap2026Store((s) => s.precondDismissedAt);
  const dismissPrecond = useMap2026Store((s) => s.dismissPrecond);

  if (items.length === 0) return null;

  if (!forceShow && dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) {
    return null;
  }

  const worstSeverity: PreconditionItem['severity'] = items.some((i) => i.severity === 'error')
    ? 'error'
    : items.some((i) => i.severity === 'warn')
    ? 'warn'
    : 'info';

  const toneBg =
    worstSeverity === 'error'
      ? 'bg-red-50 ring-red-200'
      : worstSeverity === 'warn'
      ? 'bg-amber-50 ring-amber-200'
      : 'bg-blue-50 ring-blue-200';
  const toneText =
    worstSeverity === 'error'
      ? 'text-red-800'
      : worstSeverity === 'warn'
      ? 'text-amber-800'
      : 'text-blue-800';
  const toneIcon =
    worstSeverity === 'error'
      ? 'text-red-700'
      : worstSeverity === 'warn'
      ? 'text-amber-700'
      : 'text-blue-700';

  return (
    <section
      role="status"
      aria-live="polite"
      className={`flex flex-col gap-2 rounded-xl px-4 py-3 ring-1 ${toneBg}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className={`flex items-center gap-2 ${toneText}`}>
          <AlertTriangle className={`size-4 ${toneIcon}`} aria-hidden="true" />
          <h2 className="text-[13px] font-bold">선결조건 {items.length}건 미해결</h2>
        </div>
        <button
          type="button"
          onClick={dismissPrecond}
          aria-label="선결조건 노트 24시간 숨기기"
          className={`rounded-full p-1 ${toneText} opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current`}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </header>

      <ul className="flex flex-col gap-1.5">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-start gap-2 rounded-md bg-white/60 px-2 py-1.5 text-[12px]"
          >
            {it.code !== undefined && (
              <span
                className={[
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                  it.severity === 'error'
                    ? 'bg-red-700 text-white'
                    : it.severity === 'warn'
                    ? 'bg-amber-700 text-white'
                    : 'bg-blue-700 text-white',
                ].join(' ')}
              >
                {String(it.code)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-neutral-900">{it.title}</div>
              {it.detail && (
                <div className="mt-0.5 text-[11px] text-neutral-600">{it.detail}</div>
              )}
            </div>
            {it.href && (
              <a
                href={it.href}
                className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-semibold text-neutral-700 hover:text-neutral-900 underline-offset-2 hover:underline"
              >
                자세히
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
