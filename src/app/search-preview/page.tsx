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
import { useSearchStore } from '@/features/search-2026/store';
import { type SearchView } from '@/features/search-2026/components/ViewTabs';
import { type SearchListing } from '@/features/search-2026/types';

const MOCK: SearchListing[] = [
  { id: 119795, deal: '매매', type: '상가', address: '경기 안양시 만안구 안양동 821-6', area_m2: 139, floor_current: 2, floor_total: 2, price: 58000, building_name: null, parking: true },
  { id: 119794, deal: '전세', type: '빌라', address: '경기 고양시 덕양구 내유동 653-7', area_m2: 59.9, floor_current: 1, floor_total: 4, rooms: 2, deposit: 8000, building_name: '킹스빌타운', elevator: true },
  { id: 119792, deal: '전세', type: '원룸', address: '서울 노원구 공릉동 621-6', area_m2: 39.6, floor_current: 6, floor_total: 6, rooms: 1, deposit: 15000, building_name: 'JHCITY HOUSE', elevator: true, parking: true },
  { id: 119709, deal: '월세', type: '원룸', address: '서울 노원구 공릉동 621-6', area_m2: 39.6, floor_current: 6, floor_total: 6, rooms: 1, deposit: 8000, monthly: 35, building_name: 'JHCITY HOUSE', elevator: true },
  { id: 119688, deal: '매매', type: '아파트', address: '서울 강북구 번동 416-90', area_m2: 84.9, floor_current: 3, floor_total: 15, rooms: 3, price: 62000, maintenance_fee: 12, building_name: '에덴하우스', elevator: true, parking: true },
  { id: 119641, deal: '전세', type: '오피스텔', address: '서울 마포구 서교동 395-17', area_m2: 33.1, floor_current: 8, floor_total: 12, rooms: 1, deposit: 22000, maintenance_fee: 9, elevator: true, parking: true },
  { id: 119602, deal: '월세', type: '사무실', address: '서울 강남구 역삼동 825-22', area_m2: 112, floor_current: 5, floor_total: 14, deposit: 5000, monthly: 320, maintenance_fee: 45, elevator: true, parking: true },
  { id: 119571, deal: '전세', type: '빌라', address: '서울 은평구 응암동 89-14', area_m2: 46.2, floor_current: 2, floor_total: 4, rooms: 2, deposit: 12000 },
  { id: 119540, deal: '매매', type: '아파트', address: '경기 성남시 분당구 정자동 178', area_m2: 101.8, floor_current: 12, floor_total: 25, rooms: 3, price: 128000, maintenance_fee: 18, building_name: '정자아이파크', elevator: true, parking: true },
  { id: 119498, deal: '월세', type: '원룸', address: '서울 관악구 신림동 1640-21', area_m2: 23.1, floor_current: 3, floor_total: 5, rooms: 1, deposit: 1000, monthly: 55 },
  { id: 119455, deal: '전세', type: '오피스텔', address: '서울 송파구 문정동 643-1', area_m2: 44.5, floor_current: 9, floor_total: 18, rooms: 1, deposit: 27000, maintenance_fee: 11, building_name: '문정역테라타워', elevator: true, parking: true },
  { id: 119401, deal: '매매', type: '토지', address: '경기 용인시 처인구 이동읍 천리 산32', area_m2: 661, price: 41000 },
];

export default function SearchPreviewPage() {
  const [view, setView] = useState<SearchView>('split');
  const { filters } = useSearchStore();

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
      <ResultsSplit listings={MOCK} total={73445} />
    </div>
  );
}
