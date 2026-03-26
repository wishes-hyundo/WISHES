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
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={cn(
      'fixed right-6 flex flex-col gap-3 z-50 transition-all duration-300',
      hasCompareItems ? 'bottom-20' : 'bottom-6'
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
