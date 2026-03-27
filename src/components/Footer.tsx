'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-wishes-primary text-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* 상단: 로고 + 네비 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-wishes-secondary to-wishes-accent rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">WISHES</span>
          </div>

          <nav className="flex flex-wrap justify-center gap-6 text-sm text-white/50">
            {[
              { label: '매물검색', href: '/listings' },
              { label: '지도검색', href: '/map' },
              { label: '회사소개', href: '/about' },
              { label: '상담문의', href: '/contact' },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-white transition-colors">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* 구분선 */}
        <div className="border-t border-white/10" />

        {/* 사업자 정보 */}
        <div className="pt-8 pb-6 text-xs text-white/40 text-center md:text-left space-y-1">
          <p>주식회사 위시스부동산중개법인 | 대표자: 전유진</p>
          <p>사업자등록번호: 445-86-01981 | 중개사무소 등록번호: 제 11620-2021-00078 호</p>
          <p>서울특별시 관악구 신림로64길 23, 8층 | wishes@wishes.co.kr | 평일 09:00 – 19:00</p>
        </div>

        {/* 구분선 */}
        <div className="border-t border-white/10" />

        {/* 하단: 저작권 + 개인정보처리방침 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 text-xs text-white/30">
          <p>© 2026 WISHES. All rights reserved.</p>
          <Link href="/privacy" className="hover:text-white/60 transition-colors">
            개인정보처리방침
          </Link>
        </div>
      </div>
    </footer>
  );
}
