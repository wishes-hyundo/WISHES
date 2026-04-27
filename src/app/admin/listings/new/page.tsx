// /admin/listings/new → /search 통합 redirect (2026-04-27 v3 세션)
// 새 매물 등록 = /search content.js 의 "+ 매물등록" 버튼 사용
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdminListingsNewRedirect() {
  redirect('/search');
}
