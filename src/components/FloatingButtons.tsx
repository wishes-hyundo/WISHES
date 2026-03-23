'use client';

import { useState, useEffect } from 'react';

export default function FloatingButtons() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowTop(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed bottom-6 right-4 sm:right-6 z-40 flex flex-col items-center gap-3">
      {/* TOP Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`w-11 h-11 bg-white text-navy-800 rounded-full shadow-lg border border-gray-200 flex items-center justify-center hover:bg-brand-secondary hover:text-white hover:border-brand-secondary transition-all duration-300 ${
          showTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label="맨 위로"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Phone */}
      <a
        href="tel:1533-9580"
        className="w-12 h-12 sm:w-14 sm:h-14 bg-navy-800 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 hover:shadow-2xl transition-all"
        title="전화 상담"
      >
        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
        </svg>
      </a>

      {/* KakaoTalk */}
      <a
        href="https://pf.kakao.com/_xnxaxjxj"
        target="_blank"
        rel="noopener noreferrer"
        className="w-12 h-12 sm:w-14 sm:h-14 bg-[#FEE500] text-[#3C1E1E] rounded-full shadow-xl flex items-center justify-center hover:scale-110 hover:shadow-2xl transition-all"
        title="카카오톡 상담"
      >
        <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="0 0 256 256" fill="#3C1E1E">
          <path d="M128 36C70.6 36 24 72.2 24 116.8c0 28.4 18.6 53.4 46.8 68l-9.6 35.2c-.8 3 2.4 5.6 5.2 4l42-27.2c6.4 1.2 13 1.8 19.6 1.8 57.4 0 104-36.2 104-80.8S185.4 36 128 36z"/>
        </svg>
      </a>
    </div>
  );
}
