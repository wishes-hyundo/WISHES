// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 영웅 매물 스코어링 (클라이언트 재랭킹)
// 서버 hero_score 를 기본으로, 뷰포트 내 상대 우선순위 재조정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { MapListing } from '../store';

interface ScoredListing extends MapListing {
  _score: number;
}

/** 뷰포트 내에서 상위 N개의 매물 선별 — pin overlap 방지 */
export function rankHeroes(listings: MapListing[], max = 60): MapListing[] {
  if (listings.length === 0) return [];

  // 1차: 서버 스코어 + 가격편차(좋은쪽)
  const scored: ScoredListing[] = listings.map((l) => {
    let s = (l.hero_score ?? 0) * 0.6;

    // 시세 대비 싸면 가산점 (−10% 이하는 큰 가산)
    if (l.median_deviation != null) {
      if (l.median_deviation <= -0.1) s += 25;
      else if (l.median_deviation <= -0.05) s += 15;
      else if (l.median_deviation >= 0.1) s -= 10;
    }

    // 사진 많은 매물 가산
    if (l.photo_count >= 10) s += 10;
    else if (l.photo_count >= 5) s += 5;

    // 최근 등록 가산
    const daysOld = Math.max(0, (Date.now() - new Date(l.created_at).getTime()) / 86400000);
    if (daysOld <= 3) s += 8;
    else if (daysOld <= 7) s += 4;

    // 역세권 가산
    if (l.station_distance != null && l.station_distance <= 400) s += 6;

    return { ...l, _score: s };
  });

  scored.sort((a, b) => b._score - a._score);

  // 2차: 픽셀 밀집도 회피 (greedy pruning)
  const picked: ScoredListing[] = [];
  const MIN_DIST_DEG = 0.0015; // ~150m @ 서울 위도

  for (const l of scored) {
    if (picked.length >= max) break;
    const collides = picked.some(
      (p) => Math.abs(p.lat - l.lat) < MIN_DIST_DEG && Math.abs(p.lng - l.lng) < MIN_DIST_DEG
    );
    if (!collides) picked.push(l);
  }

  // 3차: _score 제거 후 원본 타입으로
  return picked.map(({ _score, ...rest }) => rest);
}
