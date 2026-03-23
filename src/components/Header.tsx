'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Phone, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: '홈', href: '/' },
  { label: '매물검색', href: '/listings' },
  { label: '지도검색', href: '/map' },
  { label: '회사소개', href: '/about' },
  { label: '상담문의', href: '/contact' },
];

export function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* 로고 */}
          <Link href="/" className="flex items-center gap-2">
            <MapPin className="w-7 h-7 text-wishes-secondary" />
            <div>
              <span className="text-xl font-bold text-wishes-primary">WISHES</span>
              <span className="hidden sm:inline text-xs text-gray-500 ml-2">위시스부동산</span>
            </div>
          </Link>

          {/* 데스크탑 네비게이션 */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-wishes-secondary hover:bg-blue-50 rounded-lg transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* CTA 버튼 */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="tel:1533-9580"
              className="flex items-center gap-2 bg-wishes-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-wishes-secondary transition-colors"
            >
              <Phone className="w-4 h-4" />
              1533-9580
            </a>
          </div>

          {/* 모바일 메뉴 토글 */}
          <button
            className="md:hidden p-2 text-gray-700"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="메뉴 열기"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* 모바일 메뉴 */}
        <div
          className={cn(
            'md:hidden overflow-hidden transition-all duration-300',
            isOpen ? 'max-h-80 pb-4' : 'max-h-0'
          )}
        >
          <nav className="flex flex-col gap-1 pt-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-3 text-sm font-medium text-gray-700 hover:bg-blue-50 rounded-lg"
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <a
              href="tel:1533-9580"
              className="flex items-center justify-center gap-2 mt-2 bg-wishes-primary text-white px-4 py-3 rounded-lg text-sm font-medium"
            >
              <Phone className="w-4 h-4" />
              전화 상담 1533-9580
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
