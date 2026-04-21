// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hero 매물 스코어링 — 카테고리별 가중치 (2026-04 고도화)
//
// 🎯 목표: 같은 뷰포트 안에서 "이 카테고리 기준으로 가장 매력적인" 매물 top N
// - 주거: 시세편차↓ · 신축 · 역세권 · 사진 많음
// - 상가: 시세편차↓ · 1층/코너 · 전용률↑ · 역세권
// - 토지: 도로접함 · 면적↑ · 지목변경 가능
// - 투자: 수익률↑ · 공실률↓ · 임대차승계
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { MapListing, PropertyCategory } from '../store';

interface ScoredListing extends MapListing {
  _score: number;
}

/** 카테고리별 가중치 프로파일 */
interface Weights {
  serverBase: number;       // 서버 hero_score 반영
  priceDevGood: number;     // 시세 −10% 이하
  priceDevMid: number;      // 시세 −5% 이하
  priceDevBad: number;      // 시세 +10% 이상 감점
  photoHeavy: number;       // 10장+
  photoMid: number;         // 5장+
  fresh3d: number;          // 3일 이내
  fresh7d: number;          // 7일 이내
  station: number;          // 역세권 400m
  stationClose: number;     // 역세권 200m (추가 가산)
  featureBonus: (features: string[]) => number;
}

function residenceFeatureBonus(features: string[]): number {
  let b = 0;
  if (features.includes('반려동물')) b += 4;
  if (features.includes('엘리베이터')) b += 3;
  if (features.includes('주차')) b += 3;
  if (features.includes('신축')) b += 8;
  return b;
}

function commercialFeatureBonus(features: string[]): number {
  let b = 0;
  if (features.includes('1층')) b += 12;
  if (features.includes('코너')) b += 10;
  if (features.includes('전용률↑')) b += 6;
  if (features.includes('엘리베이터')) b += 3;
  if (features.includes('주차')) b += 5;
  return b;
}

function landFeatureBonus(features: string[]): number {
  let b = 0;
  if (features.includes('도로접함')) b += 15;
  if (features.includes('지목변경')) b += 10;
  if (features.includes('개발가능')) b += 8;
  return b;
}

function investmentFeatureBonus(features: string[]): number {
  let b = 0;
  for (const f of features) {
    // "수익률N+" 태그
    if (f.startsWith('수익률')) {
      const n = parseFloat(f.replace('수익률', '').replace('+', ''));
      if (Number.isFinite(n)) b += n * 3; // 4% → +12, 7% → +21
    }
  }
  if (features.includes('공실률낮음')) b += 10;
  if (features.includes('임대차승계')) b += 7;
  if (features.includes('리모델링가능')) b += 5;
  return b;
}

const PROFILES: Record<PropertyCategory, Weights> = {
  residence: {
    serverBase: 0.6,
    priceDevGood: 25, priceDevMid: 15, priceDevBad: -10,
    photoHeavy: 10, photoMid: 5,
    fresh3d: 8, fresh7d: 4,
    station: 6, stationClose: 4,
    featureBonus: residenceFeatureBonus,
  },
  retail_office: {
    serverBase: 0.5,
    priceDevGood: 20, priceDevMid: 12, priceDevBad: -8,
    photoHeavy: 6, photoMid: 3,
    fresh3d: 5, fresh7d: 2,
    station: 10, stationClose: 6,      // 상가는 역세권이 매매가치 직결
    featureBonus: commercialFeatureBonus,
  },
  land: {
    serverBase: 0.4,
    priceDevGood: 18, priceDevMid: 10, priceDevBad: -5,
    photoHeavy: 2, photoMid: 1,        // 토지는 사진 중요도 낮음
    fresh3d: 3, fresh7d: 1,
    station: 2, stationClose: 1,        // 토지는 역세권 영향 미미
    featureBonus: landFeatureBonus,
  },
  investment: {
    serverBase: 0.5,
    priceDevGood: 15, priceDevMid: 8, priceDevBad: -5,
    photoHeavy: 4, photoMid: 2,
    fresh3d: 3, fresh7d: 1,
    station: 8, stationClose: 4,
    featureBonus: investmentFeatureBonus,
  },
};

/**
 * 카테고리-aware hero 매물 선별 (pin overlap 회피 포함)
 */
export function rankHeroes(
  listings: MapListing[],
  max = 60,
  category: PropertyCategory = 'residence'
): MapListing[] {
  if (listings.length === 0) return [];

  const w = PROFILES[category];

  const scored: ScoredListing[] = listings.map((l) => {
    let s = (l.hero_score ?? 0) * w.serverBase;

    if (l.median_deviation != null) {
      if (l.median_deviation <= -0.1) s += w.priceDevGood;
      else if (l.median_deviation <= -0.05) s += w.priceDevMid;
      else if (l.median_deviation >= 0.1) s += w.priceDevBad;
    }

    if (l.photo_count >= 10) s += w.photoHeavy;
    else if (l.photo_count >= 5) s += w.photoMid;

    const daysOld = Math.max(0, (Date.now() - new Date(l.created_at).getTime()) / 86400000);
    if (daysOld <= 3) s += w.fresh3d;
    else if (daysOld <= 7) s += w.fresh7d;

    if (l.station_distance != null) {
      if (l.station_distance <= 200) s += w.stationClose + w.station;
      else if (l.station_distance <= 400) s += w.station;
    }

    // features 는 listing 의 실제 속성에 맞춰 읽음 (있을 경우)
    const fs = Array.isArray(l.features) ? l.features : [];
    s += w.featureBonus(fs);

    return { ...l, _score: s };
  });

  scored.sort((a, b) => b._score - a._score);

  // 픽셀 밀집도 회피 (greedy pruning) — 카테고리별 간격 조정
  // 주거: 150m, 상가: 200m (가판 밀집 고려 좀 더 넓게)
  const MIN_DIST_DEG =
    category === 'retail_office' ? 0.0020 :
    category === 'land' ? 0.0025 :
    0.0015;

  const picked: ScoredListing[] = [];
  for (const l of scored) {
    if (picked.length >= max) break;
    const collides = picked.some(
      (p) => Math.abs(p.lat - l.lat) < MIN_DIST_DEG && Math.abs(p.lng - l.lng) < MIN_DIST_DEG
    );
    if (!collides) picked.push(l);
  }

  return picked.map(({ _score, ...rest }) => rest);
}
