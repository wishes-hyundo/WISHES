/**
 * /auth/callback — 서버 컴포넌트 래퍼
 *
 * Next.js 15 의 정적 prerender 가 `useSearchParams()` 를 쓰는 클라이언트 컴포넌트를
 * 빌드 시점에 export 하려다 실패(`prerender-error`)하던 문제를 해결하기 위해
 * 이 경로 전체를 동적 렌더링으로 강제한다.
 *
 *  - `export const dynamic = 'force-dynamic'` 는 서버 컴포넌트에서만 유효하므로
 *    실제 UI 로직(`useSearchParams`, `useAuth` 등)은 ./client.tsx 로 분리했다.
 *  - 서버 래퍼는 최소한의 역할(설정 + 클라이언트 컴포넌트 마운트)만 한다.
 */

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import AuthCallbackClient from './client';

export default function AuthCallbackPage() {
  return <AuthCallbackClient />;
}
