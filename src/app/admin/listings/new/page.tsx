import { redirect } from 'next/navigation';

/**
 * L-route-rename (2026-04-29): /admin/listings/new → /new redirect
 * 사장님 명령: 짧은 URL 만 사용 (헷갈림 방지).
 * admin 사이드바 / dashboard / listings 페이지 모든 링크는 /new 로 update 됨.
 * 외부 북마크 / 옛 링크 호환을 위해 301 redirect 유지.
 */
export default function AdminListingNewRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Next.js 15+ 비동기 searchParams — 실제 사용은 redirect 만, await 안 해도 무방.
  void searchParams;
  redirect('/new');
}
