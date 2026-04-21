// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// useLocalComparable — 현재 뷰포트 기반 로컬 비교우위 재계산
//
// 🎯 철학
//   - 서버(viewport route) 는 bbox 내 모든 매물로 median 을 계산 (regional)
//   - 클라이언트는 "지금 내 화면에 실제로 보이는 것" 기준으로 재계산 (local)
//   - 둘의 차이가 사용자 체감 차별화 포인트:
//     "강남구 평균 대비 -12%" vs "지금 보고 있는 매물 중 -8%"
//
// ⚡ 성능
//   - listings 가 변할 때만 재계산 (useMemo)
//   - filter.category === 'residence' 일 때만 rooms/areaBand 정교하게
//   - 다른 카테고리는 deal 단위 단순 median 으로 fallback
//
// 🎁 출력
//   - 각 매물 id → { localMedian, localDeviation } 맵
//   - null 이면 샘플 부족 (뷰포트에 comparable 이 2개 미만)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMemo } from 'react';
import { useMap2026Store, type MapListing } from '../store';

export interface LocalComparable {
  localMedian: number | null;
  localDeviation: number | null;
  sampleSize: number;
}

const MIN_SAMPLE = 2;

function normPrice(l: MapListing): number {
  if (l.deal === '매매') return l.price ?? 0;
  if (l.deal === '전세') return l.deposit ?? 0;
  return (l.deposit ?? 0) + (l.monthly ?? 0) * 100;
}

function areaBand(a: number | null): string {
  if (a == null) return '_';
  if (a < 33) return 'S';
  if (a < 66) return 'M';
  if (a < 100) return 'L';
  if (a < 150) return 'XL';
  return 'XXL';
}

function roomsBand(r: number | null): string {
  if (r == null) return '_';
  if (r <= 1) return '1';
  if (r === 2) return '2';
  return '3+';
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function useLocalComparable(): Map<number, LocalComparable> {
  const listings = useMap2026Store((s) => s.listings);
  const category = useMap2026Store((s) => s.filter.category);

  return useMemo(() => {
    const out = new Map<number, LocalComparable>();
    if (!listings.length) return out;

    // 카테고리별 그룹 정밀도
    const groupKey = (l: MapListing): string => {
      if (category === 'residence') {
        return `${l.deal}|${areaBand(l.area_m2)}|${roomsBand(l.rooms)}`;
      }
      if (category === 'retail_office') {
        return `${l.deal}|${areaBand(l.area_m2)}`;
      }
      return `${l.deal}`;
    };

    const groups = new Map<string, number[]>();
    for (const l of listings) {
      const p = normPrice(l);
      if (p <= 0) continue;
      const k = groupKey(l);
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
    }

    for (const l of listings) {
      const p = normPrice(l);
      if (p <= 0) {
        out.set(l.id, { localMedian: null, localDeviation: null, sampleSize: 0 });
        continue;
      }
      const k = groupKey(l);
      const arr = groups.get(k) ?? [];
      if (arr.length < MIN_SAMPLE) {
        out.set(l.id, { localMedian: null, localDeviation: null, sampleSize: arr.length });
        continue;
      }
      const m = median(arr);
      out.set(l.id, {
        localMedian: m,
        localDeviation: (p - m) / m,
        sampleSize: arr.length,
      });
    }
    return out;
  }, [listings, category]);
}
