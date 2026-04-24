// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// markerTier — L-mapmarker1 (2026-04-23) · L-mapmarker2 (2026-04-23)
// 매물 리스트를 "같은 단지(building_name) pill" 과 "개별" 로 분류하는 유틸.
// L-mapmarker2: category 매핑 + unified 그린 컬러 스킴으로 개편.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { MapListing, PropertyCategory } from '@/features/map-2026/store';

// L-naverstyle2 (2026-04-24 pm): 네이버 부동산은 모든 타입에 건물명 pill 을 씀.
//   BRANDED_TYPES 제한 제거 — building_name 있으면 타입 무관하게 pill.
// (강남 상가/원룸 지역에서도 "써패스이앤티", "잠원동양타운" 같은 건물명 pill 이 나오도록)
// const BRANDED_TYPES removed — 모든 타입이 brand-able.

// L-naverstyle2: 같은 건물 1개짜리도 pill 로 (네이버는 건물 단위 일관 표시).
//   기존 ≥2 기준은 pill 이 안 나온 매물을 grid cluster 숫자 원 으로 떨어뜨려
//   근거리 뷰가 숫자 원 bar 드 로 뒤덮였음.
const TIER1_MIN_GROUP = 1;

export type MarkerTier = 'tier1' | 'tier2';

export interface Tier1Group {
  key: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  count: number;
  listings: MapListing[];
}

export interface MarkerBuckets {
  tier1Groups: Tier1Group[];
  tier2Listings: MapListing[];
}

function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const t = name.trim();
  return t.length > 0 ? t.toLowerCase() : null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 매물 type → PropertyCategory 매핑 (L-mapmarker2 2026-04-23)
// /map 상단 카테고리 탭과 마커 가시성을 클라이언트 레벨에서 동기화하기 위한
// 헬퍼. 서버가 category 필터를 넘겨도 레거시 type 값이 섞여 들어올 수 있으므로
// 클라이언트에서도 한 번 더 거른다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const LAND_TYPES = new Set<string>(['토지', '대지', '임야', '전', '답', '과수원']);
const RETAIL_OFFICE_TYPES = new Set<string>([
  '상가', '사무실', '지식산업센터', '복합건물', '상가주택', '사무용', '오피스', '점포', '근생',
]);

export function listingCategory(type: string | null | undefined): PropertyCategory {
  const t = (type ?? '').trim();
  if (!t) return 'residence';
  if (LAND_TYPES.has(t)) return 'land';
  if (RETAIL_OFFICE_TYPES.has(t)) return 'retail_office';
  // 'investment' 는 cross-cutting 라벨 — type 으로 결정되지 않고 상위 로직에서
  // 탭 선택 시 카테고리 필터를 완전히 해제하는 방식으로 처리한다.
  return 'residence';
}

// 매물 리스트를 Tier1 그룹과 Tier2 개별로 분류.
// 브랜드 타입 + building_name 있고 같은 그룹에 ≥2개 → Tier1
// 그 외 전부 → Tier2 (단일 매물)
export function bucketListings(listings: MapListing[]): MarkerBuckets {
  const groups = new Map<string, MapListing[]>();
  const tier2Listings: MapListing[] = [];

  for (const l of listings) {
    const nn = normalizeName(l.building_name);
    const type = l.type ?? '';
    // L-naverstyle2: building_name 있으면 모든 타입에 pill 적용.
    if (nn) {
      const key = `${type || 'x'}:${nn}`;
      const arr = groups.get(key);
      if (arr) arr.push(l);
      else groups.set(key, [l]);
    } else {
      tier2Listings.push(l);
    }
  }

  const tier1Groups: Tier1Group[] = [];

  for (const [key, arr] of groups) {
    if (arr.length >= TIER1_MIN_GROUP) {
      let latSum = 0;
      let lngSum = 0;
      for (const l of arr) {
        latSum += l.lat;
        lngSum += l.lng;
      }
      tier1Groups.push({
        key,
        name: arr[0].building_name || '',
        type: arr[0].type || '',
        lat: latSum / arr.length,
        lng: lngSum / arr.length,
        count: arr.length,
        listings: arr,
      });
    } else {
      // 단일 매물 → Tier 2 로 강등
      for (const l of arr) tier2Listings.push(l);
    }
  }

  return { tier1Groups, tier2Listings };
}
