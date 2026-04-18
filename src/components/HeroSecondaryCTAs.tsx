'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Award, Sparkles } from 'lucide-react';
import InquiryModal from '@/components/InquiryModal';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 히어로 보조 CTA (클라이언트 래퍼)
// - 서버 컴포넌트인 page.tsx에서 InquiryModal(클라이언트 훅 사용)을 직접 호출할 수 없어 분리
// - "매물 맞춤 의뢰"는 /contact 이동 대신 통합 문의 모달로 연결 (네모 벤치마크 = 단일 리드 퍼널)
// - #35: 네모 스타일 — 주 CTA 를 빨간 pill 로 승격, 부 CTA 는 언더라인 링크 유지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function HeroSecondaryCTAs() {
  const [inquiryOpen, setInquiryOpen] = useState(false);

  const subLinkClass =
    'inline-flex items-center gap-1.5 text-sm text-white/75 hover:text-white transition-colors border-b border-white/25 hover:border-white pb-0.5';

  return (
    <>
      <div className="flex flex-col items-center gap-4 pt-2">
        {/* 주 CTA — 네모 스타일 빨간 pill (#35) */}
        <button
          type="button"
          onClick={() => setInquiryOpen(true)}
          className="group relative inline-flex items-center gap-2 px-7 py-3.5 bg-wishes-secondary hover:bg-wishes-primary text-white font-bold text-sm md:text-base rounded-full shadow-xl shadow-wishes-secondary/30 hover:shadow-wishes-secondary/40 transition-all active:scale-[0.98]"
          aria-label="맞춤 매물 의뢰하기"
        >
          <Sparkles className="w-4 h-4" />
          <span>내게 딱 맞는 매물 의뢰</span>
          <span className="inline-flex items-center px-2 py-0.5 ml-1 rounded-full bg-white/20 text-[10px] font-semibold tracking-wider">무료</span>
        </button>

        {/* 부 CTA — 링크 */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {/* '전체 매물 보기'(/listings)는 지도검색(/map)과 중복이라 제거 — /map이 유일 진입점 */}
          <Link href="/map" className={subLinkClass}>
            <MapPin className="w-4 h-4" />
            지도에서 매물 찾기
          </Link>
          <span className="text-white/25">·</span>
          <Link href="/calculator" className={subLinkClass}>
            <Award className="w-4 h-4" />
            대출 계산기
          </Link>
        </div>
      </div>

      <InquiryModal
        open={inquiryOpen}
        onClose={() => setInquiryOpen(false)}
        context="consultation"
        source="/"
        titleOverride="맞춤 매물 의뢰"
      />
    </>
  );
}
