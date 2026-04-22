// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CopyToast — 단축 URL 복사 토스트 (v7 §9 폴리시)
//
// 3-state: loading / success / error
//   loading : "단축 URL 만드는 중..."   (스피너, 비고정 2.5s)
//   success : "✓ 복사됨: wishes.me/xxx" (2초 자동 소멸, dismiss 버튼 제공)
//   error   : "복사 실패 — 다시 시도"    (6초 자동 소멸, 재시도 action)
//
// 접근성
//   role="status", aria-live="polite" (토스트 표준).
//   키보드: Esc → dismiss. 버튼 포커스 시 outline 명시.
//
// 사용법
//   const toast = useCopyToast();
//   toast.show({ state: 'loading' });
//   toast.show({ state: 'success', shortUrl: 'wishes.me/abc123' });
//   toast.show({ state: 'error', onRetry: () => ... });
//
// 렌더링은 <CopyToastOutlet /> 를 페이지 루트에 1회 배치.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { create } from 'zustand';
import { useEffect } from 'react';
import { Check, Loader2, AlertTriangle, X } from 'lucide-react';

type ToastState =
  | { state: 'loading' }
  | { state: 'success'; shortUrl: string }
  | { state: 'error'; message?: string; onRetry?: () => void };

interface ToastMsg {
  id: number;
  payload: ToastState;
  autoHideMs: number;
}

interface CopyToastStore {
  current: ToastMsg | null;
  seq: number;
  show: (payload: ToastState, autoHideMs?: number) => number;
  dismiss: () => void;
}

const useCopyToastStore = create<CopyToastStore>((set, get) => ({
  current: null,
  seq: 0,
  show: (payload, autoHideMs) => {
    const defaults =
      payload.state === 'loading' ? 2500 : payload.state === 'success' ? 2000 : 6000;
    const id = get().seq + 1;
    set({
      seq: id,
      current: { id, payload, autoHideMs: autoHideMs ?? defaults },
    });
    return id;
  },
  dismiss: () => set({ current: null }),
}));

/** Public hook — 임의의 컴포넌트에서 토스트 제어 */
export function useCopyToast() {
  const show = useCopyToastStore((s) => s.show);
  const dismiss = useCopyToastStore((s) => s.dismiss);
  return { show, dismiss };
}

/** 페이지 루트에 1회 마운트. 토스트 UI 출력 담당. */
export function CopyToastOutlet() {
  const current = useCopyToastStore((s) => s.current);
  const dismiss = useCopyToastStore((s) => s.dismiss);

  // 자동 소멸 타이머
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(dismiss, current.autoHideMs);
    return () => clearTimeout(t);
  }, [current, dismiss]);

  // Esc → dismiss
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, dismiss]);

  if (!current) return null;
  const { payload } = current;

  const tone =
    payload.state === 'success'
      ? 'bg-emerald-700 text-white'
      : payload.state === 'error'
      ? 'bg-red-700 text-white'
      : 'bg-neutral-900 text-white';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex justify-center px-4"
    >
      <div
        className={[
          'pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-full px-4 py-2.5 text-[13px] font-medium shadow-lg ring-1 ring-black/5',
          'transition-all duration-200',
          tone,
        ].join(' ')}
      >
        {payload.state === 'loading' && (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>단축 URL 만드는 중…</span>
          </>
        )}

        {payload.state === 'success' && (
          <>
            <Check className="size-4 text-emerald-200" aria-hidden="true" />
            <span className="tabular-nums">
              ✓ 복사됨: <span className="font-bold">{payload.shortUrl}</span>
            </span>
            <button
              type="button"
              onClick={dismiss}
              aria-label="토스트 닫기"
              className="ml-1 rounded-full p-0.5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="size-3.5" />
            </button>
          </>
        )}

        {payload.state === 'error' && (
          <>
            <AlertTriangle className="size-4 text-amber-200" aria-hidden="true" />
            <span>{payload.message ?? '복사 실패 — 다시 시도'}</span>
            {payload.onRetry && (
              <button
                type="button"
                onClick={() => {
                  payload.onRetry?.();
                  dismiss();
                }}
                className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                재시도
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              aria-label="토스트 닫기"
              className="ml-1 rounded-full p-0.5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
