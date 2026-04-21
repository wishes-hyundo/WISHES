// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hero pin 집합 컨테이너 — store 의 heroes 를 HTML 핀으로 그림
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMap2026Store } from '../store';
import { HeroPin } from './HeroPin';

export function HeroPinLayer() {
  const map = useMap2026Store((s) => s.map);
  const heroes = useMap2026Store((s) => s.heroes);
  const mode = useMap2026Store((s) => s.mode);

  if (!map) return null;
  if (mode !== 'pins' && mode !== '3d') return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {heroes.map((h) => (
        <HeroPin key={h.id} map={map} listing={h} />
      ))}
    </div>
  );
}
