import Link from 'next/link';
import { MapPin, Mail, Clock, MapIcon, BookOpen, Instagram } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0c1220] text-white">
      <div className="max-w-7xl mx-auto px-4 pt-16 pb-8">
        {/* 메인 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12 mb-12">
          {/* 브랜드 정보 */}
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-wishes-secondary to-wishes-accent flex items-center justify-center">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-base font-bold tracking-wide">WISHES</p>
                <p className="text-[11px] text-white/40">Real Estate</p>
              </div>
            </div>
            <p className="text-[13px] text-white/45 leading-relaxed">
              15년의 경험과 싨뢰로<br />
              서울·경기 전 지역 최고의<br />
              부동산 서비스를 제공합니다.
            </p>
            {/* 소셜 링크 */}
            <div className="flex gap-2">
              <a href="#" className="w-9 h-9 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors" aria-label="Blog">
                <BookOpen className="w-4 h-4 text-white/60" />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors" aria-label="Instagram">
                <Instagram className="w-4 h-4 text-white/60" />
              </a>
            </div>
          </div>

          {/* 빠른 링크 */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest">메뉴</h3>
            <ul className="space-y-2.5">
              {[
                { label: '매물검색', href: '/listings' },
                { label: '지도검색', href: '/map' },
                { label: '회사소개', href: '/about' },
                { label: '상담문의', href: '/contact' },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[13px] text-white/50 hover:text-white transition-colors duration-200"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 서비스 */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest">서비스</h3>
            <ul className="space-y-2.5">
              {[
                { label: '원룸 / 투룸', href: '#' },
                { label: '아파트', href: '#' },
                { label: '오피스텔', href: '#' },
                { label: '전세 / 월세', href: '#' },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-[13px] text-white/50 hover:text-white transition-colors duration-200"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 연락처 */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-widest">연락처</h3>
            <ul className="space-y-4 text-[13px]">
              <li className="flex items-start gap-3">
                <MapIcon className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="text-white/70">서울특별시 관악구</p>
                  <p className="text-white/70">신림로64길 23, 8층</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
                <a href="mailto:wishes@wishes.co.kr" className="text-white/70 hover:text-white transition-colors">
                  wishes@wishes.co.kr
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="text-white/70">평일 09:00 – 19:00</p>
                  <p className="text-white/40 text-xs">주말 예약상담</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* 하단 */}
        <div className="border-t border-white/[0.06] pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-1 text-[11px] text-white/30">
              <span>WISHES Corp.</span>
              <span>사업자등록번호 445-86-01981</span>
              <span>서울특별시 중개사협회</span>
            </div>
            <p className="text-[11px] text-white/25">
              &copy; {currentYear} WISHES Corp. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
