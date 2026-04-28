'use client';

/**
 * /new — 매물 등록 진입점 (사장님 명령 2026-04-28)
 * wishes.co.kr/new 짧은 URL → 기존 admin/listings/new 등록 폼 재사용
 */
import ListingNewPage from '../admin/listings/new/page';

export default function NewListingPage() {
  return <ListingNewPage />;
}
