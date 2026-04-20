// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// viewTransition — View Transitions API 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 지원 안 되는 브라우저(Firefox ESR 등)에서는 콜백을 즉시 실행 → 무해한 폴백.

export function withViewTransition(update: () => void): void {
  if (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    typeof (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition === 'function'
  ) {
    (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(update);
  } else {
    update();
  }
}
