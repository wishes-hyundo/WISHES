/**
 * /new — 매물 등록 (Tier 4, 2026-04-28)
 *
 * 사장님 정책: 등록은 짧은 URL /new 에 통합. /admin/listings/new 는 여기로
 * redirect. /search 는 편집만, 등록 시 [+ 매물등록] 버튼은 /new 로 이동.
 *
 * admin/listings/new/page.tsx 의 풀 폼 component 재사용.
 */
import ListingNewPage from '../admin/listings/new/page';

export default function NewListingPage() {
  return <ListingNewPage />;
}
