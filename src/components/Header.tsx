'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-white shadow-lg' : 'bg-white/95 backdrop-blur-md'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 sm:h-[72px]">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-brand-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg sm:text-xl">W</span>
            </div>
            <div className="hidden sm:block">
              <span className="text-brand-primary font-bold text-lg tracking-tight">WISHES</span>
              <span className="text-gray-400 text-[10px] block -mt-1">위시스부동산</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { href: '/listings?deal=전세', label: '전세' },
              { href: '/listings?deal=월세', label: '월세' },
              { href: '/listings?deal=매매', label: '매매' },
              { href: '/listings', label: '전체매물' },
              { href: '/about', label: '회사소개' },
              { href: '/contact', label: '상담문의' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-2 text-sm font-medium text-navy-700 hover:text-brand-secondary rounded-lg hover:bg-brand-light/50 transition-all relative group"
              >
                {item.label}
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-brand-secondary rounded-full group-hover:w-1/2 transition-all duration-300" />
              </Link>
            ))}
          </nav>

          {/* CTA + Mobile */}
          <div className="flex items-center gap-2">
            <a
              href="tel:1533-9580"
              className="hidden sm:flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
              1533-9580
            </a>

            {/* Mobile menu button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="메뉴"
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <span className={`block w-full h-0.5 bg-navy-800 transition-all ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
                <span className={`block w-full h-0.5 bg-navy-800 transition-all ${menuOpen ? 'opacity-0' : ''}`} />
                <span className={`block w-full h-0.5 bg-navy-800 transition-all ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`md:hidden transition-all duration-300 overflow-hidden ${
        menuOpen ? 'max-h-96 border-t border-gray-100' : 'max-h-0'
      }`}>
        <nav className="px-4 py-3 bg-white space-y-1">
          {[
            { href: '/listings?deal=전세', label: '전세' },
            { href: '/listings?deal=월세', label: '월세' },
            { href: '/listings?deal=매매', label: '매매' },
            { href: '/listings', label: '전체매물' },
            { href: '/about', label: '회사소개' },
            { href: '/contact', label: '상담문의' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-3 text-sm font-medium text-navy-700 hover:bg-brand-light rounded-lg transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <a
            href="tel:1533-9580"
            className="flex items-center justify-center gap-2 bg-brand-primary text-white px-4 py-3 rounded-lg text-sm font-semibold mt-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
            전화 상담 1533-9580
          </a>
        </nav>
      </div>
    </header>
  );
}
