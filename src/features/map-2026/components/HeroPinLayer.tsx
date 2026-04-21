// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hero pin 집합 컨테이너 — store 의 heroes 를 HTML 핀으로 그림
//
// L-ux4 (2026-04-22): 핀 충돌 회피 (Declutter)
//   기존엔 60개 hero 가 강남 같은 밀집지역에서 픽셀 단위로 완전히 격쳐
//   "흰 꼬리"·"빈 라벨" 처럼 보이는 시각 노이즈가 발생.
//   greedy 알고리즘으로 hero_score 내림차순 + 선택 매물 최우선으로
//   서로 MIN_DIST_X / MIN_DIST_Y 픽셀 이내에 들어오는 후순위 핀은 숨긴다.
//   move/zoom 마다 재계산 (60개 × O(1) projection — 가벼움).
//
//   zoom>=15 에서는 declutter 비활성화 — 매물 단위로
//   정확히 보고 싶을 때 인접 핀이 강제로 숨는 부작용 방지.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMap2026Store } from '../store';
import { HeroPin } from './HeroPin';

// 두 핀의 중심 픽셀 거리 — 이보다 가까우면 후순위 핀 숨김.
const MIN_DIST_X = 64;
const MIN_DIST_Y = 30;

// 이 줌 이상이면 declutter 끄고 전부 표시.
const DECLUTTER_OFF_ZOOM = 15;

export function HeroPinLayer() {
  const map = useMap2026Store((s) => s.map);
  const heroes = useMap2026Store((s) => s.heroes);
  const mode = useMap2026Store((s) => s.mode);
  const selectedId = useMap2026Store((s) => s.selectedId);

  // map move/zoom 마다 declutter 재계산 트리거.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!map) return;
    const onMove = () => setTick((t) => t + 1);
    map.on('move', onMove);
    map.on('zoom', onMove);
    return () => {
      map.off('move', onMove);
      map.off('zoom', onMove);
    };
  }, [map]);

  const visibleIds = useMemo(() => {
    const set = new Set<number>();
    if (!map || heroes.length === 0) return set;

    const zoom = map.getZoom();
    if (zoom >= DECLUTTER_OFF_ZOOM) {
      heroes.forEach((h) => set.add(h.id));
      return set;
    }

    // 1) 선택 매물 항상 표시 (최우선)
    const accepted: Array<{ x: number; y: number }> = [];
    const selected = selectedId != null ? heroes.find((h) => h.id === selectedId) : null;
    if (selected) {
      const p = map.project([selected.lng, selected.lat]);
      accepted.push({ x: p.x, y: p.y });
      set.add(selected.id);
    }

    // 2) 나머지 hero_score 내림차순 (이미 rankHeroes 가 정렬해 둘)
    for (const h of heroes) {
      if (set.has(h.id)) continue;
      const p = map.project([h.lng, h.lat]);
      const collides = accepted.some(
        (a) => Math.abs(a.x - p.x) < MIN_DIST_X && Math.abs(a.y - p.y) < MIN_DIST_Y
      );
      if (collides) continue;
      accepted.push({ x: p.x, y: p.y });
      set.add(h.id);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, heroes, selectedId, tick]);

  if (!map) return null;
  if (mode !== 'pins' && mode !== '3d') return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {heroes.map((h) =>
        visibleIds.has(h.id) ? <HeroPin key={h.id} map={map} listing={h} /> : null
      )}
    </div>
  );
}
