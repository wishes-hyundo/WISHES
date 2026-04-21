import type { Metadata } from 'next';
import { Suspense } from 'react';
import { createServerClient } from '@/lib/supabase';
import { cached } from '@/lib/cache';
import { applyImagePolicy } from '@/lib/image-policy';
import ListingsClient from './ListingsClient';
import ListingsLoading from './loading';

// M4 (2026-04-21, 교정판): SSR 페이로드 다이어트 + Suspense 스트리밍
//   1. force-dynamic 제거 — 기본 동적(searchParams) 라우팅은 유지되지만 Vercel 이
//      set-cookie/auth 가 없는 응답은 엣지에서 단기 캐시 가능.
//   2. SELECT 슬림화 — ListingCard + displayTitle + formatFloor + pickFeatureChip
//      이 실제 소비하는 필드로 한정. `*` 대비 address/address_detail/bathrooms/
//      ai_description/views/status/기타 DB 전용 필드 제거.
//      ※ 초기 M4 안(15 필드)은 ai_title/title/building_name/station_*/floor_*/
//         features/description/rooms/built_year/direction/balcony 까지 없애서
//         카드 타이틀이 "동 + 유형" 폴백으로만 생성되는 UX 후퇴가 있었다.
//         (AI 마케팅 카피, 건물명, 역세권 분수 표시, 층수 모두 사라짐)
//         이번 교정판은 그 필드들을 복구해 타이틀 품질 + 훅 + 층수를 유지.
//      (상세 페이지 /listings/[id] 는 여전히 별도 풀-필드 쿼리 유지)
//   3. 데이터 페치를 Suspense-wrapped 자식 async 컴포넌트로 분리 — Next.js 가
//      쉘(Layout + 스켈레톤) 을 즉시 스트리밍 시작하고 데이터 도착 시 replace.

type SearchParams = { [key: string]: string | string[] | undefined };

export const metadata: Metadata = {
  title: '매물검색 - 서울·경기 전세 월세 매매',
  description: '서울·경기 전 지역 원룸, 투룸, 오피스텔, 아파트, 상가 매물을 검색하세요. 전세, 월세, 매매 매물을 지역별로 필터링하여 찾아보세요.',
  alternates: {
    canonical: 'https://wishes.co.kr/listings',
  },
  openGraph: {
    title: '매물검색 - WISHES',
    description: '서울·경기 부동산 매물을 쉽게 검색하세요.',
    url: 'https://wishes.co.kr/listings',
  },
};

// Suspense 경계 내부에서 실행되는 데이터 컴포넌트
async function ListingsData({ params }: { params: SearchParams }) {
  const deal = (params.deal as string) || '';
  const type = (params.type as string) || '';
  const dong = (params.dong as string) || '';
  const sort = (params.sort as string) || 'latest';
  const page = parseInt((params.page as string) || '1', 10);
  const pageSize = 12;

  // v3: 교정판 슬림 SELECT 로 캐시 키 승격 (v2 캐시는 누락 필드 때문에 카드
  //      타이틀이 엉성하게 렌더되므로 구버전 응답을 재사용하면 안 됨)
  const cacheKey = `ssr-listings-v3:${deal}:${type}:${dong}:${sort}:${page}`;

  const result = await cached(
    cacheKey,
    async () => {
      const supabase = createServerClient();
      const offset = (page - 1) * pageSize;

      // M4 (교정판): 카드 렌더 + displayTitle + formatFloor + hook 수집이 실제
      // 참조하는 필드 전부. 드롭되는 건 address, address_detail, bathrooms,
      // ai_description, views, status, 그리고 SELECT *에서만 나오는 DB 운영용
      // 필드(updated_at, status_changed_at, approval_*, crawled_* 등).
      let query = supabase
        .from('listings')
        .select(
          [
            // 핵심 식별 + 가격
            'id', 'deal', 'type', 'dong',
            'deposit', 'monthly', 'price',
            // 면적/층수 (displayTitle · formatFloor)
            'area_m2', 'area_pyeong',
            'floor_current', 'floor_total',
            // 훅/피처 칩 (pickFeatureChip · collectHooks)
            'parking', 'elevator', 'full_option', 'pet', 'balcony',
            'built_year', 'direction',
            // 타이틀 소스 우선순위 1~3 (ai_title → title → building_name)
            'ai_title', 'title', 'building_name',
            // 타이틀 서브 경로 (역세권, 방 개수, 텍스트 기반 훅)
            'rooms', 'station_name', 'station_distance',
            'features', 'description',
            // 메타
            'source_site', 'created_at',
            // 이미지 조인
            'listing_images(url, sort_order)',
          ].join(', '),
          { count: 'exact' }
        )
        .eq('status', '공개');

      if (deal) query = query.eq('deal', deal);
      if (type) {
        const safe = type.replace(/[,()]/g, '');
        query = query.or(`type.eq.${safe},type.ilike.%${safe}%`);
      }
      if (dong) query = query.eq('dong', dong);

      const sortColumn = sort === 'price' ? 'deposit' : sort === 'area' ? 'area_m2' : 'created_at';
      query = query.order(sortColumn, { ascending: false });
      query = query.range(offset, offset + pageSize - 1);

      const dongQuery = supabase
        .from('listings')
        .select('dong')
        .eq('status', '공개')
        .not('dong', 'is', null)
        .limit(500);

      const [listingsResult, dongResult] = await Promise.all([query, dongQuery]);

      const listings = (listingsResult.data || []).map((r: any) => applyImagePolicy(r));
      const totalCount = listingsResult.count || 0;
      const dongs = [...new Set((dongResult.data as any[] || []).map((r: any) => r.dong as string).filter(Boolean))].sort();

      return { listings, totalCount, dongs };
    },
    30_000,
    300_000,
    3_000,
  );

  if (!result) {
    return <ListingsClient initialListings={[]} initialDongs={[]} totalCount={0} />;
  }

  return (
    <ListingsClient
      initialListings={result.listings}
      initialDongs={result.dongs}
      totalCount={result.totalCount}
    />
  );
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return (
    <Suspense fallback={<ListingsLoading />}>
      <ListingsData params={params} />
    </Suspense>
  );
}
