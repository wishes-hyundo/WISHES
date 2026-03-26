import Link from 'next/link';
import { MapPin, Mail, Clock, MapIcon, BookOpen, Instagram } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-wishes-primary text-white relative overflow-hidden">
      {/* 배경 패턴 */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-8">
        {/* 상단 CTA */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-12 mb-12 border-b border-white/[0.06]">
          <div>
            <h3 className="text-xl md:text-2xl font-bold mb-2">부동산 전문 상담이 필요하신가요?</h3>
            <p className="text-white/40 text-sm">전문가가 최적의 매물을 찾아드립니다</p>
          </div>
          <Link
            href="/contact"
            className="btn-accent text-sm px-8 py-3.5 whitespace-nowrap"
          >
            무료 상담 신청
          </Link>
        </div>

        {/* 메인 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12 mb-12">
          {/* 브랜드 */}
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-wishes-secondary to-wishes-accent flex items-center justify-center" style={{ borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%' }}>
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">WISHES</span>
            </div>
            <p className="text-[13px] text-white/40 leading-relaxed">
              서울·경기 전 지역<br />
              최고의 부동산 서비스를<br />
              제공합니다.
            </p>
            <div className="flex gap-2">
              <a href="#" className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-wishes-accent/20 flex items-center justify-center transition-all duration-300" aria-label="Blog">
                <BookOpen className="w-4 h-4 text-white/50" />
              </a>
              <a href="#" className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-wishes-accent/20 flex items-center justify-center transition-all duration-300" aria-label="Instagram">
                <Instagram className="w-4 h-4 text-white/50" />
              </a>
            </div>
          </div>

          {/* 메뉴 */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold text-wishes-accent/60 uppercase tracking-widest">메뉴</h3>
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
                    className="text-[13px] text-white/45 hover:text-wishes-accent transition-colors duration-200"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 서비스 */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold text-wishes-accent/60 uppercase tracking-widest">서비스</h3>
            <ul className="space-y-2.5">
              {[
                { label: '원룸 / 투룸', href: '/listings?type=원룷' },
                { label: '아파트', href: '/listings?type=아파트' },
                { label: '오피스텔', href: '/listings?type=오피스텔' },
                { label: '전세 / 월세', href: '/listings' },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-[13px] text-white/45 hover:text-wishes-accent transition-colors duration-200"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 연락처 */}
          <div className="space-y-5">
            <h3 className="text-xs font-semibold text-wishes-accent/60 uppercase tracking-widest">연락처</h3>
            <ul className="space-y-4 text-[13px]">
              <li className="flex items-start gap-3">
                <MapIcon className="w-4 h-4 text-wishes-accent/40 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="text-white/60">서울특별시 관악구</p>
                  <p className="text-white/60">신림로64길 23, 8층</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-wishes-accent/40 shrink-0 mt-0.5" />
                <a href="mailto:wishes@wishes.co.kr" className="text-white/60 hover:text-wishes-accent transition-colors">
                  wishes@wishes.co.kr
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-wishes-accent/40 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="text-white/60">평일 09:00 – 19:00</p>
                  <p className="text-white/35 text-xs">주말 예약상담</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* 하단 */}
        <div className="border-t border-white/[0.06] pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-1 text-[11px] text-white/25">
              <span>WISHES Corp.</span>
              <span>사업자등록번호 445-86-01981</span>
              <span>서울특별시 중개사협회</span>
            </div>
            <p className="text-[11px] text-white/20">
              &copy; {currentYear} WISHES Corp. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
