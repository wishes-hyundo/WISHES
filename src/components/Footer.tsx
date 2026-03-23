import Link from 'next/link';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-wishes-primary text-white">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* 브랜드 */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-6 h-6 text-blue-300" />
              <span className="text-xl font-bold">WISHES</span>
            </div>
            <p className="text-sm text-blue-200 leading-relaxed">
              서울 관악구 신림동·봉천동 지역 전문<br />
              위시스부동산중개법인이<br />
              고객님의 소중한 보금자리를 찾아드립니다.
            </p>
          </div>

          {/* 빠른 링크 */}
          <div>
            <h3 className="text-sm font-semibold mb-4 text-blue-200">빠른 링크</h3>
            <ul className="space-y-2 text-sm">
              {[
                { label: '매물검색', href: '/listings' },
                { label: '지도검색', href: '/map' },
                { label: '회사소개', href: '/about' },
                { label: '상담문의', href: '/contact' },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-blue-200 hover:text-white transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 회사 정보 */}
          <div>
            <h3 className="text-sm font-semibold mb-4 text-blue-200">회사 정보</h3>
            <ul className="space-y-2 text-sm text-blue-200">
              <li>(주)위시스부동산중개법인</li>
              <li>대표이사: 전유진</li>
              <li>사업자등록번호: 445-86-01981</li>
            </ul>
          </div>

          {/* 연락처 */}
          <div>
            <h3 className="text-sm font-semibold mb-4 text-blue-200">연락처</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2 text-blue-200">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <span>서울특赼시 관악구 신림로64길 23, 8층</span>
              </li>
              <li className="flex items-center gap-2 text-blue-200">
                <Phone className="w-4 h-4 shrink-0" />
                <a href="tel:1533-9580" className="hover:text-white">1533-9580</a>
              </li>
              <li className="flex items-center gap-2 text-blue-200">
                <Mail className="w-4 h-4 shrink-0" />
                <a href="mailto:wishes@wishes.co.kr" className="hover:text-white">wishes@wishes.co.kr</a>
              </li>
              <li className="flex items-center gap-2 text-blue-200">
                <Clock className="w-4 h-4 shrink-0" />
                <span>평일 09:00 ~ 19:00 (주말 예약상담)</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-blue-800 mt-8 pt-6 text-center text-xs text-blue-300">
          <p>&copy; {new Date().getFullYear()} 주식회사 위시스부동산중개법인. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
