'use client';

import { useState, useEffect } from 'react';
import { ArrowUp, Phone, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FloatingButtons() {
  const [showScrollTop, setShowScrollTop] = useState(false);

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
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
      {/* 스크롤 맨 위 */}
      <button
        onClick={scrollToTop}
        className={cn(
          'w-12 h-12 rounded-full bg-gray-700 text-white flex items-center justify-center shadow-lg hover:bg-gray-600 transition-all',
          showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        )}
        aria-label="맨 위로"
      >
        <ArrowUp className="w-5 h-5" />
      </button>

      {/* 전화 */}
      <a
        href="tel:1533-9580"
        className="w-12 h-12 rounded-full bg-wishes-primary text-white flex items-center justify-center shadow-lg hover:bg-wishes-secondary transition-colors"
        aria-label="전화하기"
      >
        <Phone className="w-5 h-5" />
      </a>

      {/* 카카오톡 */}
      <a
        href={process.env.NEXT_PUBLIC_KAKAO_CHANNEL || 'https://pf.kakao.com/_xnxaxjxj'}
        target="_blank"
        rel="noopener noreferrer"
        className="w-12 h-12 rounded-full bg-yellow-400 text-yellow-900 flex items-center justify-center shadow-lg hover:bg-yellow-300 transition-colors"
        aria-label="카카오톡 상담"
      >
        <MessageCircle className="w-5 h-5" />
      </a>
    </div>
  );
}
