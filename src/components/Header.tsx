'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, MapPin } from 'lucide-react';
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
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 glass border-b border-gray-100/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-wishes-secondary to-wishes-accent flex items-center justify-center text-white shadow-lg group-hover:shadow-xl transition-shadow">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-wishes-primary leading-none">WISHES</p>
              <p className="text-xs text-wishes-muted">위시스부동산</p>
            </div>
            <div className="sm:hidden">
              <p className="text-base font-bold text-wishes-primary">WISHES</p>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={cn('px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 relative group', isActive(item.href) ? 'text-wishes-secondary' : 'text-wishes-text hover:text-wishes-secondary')}>
                {item.label}
                {isActive(item.href) && (<div className="absolute bottom-1 left-4 right-4 h-0.5 bg-wishes-accent rounded-full"></div>)}
                <div className={cn('absolute inset-0 rounded-lg bg-wishes-secondary/5 -z-10 transition-opacity duration-200', isActive(item.href) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}></div>
              </Link>
            ))}
          </nav>
          <button className="md:hidden p-2 text-wishes-primary hover:bg-gray-100 rounded-lg transition-colors" onClick={() => setIsOpen(!isOpen)} aria-label="메뉴 열기">
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        <div className={cn('md:hidden overflow-hidden border-t border-gray-100/50 bg-white/50 backdrop-blur-sm transition-all duration-300 ease-out', isOpen ? 'max-h-96' : 'max-h-0')}>
          <nav className="flex flex-col gap-0 pt-2 pb-4 px-2">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setIsOpen(false)} className={cn('px-4 py-3 text-sm font-semibold rounded-lg transition-all duration-200', isActive(item.href) ? 'text-wishes-secondary bg-wishes-secondary/10' : 'text-wishes-text hover:bg-gray-100')}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
