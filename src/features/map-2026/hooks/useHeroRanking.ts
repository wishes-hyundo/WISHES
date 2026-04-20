// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 뷰포트 listings 변경될 때마다 hero 후보 재선정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useEffect } from 'react';
import { useMap2026Store } from '../store';
import { rankHeroes } from '../lib/heroScore';

export function useHeroRanking() {
  const listings = useMap2026Store((s) => s.listings);
  const mode = useMap2026Store((s) => s.mode);
  const setHeroes = useMap2026Store((s) => s.setHeroes);

  useEffect(() => {
    if (mode === 'hexagon-low' || mode === 'hexagon-mid') {
      setHeroes([]);
      return;
    }
    // 줌 레벨에 따라 개수 조절
    const max = mode === '3d' ? 120 : 60;
    setHeroes(rankHeroes(listings, max));
  }, [listings, mode, setHeroes]);
}
