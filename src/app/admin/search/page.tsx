// /admin/search → /search 통합 redirect (2026-04-27 v3 세션)
// 사용자 명시: "admin/search 는 필요 없어. 모두 /search 로 통합"
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdminSearchRedirect() {
  redirect('/search');
}
