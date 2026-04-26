// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MobileListSheet — 모바일 하단 슬라이드 시트
//
// L-naver-2026bottomsheet1 (2026-04-27): BoB 모바일 UX.
//   사용자 요청: "모바일을 더 많이 사용하니 비중으로 보면 모바일을 더 많이 사용".
//   네이버/직방 표준: 모바일 매물 리스트는 하단 시트 (지도 영역 최대 확보).
//
// 동작:
//   · 3-snap: peek (72px, 헤더만) / mid (50vh) / full (90vh)
//   · 드래그 핸들 + 클릭 토글
//   · framer-motion drag + spring snap (자연스러운 모션)
//   · 데스크탑(md+)에선 hidden — 좌측 사이드바 그대로
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { useMap2026Store } from '../store';
import { ListPanel } from './ListPanel';
import { SumBox } from './SumBox';

type SnapKey = 'peek' | 'mid' | 'full';

const SNAP_POINTS: Record<SnapKey, (vh: number) => number> = {
  peek: () => 72,            // 헤더만
  mid:  (vh) => vh * 0.5,    // 50vh
  full: (vh) => vh * 0.9,    // 90vh
};

function getSnapHeight(key: SnapKey): number {
  if (typeof window === 'undefined') return 72;
  const vh = window.innerHeight;
  return SNAP_POINTS[key](vh);
}

function nearestSnap(currentHeight: number): SnapKey {
  if (typeof window === 'undefined') return 'mid';
  const vh = window.innerHeight;
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
  const [vh, setVh] = useState<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const listingsLength = useMap2026Store((s) => s.listings.length);
  const clusterFilterIds = useMap2026Store((s) => s.clusterFilterIds);
  const filterCategory = useMap2026Store((s) => s.filter.category);
  const categoryCounts = useMap2026Store((s) => s.categoryCounts);

  useEffect(() => {
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

  const height = SNAP_POINTS[snap](vh);
  const headerCount = clusterFilterIds && clusterFilterIds.length > 0
    ? clusterFilterIds.length
    : (listingsLength > 0 ? listingsLength : (categoryCounts?.[filterCategory] ?? 0));

  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    // 현재 height 에서 drag offset 빼서 새 height 계산
    const draggedHeight = height - info.offset.y;
    // velocity 기반 가속 (빠르게 드래그하면 더 멀리)
    const projected = draggedHeight - info.velocity.y * 0.15;
    const next = nearestSnap(projected);
    setSnap(next);
  };

  const cycleSnap = () => {
    setSnap((cur) => cur === 'peek' ? 'mid' : cur === 'mid' ? 'full' : 'peek');
  };

  return (
    <motion.div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-30 flex flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] md:hidden"
      animate={{ height }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      style={{ touchAction: 'none' }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.15}
      onDragEnd={handleDragEnd}
    >
      {/* Drag handle + 헤더 (peek 영역, 72px) */}
      <button
        onClick={cycleSnap}
        aria-label={`매물 리스트 ${snap === 'peek' ? '펼치기' : snap === 'mid' ? '더 펼치기' : '접기'}`}
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

      {/* ListPanel — 시트 내부 스크롤 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ListPanel />
      </div>
    </motion.div>
  );
}
