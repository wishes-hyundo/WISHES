// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SemanticZoomIndicator — 현재 줌 모드 배지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMap2026Store, type ZoomMode } from '../store';

const LABELS: Record<ZoomMode, string> = {
  'hexagon-low': '지역 개요',
  'hexagon-mid': '클러스터 뷰',
  'pins': '매물 뷰',
  '3d': '건물 뷰',
};

const HINTS: Record<ZoomMode, string> = {
  'hexagon-low': '줌인하면 클러스터를 볼 수 있어요',
  'hexagon-mid': '조금 더 확대하면 매물이 보여요',
  'pins': '가격 핀을 클릭해 자세히 보기',
  '3d': '건물 단위 집계 · 3D 시각화',
};

export function SemanticZoomIndicator() {
  const mode = useMap2026Store((s) => s.mode);
  const zoom = useMap2026Store((s) => s.zoom);

  return (
    <div className="pointer-events-none absolute top-4 left-4 z-20 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[12px] shadow-md backdrop-blur">
      <span className="size-2 rounded-full bg-emerald-500" />
      <span className="font-semibold text-neutral-900">{LABELS[mode]}</span>
      <span className="text-neutral-400">·</span>
      <span className="text-neutral-500">{HINTS[mode]}</span>
      <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
        z {zoom.toFixed(1)}
      </span>
    </div>
  );
}
