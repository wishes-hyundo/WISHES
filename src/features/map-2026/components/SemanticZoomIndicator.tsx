// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SemanticZoomIndicator — 현재 줌 모드 배지
//
// L-ux1 (2026-04-22) 개선:
//   - map 이 아직 bind 되지 않은 상태(bbox == null) 에서는 숨김
//     → 이전엔 store 기본값 z=12.3 을 캔버스 페인트 이전부터 노출해서
//       "로드 안 됐는데 배지만 먼저 뜨는" 인상을 줬음
//   - flex-wrap 으로 텍스트가 줄바꿈되던 문제 → whitespace-nowrap + truncate
//   - 좁은 지도 컬럼(Claude 사이드바/DevTools 도킹) 에서는 HINT 텍스트 숨김
//   - z-수치는 소수점 제거(정수 반올림) 으로 가로폭 단축
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
  // bbox 는 map.on('load') 이후 첫 moveend 에서 setBbox 로 세팅됨.
  // null 이면 아직 MapLibre 가 painting 준비가 안 된 상태.
  const bbox = useMap2026Store((s) => s.bbox);

  if (!bbox) return null;

  return (
    <div className="pointer-events-none absolute top-4 left-4 z-20 flex max-w-[calc(100%-5rem)] items-center gap-2 overflow-hidden whitespace-nowrap rounded-full bg-white/95 px-3 py-1.5 text-[12px] shadow-md backdrop-blur">
      <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
      <span className="shrink-0 font-semibold text-neutral-900">{LABELS[mode]}</span>
      <span className="hidden shrink-0 text-neutral-400 md:inline">·</span>
      <span className="hidden truncate text-neutral-500 md:inline">{HINTS[mode]}</span>
      <span className="ml-1 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-500">
        z {Math.round(zoom)}
      </span>
    </div>
  );
}
