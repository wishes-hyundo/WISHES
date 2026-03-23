import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-navy-800 text-white">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">W</span>
              </div>
              <div>
                <span className="text-white font-bold text-lg">WISHES</span>
                <span className="text-white/50 text-xs block">위시스부동산중개법인</span>
              </div>
            </div>
            <p className="text-white/60 text-sm leading-relaxed">
              서울 관악구 신림동 전문 부동산 중개법인.<br />
              15년 경력의 신뢰할 수 있는 중개서비스를 제공합니다.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm">매물 검색</h3>
            <ul className="space-y-2">
              {['전세', '월세', '매매', '전체매물'].map((item) => (
                <li key={item}>
                  <Link href={`/listings?deal=${item === '전체매물' ? '' : item}`} className="text-white/60 text-sm hover:text-white transition-colors">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm">회사</h3>
            <ul className="space-y-2">
              {[
                { href: '/about', label: '회사소개' },
                { href: '/contact', label: '상담문의' },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-white/60 text-sm hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm">연락처</h3>
            <ul className="space-y-3 text-sm text-white/60">
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 text-brand-accent flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
                <a href="tel:1533-9580" className="hover:text-white transition-colors">1533-9580</a>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 text-brand-accent flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                <a href="mailto:wishes@wishes.co.kr" className="hover:text-white transition-colors">wishes@wishes.co.kr</a>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 text-brand-accent flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <span>서울 관악구 신림로64길 23, 8층</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/40">
          <p>&copy; {new Date().getFullYear()} 주식회사 위시스부동산중개법인. All rights reserved.</p>
          <div className="flex gap-4">
            <span>사업자등록번호: 445-86-01981</span>
            <span>대표이사: 전유진</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
