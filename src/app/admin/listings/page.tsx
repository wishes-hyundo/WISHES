// /admin/listings → /search 통합 redirect (2026-04-27 v3 세션)
// 사용자 명시: "admin/listings 도 /search 로 통합"
// 매물 목록/검색/편집/등록 모두 /search 의 content.js 에 이미 구현됨
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdminListingsRedirect() {
  redirect('/search');
}
