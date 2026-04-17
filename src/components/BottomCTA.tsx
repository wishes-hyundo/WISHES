'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 하단 CTA (우측 컴팩트 필러 형태로 개선)
// - 기존: 전체 폭 bar → 콘텐츠(카드·페이지네이션) 가림 문제
// - 개선: 좌측 하단 작은 pill, 챗봇(우측)과 분리, 모바일에서도 카드 가리지 않음
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function BottomCTA() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // 이미 닫은 경우 표시하지 않음 (세션 단위)
    const wasDismissed = sessionStorage.getItem('wishes_cta_dismissed');
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    const handleScroll = () => {
      // 페이지 40% 이상 스크롤 시 표시
      const h = document.body.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      const scrollPercent = window.scrollY / h;
      setShow(scrollPercent > 0.4);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('wishes_cta_dismissed', 'true');
  };

  if (dismissed || !show) return null;

  // 컴팩트 pill (모바일에서도 우측 챗봇과 겹치지 않도록 좌측 하단)
  return (
    <div className={cn(
      // 모바일: 하단 5탭 네비 위로 띄우기 (mobile-nav-offset 유틸리티가 bottom 재정의)
      'fixed bottom-5 left-4 z-[80] animate-fade-in-up mobile-nav-offset',
      'md:bottom-6 md:left-6'
    )}>
      {expanded ? (
        <div className="bg-gradient-to-r from-wishes-primary to-wishes-secondary rounded-2xl shadow-2xl p-3 flex items-center gap-3 max-w-sm">
          <div className="flex-1 min-w-0 pr-1">
            <p className="text-white font-bold text-xs leading-tight">
              원하시는 매물을 못 찾으셨나요?
            </p>
            <p className="text-white/70 text-[10px] mt-0.5 leading-tight">
              전담 상담사가 맞춤 매물을 찾아드립니다
            </p>
          </div>
          <Link
            href="/contact"
            className="shrink-0 flex items-center gap-1 px-3 py-2 bg-white text-wishes-primary font-bold text-xs rounded-lg hover:bg-wishes-cream transition-colors shadow-md"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            무료 상담
          </Link>
          <button
            onClick={() => setExpanded(false)}
            className="shrink-0 p-1 text-white/60 hover:text-white transition-colors"
            aria-label="축소"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          onDoubleClick={handleDismiss}
          aria-label="매물 찾기 도움 받기"
          className="group flex items-center gap-2 pl-3 pr-4 py-3 bg-gradient-to-r from-wishes-primary to-wishes-secondary text-white rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
            <MessageSquare className="w-3.5 h-3.5" />
          </span>
          <span className="text-xs font-bold whitespace-nowrap">맞춤 매물 상담</span>
        </button>
      )}
    </div>
  );
}
