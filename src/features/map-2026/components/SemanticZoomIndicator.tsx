// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SemanticZoomIndicator — 현재 줌 모드 배지
//
// L-ux4 (2026-04-22): 핀 밀집지역에서 이 배지가 핀 위에 '떠 있는' 상태로
//   시각 노이즈가 되는 현상 해소.
//   - pins/3d 모드에서는 힌트 텍스트 제거 (배지만 남김)
//   - 기본 55% 투명도, 호버/포커스 시 완전 불투명
//
// L-kakao2 (2026-04-22): Kakao 베이스로 복귀 후 실제로는 hex 집계가 없고
//   deck.gl 이 items 전부를 점으로 렌더 중. "줌인하면 클러스터" 힌트는 이제
//   거짓말이라 전부 제거. 라벨만 축약해서 현재 뷰 성격 표시.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useMap2026Store, type ZoomMode } from '../store';

const LABELS: Record<ZoomMode, string> = {
  'hexagon-low': '광역 뷰',
  'hexagon-mid': '구·동 뷰',
  'pins': '매물 뷰',
  '3d': '건물 뷰',
};

// L-kakao2: HINT 전면 제거 (내용이 실제 동작과 불일치 상태였음).
// [2026-05-22 정밀감사 L5] 전부 null 이던 HINTS 상수 + 죽은 렌더 분기 제거.

export function SemanticZoomIndicator() {
  const mode = useMap2026Store((s) => s.mode);
  const zoom = useMap2026Store((s) => s.zoom);
  const bbox = useMap2026Store((s) => s.bbox);

  if (!bbox) return null;

  return (
    <div
      className="group absolute top-3 left-3 z-20 flex max-w-[calc(100%-5rem)] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full bg-white/85 px-2.5 py-1 text-[11.5px] opacity-60 shadow-sm backdrop-blur transition hover:opacity-100 focus-within:opacity-100"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
      <span className="shrink-0 font-semibold text-neutral-900">{LABELS[mode]}</span>
      <span className="ml-0.5 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-500">
        z{Math.round(zoom)}
      </span>
    </div>
  );
}
