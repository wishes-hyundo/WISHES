'use client';

/**
 * /search-preview — /search 현대식 재구축 검증 페이지
 *
 * 통합 화면 조립: 헤더(유리) + 필터 바 + 목록·지도 분할(ResultsSplit).
 * 기준: ★search_완전기능명세서.md · ★search_필터_표준.md.
 * 현재 목록은 검증용 mock — 실데이터 연결(useSearchListings)은 인증과 함께 swap 시점.
 * 지도는 카카오맵 클러스터 통합 예정.
 */

import { useState } from 'react';
import { SearchHeader } from '@/features/search-2026/components/SearchHeader';
import { FilterBar } from '@/features/search-2026/components/FilterBar';
import { ResultsSplit } from '@/features/search-2026/components/ResultsSplit';
import { SearchFilterChips } from '@/features/search-2026/components/SearchFilterChips';
import { useSearchStore } from '@/features/search-2026/store';
import { useSearchListings } from '@/features/search-2026/hooks';
import { type SearchView } from '@/features/search-2026/components/ViewTabs';
import { type SearchListing } from '@/features/search-2026/types';

const MOCK: SearchListing[] = [
  { id: 119795, deal: '매매', type: '상가', address: '경기 안양시 만안구 안양동 821-6', dong: '안양동', area_m2: 139, floor_current: 2, floor_total: 2, price: 58000, built_year: '2018년', parking_spaces: 3, maintenance_fee: 0, source_site: 'gongsilclub', available_date: '즉시입주', road_address: '안양로417번길 22-1' },
  { id: 119794, deal: '전세', type: '빌라', address: '경기 고양시 덕양구 내유동 653-7', dong: '내유동', area_m2: 59.9, floor_current: 1, floor_total: 4, rooms: 2, deposit: 8000, monthly_alt: 50, deposit_alt: 1000, building_name: '킹스빌타운', elevator: true, built_year: '2015년', maintenance_fee: 5, maintenance_includes: ['수도'], pet: true, source_site: 'onhouse', available_date: '2026-08-01', address_detail: '나동 201호', road_address: '고양대로 1234' },
  { id: 119792, deal: '전세', type: '원룸', address: '서울 노원구 공릉동 621-6', dong: '공릉동', area_m2: 39.6, floor_current: 6, floor_total: 6, rooms: 1, deposit: 15000, building_name: 'JHCITY HOUSE', elevator: true, parking_spaces: 1, built_year: '2021년', maintenance_fee: 7, maintenance_includes: ['수도', '인터넷'], full_option: true, source_site: 'gongsilclub', available_date: '즉시', address_detail: '601호', road_address: '동일로174길 9-46' },
  { id: 119709, deal: '월세', type: '원룸', address: '서울 노원구 공릉동 621-6', dong: '공릉동', area_m2: 39.6, floor_current: 6, floor_total: 6, rooms: 1, deposit: 8000, monthly: 35, building_name: 'JHCITY HOUSE', elevator: true, built_year: '2021년', maintenance_fee: 7, maintenance_includes: ['수도', '인터넷', '청소'], full_option: true, pet: true, source_site: 'gongsilclub', available_date: '협의', address_detail: '601호', road_address: '동일로174길 9-46' },
  { id: 119688, deal: '매매', type: '아파트', address: '서울 강북구 번동 416-90', dong: '번동', area_m2: 84.9, floor_current: 3, floor_total: 15, rooms: 3, price: 62000, deposit_jeonse: 38000, monthly_alt: 80, deposit_alt: 5000, maintenance_fee: 12, maintenance_includes: ['수도', '경비'], building_name: '에덴하우스', elevator: true, parking_spaces: 2, built_year: '2009년', source_site: null, available_date: '2026-09-15', address_detail: '3동 304호', road_address: '번동로 12' },
  { id: 119641, deal: '전세', type: '오피스텔', address: '서울 마포구 서교동 395-17', dong: '서교동', area_m2: 33.1, floor_current: 8, floor_total: 12, rooms: 1, deposit: 22000, maintenance_fee: 9, maintenance_includes: ['수도', '인터넷'], elevator: true, parking_spaces: 1, built_year: '2019년', full_option: true, source_site: 'onhouse', available_date: '즉시입주', address_detail: '812호', road_address: '성미산로 101' },
  { id: 119602, deal: '월세', type: '사무실', address: '서울 강남구 역삼동 825-22', dong: '역삼동', area_m2: 112, floor_current: 5, floor_total: 14, deposit: 5000, monthly: 320, maintenance_fee: 45, maintenance_includes: ['수도', '전기', '인터넷', '청소'], elevator: true, parking_spaces: 4, built_year: '2012년', source_site: 'gongsilclub', available_date: '2026-07-01', address_detail: '505호', road_address: '테헤란로 88' },
  { id: 119571, deal: '전세', type: '빌라', address: '서울 은평구 응암동 89-14', dong: '응암동', area_m2: 46.2, floor_current: 2, floor_total: 4, rooms: 2, deposit: 12000, built_year: '2006년', maintenance_fee: 0, pet: true, source_site: 'onhouse', available_date: '즉시입주', address_detail: '가동 202호', road_address: '증산로 45' },
  { id: 119540, deal: '매매', type: '아파트', address: '경기 성남시 분당구 정자동 178', dong: '정자동', area_m2: 101.8, floor_current: 12, floor_total: 25, rooms: 3, price: 128000, maintenance_fee: 18, maintenance_includes: ['수도', '경비', '난방'], building_name: '정자아이파크', elevator: true, parking_spaces: 2, built_year: '2003년', source_site: null, available_date: '협의', address_detail: '107동 1203호', road_address: '정자일로 120' },
  { id: 119498, deal: '월세', type: '원룸', address: '서울 관악구 신림동 1640-21', dong: '신림동', area_m2: 23.1, floor_current: 3, floor_total: 5, rooms: 1, deposit: 1000, monthly: 55, built_year: '1998년', maintenance_fee: 5, maintenance_includes: ['수도'], source_site: 'gongsilclub', available_date: '즉시', address_detail: '302호', road_address: '신림로 233' },
  { id: 119455, deal: '전세', type: '오피스텔', address: '서울 송파구 문정동 643-1', dong: '문정동', area_m2: 44.5, floor_current: 9, floor_total: 18, rooms: 1, deposit: 27000, maintenance_fee: 11, maintenance_includes: ['수도', '인터넷'], building_name: '문정역테라타워', elevator: true, parking_spaces: 1, built_year: '2017년', full_option: true, source_site: 'onhouse', available_date: '2027-01-10', address_detail: '914호', road_address: '문정로 150' },
  { id: 119401, deal: '매매', type: '토지', address: '경기 용인시 처인구 이동읍 천리 산32', dong: '이동', area_m2: 661, price: 41000, maintenance_fee: 0, source_site: null },
  { id: 119388, deal: '전세', type: '오피스텔', address: '서울 강남구 논현동 12-3', dong: '논현동', address_detail: '1402호', area_m2: 41, floor_current: 14, floor_total: 20, rooms: 1, deposit: 33000, maintenance_fee: 11, maintenance_includes: ['수도', '인터넷'], building_name: '논현팰리스', elevator: true, parking_spaces: 1, built_year: '2016년', source_site: 'gongsilclub', available_date: '즉시입주', road_address: '논현로 152' },
  { id: 119389, deal: '월세', type: '오피스텔', address: '서울 강남구 논현동 12-3', dong: '논현동', address_detail: '1402호', area_m2: 41, floor_current: 14, floor_total: 20, rooms: 1, deposit: 2000, monthly: 130, maintenance_fee: 11, building_name: '논현팰리스', elevator: true, parking_spaces: 1, built_year: '2016년', source_site: 'gongsilclub', available_date: '즉시입주', road_address: '논현로 152' },
  { id: 119793, deal: '월세', type: '원룸', address: '서울 노원구 공릉동 621-6 JHCITY HOUSE', dong: '공릉동', address_detail: '402호', area_m2: 36.1, floor_current: 4, floor_total: 6, rooms: 1, deposit: 1000, monthly: 48, maintenance_fee: 7, maintenance_includes: ['수도', '인터넷'], building_name: 'JHCITY HOUSE', elevator: true, parking_spaces: 1, built_year: '2021년', source_site: 'gongsilclub', available_date: '즉시입주', road_address: '동일로174길 9-46' },
  { id: 119791, deal: '전세', type: '원룸', address: '서울 노원구 공릉동 621-6 JHCITY HOUSE', dong: '공릉동', address_detail: '705호', area_m2: 42.0, floor_current: 7, floor_total: 6, rooms: 1, deposit: 17000, maintenance_fee: 7, maintenance_includes: ['수도', '인터넷'], building_name: 'JHCITY HOUSE', elevator: true, parking_spaces: 1, built_year: '2021년', source_site: 'onhouse', available_date: '2026-08-20', road_address: '동일로174길 9-46' },
];

export default function SearchPreviewPage() {
  const [view, setView] = useState<SearchView>('split');
  const { filters } = useSearchStore();

  // 실데이터 — 로그인(ws_session 쿠키) 시 /api/admin/listings/page 무한스크롤.
  //   미인증/실패 시 검증용 mock 으로 폴백 → preview 는 항상 화면이 보임.
  const {
    listings: realListings, total: realTotal,
    fetchNextPage, hasNextPage, isFetchingNextPage, isError,
  } = useSearchListings(filters);
  const useReal = !isError && realListings.length > 0;
  const listings = useReal ? realListings : MOCK;
  const total = useReal ? realTotal : 73445;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,#EDEEF0,#E7E9EC)',
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard','Malgun Gothic',sans-serif",
      }}
    >
      <SearchHeader
        query={filters.q ?? ''}
        onQueryChange={() => {}}
        onReset={() => {}}
        onSearch={(v) => console.log('[search-preview] 검색:', v)}
        view={view}
        onViewChange={setView}
      />
      <FilterBar />
      <SearchFilterChips />
      <ResultsSplit
        listings={listings}
        total={total}
        onLoadMore={useReal ? () => { void fetchNextPage(); } : undefined}
        hasMore={useReal && !!hasNextPage}
        loadingMore={isFetchingNextPage}
      />
    </div>
  );
}
