'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-wishes-primary text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 상단: 로고 + 네비 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-wishes-secondary to-wishes-accent rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-tight">WISHES</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-4 text-xs text-white/50">
            {[
              { label: '매물검색', href: '/listings' },
              { label: '지도검색', href: '/map' },
              { label: '회사소개', href: '/about' },
              { label: '상담문의', href: '/contact' },
              { label: 'FAQ', href: '/faq' },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-white transition-colors">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="border-t border-white/10" />

        {/* 하단: 정보 + 저작권 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-4 text-xs text-white/30">
          <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3">
            <span>서울특별시 관악구 신림로64길 23, 8층</span>
            <span className="hidden md:inline text-white/15">|</span>
            <span>wishes@wishes.co.kr</span>
            <span className="hidden md:inline text-white/15">|</span>
            <span>평일 09:00 – 19:00</span>
          </div>
          <span>© 2026 WISHES. All rights reserved.</span>
        </div>

        {/* 사업자 정보 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-1 pt-2 text-[10px] text-white/20">
          <span>(주)위시스부동산중개법인 | 대표 전유진 | 사업자등록번호 445-86-01981 | 중개사무소등록 제11620-2021-00078호</span>
          <Link href="/privacy" className="hover:text-white/40 transition-colors">개인정보처리방침</Link>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
