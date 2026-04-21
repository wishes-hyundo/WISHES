// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 뷰포트 listings + 카테고리 변경 시 hero 재선정
// (2026-04: category 가중치 반영)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useEffect } from 'react';
import { useMap2026Store } from '../store';
import { rankHeroes } from '../lib/heroScore';

export function useHeroRanking() {
  const listings = useMap2026Store((s) => s.listings);
  const mode = useMap2026Store((s) => s.mode);
  const category = useMap2026Store((s) => s.filter.category);
  const setHeroes = useMap2026Store((s) => s.setHeroes);

  useEffect(() => {
    if (mode === 'hexagon-low' || mode === 'hexagon-mid') {
      setHeroes([]);
      return;
    }
    // 줌 레벨에 따라 개수 조절
    const max = mode === '3d' ? 120 : 60;
    setHeroes(rankHeroes(listings, max, category));
  }, [listings, mode, category, setHeroes]);
}
