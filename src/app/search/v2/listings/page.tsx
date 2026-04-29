// /search/v2/listings — BoB Phase 1
// React Server Component: 매물 데이터 server-side fetch + ListingTable client component 에 전달
//
// SOTA 패턴: Next.js 16 RSC + Suspense + Streaming
// 12,000+ 매물 = TanStack Virtual 가상 스크롤
// 옛날 가게 (/search) 와 병행 (Strangler Fig)

import { Suspense } from 'react';
import { createServerClient } from '@/lib/supabase';
import { ListingTable, type Listing } from '@/components/search-v2/ListingTable';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

async function fetchListings(): Promise<Listing[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('listings')
      .select(
        'id, type, deal, status, dong, gu, address, building_name, deposit, monthly, price, area_m2, floor_current, floor_total, rooms, bathrooms, built_year, updated_at'
      )
      .in('status', ['공개', '비공개', '계약중', '계약완료'])
      .order('updated_at', { ascending: false })
      .limit(15000); // 12,115 + 여유

    if (error) {
      console.error('[search/v2/listings] fetch error:', error);
      return [];
    }
    return (data as Listing[]) || [];
  } catch (e) {
    console.error('[search/v2/listings] exception:', e);
    return [];
  }
}

async function ListingsContent() {
  const listings = await fetchListings();
  return <ListingTable data={listings} />;
}

export default function ListingsPage() {
  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-foreground">매물 관리</h1>
          <Badge variant="success">v2 BoB</Badge>
          <Badge variant="outline" className="text-xs">
            TanStack Table + Virtual
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          전체 매물 — 가상 스크롤로 12,000+ 매물도 즉시 표시. 검색·정렬은 즉시 반응.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
            매물 불러오는 중...
          </div>
        }
      >
        <ListingsContent />
      </Suspense>

      <div className="mt-6 rounded-lg border bg-amber-50 border-amber-200 p-4 text-xs text-amber-800">
        <strong>Phase 1 진행 중:</strong> 현재 매물 조회만 가능. 매물 수정/등록은 옛날 가게 (
        <a href="/search" className="underline">/search</a>) 또는 관리자 (
        <a href="/admin/listings" className="underline">/admin/listings</a>) 사용. Phase 2 에서 모두
        v2 통합.
      </div>
    </div>
  );
}
