'use client';

import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFavorites } from '@/contexts/FavoritesContext';

export function FloatingButtons() {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const { compareList } = useFavorites();
  const hasCompareItems = compareList.length > 0;

  useEffect(() => {
    // L-perf6 (2026-04-22): { passive: true } 추가 — Lighthouse "Does not use passive
    // listeners" 경고 해소 + iOS Safari 스크롤 jank 감소. setState 는 preventDefault
    // 불필요. rAF throttle 로 60fps 면으로 과도한 리렌더 억제.
    let raf = 0;
    let lastShow = false;
    const handleScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = window.scrollY > 300;
        if (next !== lastShow) {
          lastShow = next;
          setShowScrollTop(next);
        }
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={cn(
      // 모바일에서는 mobile-nav-offset 으로 하단 네비 위로 올림
      'fixed right-6 flex flex-col gap-3 z-50 transition-all duration-300 mobile-nav-offset',
      hasCompareItems ? 'bottom-36' : 'bottom-24'
    )}>
      {/* 스크롤 맨 위 */}
      <button
        onClick={scrollToTop}
        className={cn(
          'w-11 h-11 rounded-full bg-wishes-primary/80 text-white flex items-center justify-center shadow-lg backdrop-blur-sm hover:bg-wishes-primary transition-all',
          showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        )}
        aria-label="맨 위로"
      >
        <ArrowUp className="w-5 h-5" />
      </button>
    </div>
  );
}
