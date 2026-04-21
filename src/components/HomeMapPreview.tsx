'use client';

import Link from 'next/link';
import { MapPin } from 'lucide-react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 히어로 우측 지도 프리뷰
// /map 허브를 시각적으로 암시. 정적 SVG + 떠있는 가격 버블.
// 카카오맵 로드 오버헤드 없이 "이런 느낌이에요" 전달.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SAMPLE_PINS = [
  { top: '22%', left: '18%', deal: '월세', price: '1000/60', tone: 'orange' },
  { top: '36%', left: '58%', deal: '전세', price: '2.8억', tone: 'blue' },
  { top: '58%', left: '34%', deal: '매매', price: '9.2억', tone: 'green' },
  { top: '72%', left: '68%', deal: '월세', price: '500/45', tone: 'orange' },
  { top: '18%', left: '72%', deal: '전세', price: '1.5억', tone: 'blue' },
];

const TONES: Record<string, { bg: string; text: string; badge: string }> = {
  // L-a11y2 (2026-04-21): 배지 bg 를 -500 → -700 로 상향. 8px 흰 글자 대비
  //   orange-500: 2.80:1 → orange-700: 5.68:1 (AA 통과)
  //   blue-500:   3.67:1 → blue-700:   7.35:1
  //   emerald-500:2.53:1 → emerald-700:5.30:1
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-700' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-700' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-700' },
};

export default function HomeMapPreview() {
  return (
    <Link
      href="/map"
      className="block group relative aspect-[4/5] w-full max-w-sm mx-auto rounded-3xl overflow-hidden shadow-2xl border border-white/20"
      aria-label="실시간 지도 검색 — 지도에서 매물 찾기"
    >
      {/* 지도 배경 레이어 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#E8F5E9] via-[#F1F8E9] to-[#E8F5E9]">
        {/* 도로 느낌 그리드 */}
        <svg className="w-full h-full opacity-40" viewBox="0 0 200 250" preserveAspectRatio="none">
          <defs>
            <pattern id="road" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#A5D6A7" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="200" height="250" fill="url(#road)" />
          {/* 주요 도로 */}
          <path d="M 0 80 Q 60 70 100 90 T 200 85" stroke="#C8E6C9" strokeWidth="6" fill="none" />
          <path d="M 30 0 L 40 130 L 50 250" stroke="#C8E6C9" strokeWidth="5" fill="none" />
          <path d="M 120 0 L 130 120 L 125 250" stroke="#C8E6C9" strokeWidth="4" fill="none" />
          <path d="M 0 180 Q 80 170 140 185 T 200 180" stroke="#C8E6C9" strokeWidth="5" fill="none" />
          {/* 물 */}
          <ellipse cx="170" cy="40" rx="35" ry="18" fill="#BBDEFB" opacity="0.7" />
          {/* 공원 */}
          <ellipse cx="60" cy="200" rx="22" ry="16" fill="#A5D6A7" opacity="0.8" />
        </svg>
      </div>

      {/* 가격 버블 마커들 */}
      {SAMPLE_PINS.map((pin, i) => {
        const t = TONES[pin.tone];
        return (
          <div
            key={i}
            className={`absolute ${t.bg} ${t.text} border-2 border-current rounded-full px-2.5 py-1 text-[10px] font-bold shadow-lg flex items-center gap-1 whitespace-nowrap animate-bounce-soft`}
            style={{
              top: pin.top,
              left: pin.left,
              transform: 'translate(-50%, -100%)',
              animationDelay: `${i * 0.3}s`,
            }}
          >
            <span className={`${t.badge} text-white px-1 py-[1px] rounded text-[8px] font-semibold`}>
              {pin.deal}
            </span>
            {pin.price}
          </div>
        );
      })}

      {/* 하단 CTA 캡션 */}
      <div className="absolute left-0 right-0 bottom-0 p-4 bg-gradient-to-t from-white/95 via-white/80 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-wishes-primary/10 flex items-center justify-center">
              <MapPin className="w-4.5 h-4.5 text-wishes-primary" />
            </div>
            <div>
              <p className="text-xs font-bold text-wishes-primary">실시간 지도 검색</p>
              <p className="text-[10px] text-wishes-muted">클릭하면 전체 지도로 이동</p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-wishes-primary text-white flex items-center justify-center group-hover:translate-x-1 transition-transform">
            →
          </div>
        </div>
      </div>

      {/* 주변 hover 글로우 */}
      <div className="absolute inset-0 ring-2 ring-transparent group-hover:ring-wishes-accent/40 group-hover:scale-[1.02] transition-all duration-300 pointer-events-none rounded-3xl" />
    </Link>
  );
}
