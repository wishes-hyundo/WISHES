import Link from 'next/link';
import { MapPin, Mail, Clock, MapIcon, BookOpen, Instagram } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative bg-gradient-to-br from-wishes-primary via-wishes-primary to-wishes-secondary text-white">
      {/* 배경 장식 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-wishes-accent/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-wishes-secondary/5 rounded-full blur-3xk"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 py-16">
        {/* 메인 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* 브랜드 정보 */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-wishes-accent to-wishes-gold flex items-center justify-center">
                <MapPin className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold">WISHES</p>
                <p className="text-xs text-white/60">위시스부동산</p>
              </div>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">
              15년의 경험과 신뢰로<br />
              서울·경기 전 지역<br />
              최고의 부동산 서비스를<br />
              제공하고 있습니다.
            </p>
            {/* 소셜 링크 */}
            <div className="flex gap-3 pt-2">
              <a href="#" className="w-10 h-10 rounded-lg bg-white/10 hover:bg-wishes-accent/20 flex items-center justify-center transition-colors" aria-label="Kakao">
                <span className="text-xs font-bold">카</span>
              </a>
              <a href="#" className="w-10 h-10 rounded-lg bg-white/10 hover:bg-wishes-accent/20 flex items-center justify-center transition-colors" aria-label="Blog">
                <BookOpen className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-lg bg-white/10 hover:bg-wishes-accent/20 flex items-center justify-center transition-colors" aria-label="Instagram">
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* 빠른 링크 */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-white/90 uppercase tracking-wider">빠른 링크</h3>
            <ul className="space-y-3 text-sm">
              {[
                { label: '매물검색', href: '/listings' },
                { label: '지도검색', href: '/map' },
                { label: '회사소개', href: '/about' },
                { label: '상담문의', href: '/contact' },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-white/70 hover:text-wishes-accent transition-colors duration-200 inline-flex items-center group"
                  >
                    <span className="w-1 h-1 rounded-full bg-wishes-accent mr-2 opacity-0 group-hover:opacity-100 transition-opacity"></span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 서비스 */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-white/90 uppercase tracking-wider">서비스</h3>
            <ul className="space-y-3 text-sm">
              {[
                { label: '원룸/투룸', href: '#' },
                { label: '아파트', href: '#' },
                { label: '오피스텔', href: '#' },
                { label: '전세/월세', href: '#' },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-white/70 hover:text-wishes-accent transition-colors duration-200 inline-flex items-center group"
                  >
                    <span className="w-1 h-1 rounded-full bg-wishes-accent mr-2 opacity-0 group-hover:opacity-100 transition-opacity"></span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 연락처 */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-white/90 uppercase tracking-wider">연락처</h3>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3 group cursor-pointer">
                <MapIcon className="w-5 h-5 text-wishes-accent shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div className="leading-relaxed">
                  <p className="text-white/60 text-xs">주소</p>
                  <p className="text-white">서울특별시 관악구<br />신림로64길 23, 8층</p>
                </div>
              </li>
              <li className="flex items-start gap-3 group cursor-pointer">
                <Mail className="w-5 h-5 text-wishes-accent shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div className="leading-relaxed">
                  <p className="text-white/60 text-xs">이메일</p>
                  <a href="mailto:wishes@wishes.co.kr" className="text-white hover:text-wishes-accent">
                    wishes@wishes.co.kr
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 group cursor-pointer">
                <Clock className="w-5 h-5 text-wishes-accent shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div className="leading-relaxed">
                  <p className="text-white/60 text-xs">운영시간</p>
                  <p className="text-white">평일 09:00~19:00<br />(주말 예약상담)</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-white/10 py-8">
          {/* 회사 정보 */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 mb-8">
            <div className="text-center">
              <p className="text-xs text-white/60 mb-1">회사명</p>
              <p className="text-sm text-white font-medium">WISHES Corp.</p>
            </div>
            <div className="hidden sm:block w-px h-8 bg-white/20"></div>
            <div className="text-center">
              <p className="text-xs text-white/60 mb-1">사업자등록번호</p>
              <p className="text-sm text-white font-medium">445-86-01981</p>
            </div>
          </div>

          {/* 저작권 */}
          <div className="text-center text-xs text-white-50">
            <p>&copy; {currentYear} WISHES Corp. All rights reserved.</p>
            <p className="mt-2">서울특별시 중개사협회 | 공인중개사 신고번호</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
