'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StickyLeadCTA — 모바일 매물 상세 전용 하단 플로팅 리드 CTA (#33)
//
//   목적: 매물 상세에서 사이드바 sticky 문의 카드가 모바일에선 숨겨지므로
//         스크롤 중에도 "이 매물 문의하기" 진입점을 항상 제공.
//   #45: 방문 예약 CTA 를 같은 바 안에 병치 — 두 개의 액션을 병행 제공
//   동작: 모바일에서만 노출 (md:hidden) · 스크롤 200px 이후 슬라이드 업
//         · MobileBottomNav 위에 겹치지 않도록 bottom-[64px] + safe-area
//   범위: /listings/[id] 상세 페이지 전용 (BottomCTA 와 중복 방지)
//         다른 페이지에서는 렌더 안 함.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, Calendar, ChevronUp } from 'lucide-react';
import InquiryModal, { type InquiryContext } from './InquiryModal';
import VisitBookingModal from './VisitBookingModal';

type CTAConfig = {
  label: string;
  context: InquiryContext;
  listingId?: number | null;
};

function resolveCTA(pathname: string): CTAConfig | null {
  if (!pathname) return null;

  // /listings/123 상세 페이지 전용 (BottomCTA 와 중복 방지)
  const detailMatch = pathname.match(/^\/listings\/(\d+)(?:\/|$)/);
  if (detailMatch) {
    return {
      label: '문의',
      context: 'listing',
      listingId: Number(detailMatch[1]),
    };
  }
  return null;
}

function StickyLeadCTAInner() {
  const pathname = usePathname() || '/';
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // 모바일 기준 200px 이후부터 노출 (데스크톱은 md:hidden 로 어차피 숨김)
      setVisible(window.scrollY > 200);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const config = resolveCTA(pathname);
  if (!config) return null;

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <div
        aria-hidden={!visible}
        className={`md:hidden fixed left-0 right-0 z-40 px-3 pointer-events-none transition-all duration-300 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}
        style={{
          // MobileBottomNav 높이(약 56px) + 여유 8px
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)',
        }}
      >
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setVisitOpen(true)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-12 rounded-full bg-white border border-wishes-secondary/40 text-wishes-secondary font-bold text-sm shadow-md active:scale-[0.98] transition-transform"
          >
            <Calendar className="w-4 h-4" />
            <span>방문 예약</span>
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-12 rounded-full bg-wishes-secondary text-white font-bold text-sm shadow-lg shadow-wishes-secondary/30 active:scale-[0.98] transition-transform"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{config.label}</span>
          </button>
          <button
            type="button"
            onClick={handleScrollTop}
            aria-label="맨 위로"
            className="shrink-0 w-12 h-12 rounded-full bg-white/95 backdrop-blur border border-gray-200 shadow-md flex items-center justify-center text-gray-600 active:scale-[0.95] transition-transform"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      </div>

      <InquiryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        context={config.context}
        listingId={config.listingId ?? null}
        source={`sticky-cta:${pathname}`}
      />

      <VisitBookingModal
        open={visitOpen}
        onClose={() => setVisitOpen(false)}
        listingId={config.listingId ?? null}
        source={`sticky-cta-visit:${pathname}`}
      />
    </>
  );
}

export default function StickyLeadCTA() {
  return (
    <Suspense fallback={null}>
      <StickyLeadCTAInner />
    </Suspense>
  );
}
