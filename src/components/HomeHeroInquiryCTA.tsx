'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HomeHeroInquiryCTA — 홈 히어로 "매물 맞춤 의뢰" CTA
//
//   /contact 페이지로 라우팅하는 대신 InquiryModal 오버레이를
//   띄워 리드 캡처 이탈률을 줄인다 (#20 10차 마무리분).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState } from 'react';
import { Home } from 'lucide-react';
import InquiryModal from './InquiryModal';

export default function HomeHeroInquiryCTA() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors border-b border-white/30 hover:border-white pb-0.5"
        aria-label="매물 맞춤 의뢰 — 상담 문의 모달 열기"
      >
        <Home className="w-4 h-4" aria-hidden="true" />
        매물 맞춤 의뢰
      </button>

      <InquiryModal
        open={open}
        onClose={() => setOpen(false)}
        context="consultation"
        source="home_hero"
      />
    </>
  );
}
