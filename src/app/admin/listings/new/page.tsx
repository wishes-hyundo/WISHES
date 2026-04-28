/**
 * /admin/listings/new — 폐기 (2026-04-28)
 *
 * 사장님 정책: 매물 등록은 /search 중개사포털로 통합.
 * 이 라우트는 /search 로 redirect 후 자동 매물등록 모달 트리거.
 */
import { redirect } from 'next/navigation';

export default function DeprecatedListingNewPage() {
  redirect('/search?action=new-listing');
}
