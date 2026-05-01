// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// withTimeout — Promise/PromiseLike 타임아웃 래퍼 (단일 출처)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 왜 PromiseLike?
//   Supabase PostgrestBuilder 는 thenable 이지만 Promise 는 아님 (구조적으로
//   then 만 구현). 표준 Promise 만 받는 시그니처는 tsc 에러를 유발하므로
//   PromiseLike<T> 로 받는다. 내부에서 Promise.resolve() 로 정규화.
//
// L-ts1 / L-sec170 후속 (2026-05-02, PR-S4-B P2-3):
//   기존엔 5개 위치(cache.ts, auth/me, login/page, map/page, adminAuth.ts)에
//   각각 inline withTimeout 이 다른 시그니처/에러메시지로 존재. 이를 단일
//   모듈로 통합하여 일관된 타임아웃 처리와 후속 관측·튜닝(예: Sentry tag)
//   포인트 단일화.
//
// 사용:
//   import { withTimeout } from '@/lib/withTimeout';
//   const data = await withTimeout(supabase.auth.getUser(token), 3000);
//   const data = await withTimeout(fetcher(), 5000, 'cache-timeout');
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * promise 가 ms 안에 settled 되지 않으면 Error(label) 로 reject.
 *
 * @param promise PromiseLike — Supabase PostgrestBuilder, fetch 등 thenable 모두 허용
 * @param ms 타임아웃(밀리초)
 * @param label reject 시 Error.message (기본 'timeout')
 */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string = 'timeout',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
