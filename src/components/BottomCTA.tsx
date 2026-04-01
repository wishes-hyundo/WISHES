'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomCTA() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 이미 닫은 경우 표시하지 않음 (세션 단위)
    const wasDismissed = sessionStorage.getItem('wishes_cta_dismissed');
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    const handleScroll = () => {
      // 페이지 40% 이상 스크롤 시 표시
      const scrollPercent = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      setShow(scrollPercent > 0.4);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('wishes_cta_dismissed', 'true');
  };

  if (dismissed || !show) return null;

  return (
    <div className={cn(
      'fixed bottom-0 left-0 right-0 z-[90] p-4 animate-fade-in-up',
      'pointer-events-none'
    )}>
      <div className="max-w-lg mx-auto bg-gradient-to-r from-wishes-primary to-wishes-secondary rounded-2xl shadow-2xl p-4 pointer-events-auto">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">
              원하시는 매물을 못 찾으셨나요?
            </p>
            <p className="text-white/70 text-xs mt-0.5">
              전문 상담사가 맞춤 매물을 찾아드립니다
            </p>
          </div>
          <Link
            href="/contact"
            className="shrink-0 flex items-center gap-1.5 px-5 py-2.5 bg-white text-wishes-primary font-bold text-sm rounded-xl hover:bg-wishes-cream transition-colors shadow-md"
          >
            <MessageSquare className="w-4 h-4" />
            무료 상담
          </Link>
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1.5 text-white/60 hover:text-white transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
