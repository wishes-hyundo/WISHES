// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// markerTier — L-mapmarker1 (2026-04-23)
// Tier 1 (브랜드 단지 pill) vs Tier 2 (개별 원) 분류 유틸.
// 네이버 부동산 + 직방 표준 스타일. building_name + type 기반 클라이언트 그룹핑.
// 마이그레이션 불필요 — 기존 MapListing.building_name 재활용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { MapListing } from '@/features/map-2026/store';

// 단지명이 의미 있는 카테고리. 나머지는 건물명 있어도 개별 매물로 취급.
const BRANDED_TYPES = new Set<string>(['아파트', '오피스텔']);

// 같은 building_name + type 그룹이 이만큼 이상이어야 Tier 1 pill 로 승격.
const TIER1_MIN_GROUP = 2;

export type MarkerTier = 'tier1' | 'tier2';

export interface Tier1Group {
  key: string;            // `type:normalized_name`
  name: string;           // 원본 building_name
  type: string;           // '아파트' | '오피스텔'
  lat: number;            // 그룹 평균
  lng: number;            // 그룹 평균
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

// Tier1 pill 왼쪽 닷 색상 (카테고리별).
export function getTier1DotColor(type: string | null | undefined): string {
  if (type === '오피스텔') return '#534AB7'; // purple-600
  return '#185FA5'; // blue-600 (아파트 기본)
}

// Tier2 원 테두리 색 (카테고리별).
export function getTier2BorderColor(type: string | null | undefined): string {
  switch (type) {
    case '빌라':
    case '주택':
    case '단독':
    case '다가구':
      return '#3B6D11'; // green-800
    case '원룸':
    case '투룸':
    case '쓰리룸':
    case '오피스텔-원룸':
      return '#0F6E56'; // teal-600
    case '상가':
    case '사무실':
    case '지식산업센터':
    case '복합건물':
      return '#BA7517'; // amber-600
    case '토지':
      return '#993C1D'; // coral-800
    case '아파트':
      return '#185FA5';
    case '오피스텔':
      return '#534AB7';
    default:
      return '#888780'; // gray-600
  }
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
    if (nn && BRANDED_TYPES.has(type)) {
      const key = `${type}:${nn}`;
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
