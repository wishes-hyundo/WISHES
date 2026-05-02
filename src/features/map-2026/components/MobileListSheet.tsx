// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MobileListSheet — 모바일 하단 슬라이드 시트
//
// L-naver-2026bottomsheet1 (2026-04-27): BoB 모바일 UX.
//   사용자 요청: "모바일을 더 많이 사용하니 비중으로 보면 모바일을 더 많이 사용".
//   네이버/직방 표준: 모바일 매물 리스트는 하단 시트 (지도 영역 최대 확보).
//
// L-naver-2026bottomsheet2 (2026-05-02): 정밀 추적 — 드래그 충돌 + 스크롤 막힘 fix.
//   문제 1) drag="y" 가 시트 전체에 걸려 있어 ListPanel 스크롤이 항상 드래그로 가로채짐.
//          → 사용자가 매물 리스트를 손가락으로 스크롤할 수 없음 (모바일에서 치명).
//   문제 2) touchAction:'none' 가 시트 전체에 → ListPanel touch 입력이 모두 차단됨.
//   문제 3) useState 초기값이 SSR(800px) ≠ 클라이언트(실제 vh) → hydration 경고.
//   해결:
//     a) useDragControls() 로 드래그 시작점을 핸들 버튼으로 한정 (dragListener=false).
//     b) touch-action: 'pan-y' 를 핸들에만 부여 — ListPanel 은 native scroll 가능.
//     c) vh 초기값 0 (SSR-safe) → useEffect 에서 실제 vh 세팅.
//
// 동작:
//   · 3-snap: peek (72px, 헤더만) / mid (50vh) / full (90vh)
//   · 드래그 핸들 (peek 헤더) + 클릭 토글 — ListPanel 은 native overflow scroll
//   · framer-motion drag + spring snap (자연스러운 모션)
//   · 데스크탑(md+)에선 hidden — 좌측 사이드바 그대로
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useState, useEffect } from 'react';
import { motion, useDragControls, type PanInfo } from 'framer-motion';
import { useMap2026Store } from '../store';
import { ListPanel } from './ListPanel';
import { SumBox } from './SumBox';

type SnapKey = 'peek' | 'mid' | 'full';

const SNAP_POINTS: Record<SnapKey, (vh: number) => number> = {
  peek: () => 72,            // 헤더만
  mid:  (vh) => vh * 0.5,    // 50vh
  full: (vh) => vh * 0.9,    // 90vh
};

function nearestSnap(currentHeight: number, vh: number): SnapKey {
  const peek = SNAP_POINTS.peek(vh);
  const mid = SNAP_POINTS.mid(vh);
  const full = SNAP_POINTS.full(vh);
  // 가장 가까운 snap 으로
  const dPeek = Math.abs(currentHeight - peek);
  const dMid = Math.abs(currentHeight - mid);
  const dFull = Math.abs(currentHeight - full);
  if (dPeek <= dMid && dPeek <= dFull) return 'peek';
  if (dMid <= dFull) return 'mid';
  return 'full';
}

export default function MobileListSheet() {
  const [snap, setSnap] = useState<SnapKey>('peek');
  // L-naver-2026bottomsheet2: SSR-safe 초기값 0 → useEffect 에서 실제 vh 세팅
  const [vh, setVh] = useState<number>(0);
  const dragControls = useDragControls();
  const listingsLength = useMap2026Store((s) => s.listings.length);
  const clusterFilterIds = useMap2026Store((s) => s.clusterFilterIds);
  const filterCategory = useMap2026Store((s) => s.filter.category);
  const categoryCounts = useMap2026Store((s) => s.categoryCounts);

  useEffect(() => {
    // 마운트 즉시 실제 vh 적용
    setVh(window.innerHeight);
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // 클러스터 필터 활성화 시 자동 mid 로 (사용자가 결과 보게)
  useEffect(() => {
    if (clusterFilterIds && clusterFilterIds.length > 0 && snap === 'peek') {
      setSnap('mid');
    }
    // 의도적으로 snap 의존성 제외 (사용자 수동 변경 후 re-trigger 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterFilterIds]);

  // vh=0 (마운트 전) 이면 peek 높이만 보장 — 첫 페인트 깜빡임 최소화
  const safeVh = vh > 0 ? vh : 800;
  const height = SNAP_POINTS[snap](safeVh);
  const headerCount = clusterFilterIds && clusterFilterIds.length > 0
    ? clusterFilterIds.length
    : (listingsLength > 0 ? listingsLength : (categoryCounts?.[filterCategory] ?? 0));

  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    // 현재 height 에서 drag offset 빼서 새 height 계산
    const draggedHeight = height - info.offset.y;
    // velocity 기반 가속 (빠르게 드래그하면 더 멀리)
    const projected = draggedHeight - info.velocity.y * 0.15;
    const next = nearestSnap(projected, safeVh);
    setSnap(next);
  };

  const cycleSnap = () => {
    setSnap((cur) => cur === 'peek' ? 'mid' : cur === 'mid' ? 'full' : 'peek');
  };

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-30 flex flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] md:hidden"
      animate={{ height }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      // L-naver-2026bottomsheet2: dragListener=false + dragControls.start(handle) →
      //   드래그는 핸들 버튼에서만 시작. ListPanel 은 native scroll 정상 동작.
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.15}
      onDragEnd={handleDragEnd}
    >
      {/* Drag handle + 헤더 (peek 영역, 72px). 핸들에서만 드래그 시작. */}
      <button
        type="button"
        onPointerDown={(e) => dragControls.start(e)}
        onClick={cycleSnap}
        aria-label={`매물 리스트 ${snap === 'peek' ? '펼치기' : snap === 'mid' ? '더 펼치기' : '접기'}`}
        // touch-action: none — 핸들 영역에서 브라우저 기본 스크롤/zoom 방지
        style={{ touchAction: 'none' }}
        className="flex h-[72px] shrink-0 flex-col items-center justify-center gap-1.5 px-4 active:bg-neutral-50"
      >
        <div className="h-1 w-12 rounded-full bg-neutral-300" />
        <div className="text-[14px] font-bold text-neutral-900">
          {clusterFilterIds && clusterFilterIds.length > 0
            ? `선택한 ${headerCount}개 매물`
            : `${headerCount.toLocaleString()}개 매물`}
        </div>
      </button>

      {/* SumBox (mid+ 에서만) */}
      {snap !== 'peek' && (
        <div className="shrink-0 border-y border-neutral-100 bg-white px-3 py-2">
          <SumBox compact />
        </div>
      )}

      {/* ListPanel — 시트 내부 native overflow scroll 정상 동작 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ListPanel />
      </div>
    </motion.div>
  );
}
