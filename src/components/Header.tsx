'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, MapPin, User, LogOut, Heart, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { label: '매물검색', href: '/listings' },
  { label: '지도검색', href: '/map' },
  { label: '대출계산기', href: '/calculator' },
  { label: '회사소개', href: '/about' },
  { label: '상담문의', href: '/contact' },
];

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user, loading, signOut, setShowAuthModal } = useAuth();

  // 스크롤 감지
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 사용자 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getUserDisplayName = () => {
    if (!user) return '';
    return user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '회원';
  };

  const getUserAvatar = () => {
    const url = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
    if (url && url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    return url;
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-white/95 backdrop-blur-xl shadow-sm border-b border-wishes-border/50'
          : 'bg-white/80 backdrop-blur-md'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-[72px]">
          {/* 로고 */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 bg-gradient-to-br from-wishes-secondary to-wishes-accent flex items-center justify-center text-white shadow-droplet group-hover:shadow-lg transition-all duration-300 group-hover:scale-105" style={{ borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%' }}>
              <MapPin className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-wishes-primary">WISHES</span>
          </Link>

          {/* 데스크탑 네비게이션 */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                  isActive(item.href)
                    ? 'text-wishes-accent'
                    : 'text-wishes-text/70 hover:text-wishes-text'
                )}
              >
                {item.label}
                {isActive(item.href) && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-wishes-accent" />
                )}
              </Link>
            ))}
          </nav>

          {/* 데스크탑 우측: 로그인 */}
          <div className="hidden lg:flex items-center gap-3">
            {!loading && (
              user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-wishes-cream/60 transition-colors"
                  >
                    {getUserAvatar() && !avatarError ? (
                      <img
                        src={getUserAvatar()!}
                        alt=""
                        className="w-8 h-8 rounded-full border-2 border-wishes-accent/20 object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-wishes-accent/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-wishes-accent" />
                      </div>
                    )}
                    <span className="text-sm font-medium text-wishes-text max-w-[120px] truncate">
                      {getUserDisplayName()}
                    </span>
                    <ChevronDown className={cn('w-3.5 h-3.5 text-wishes-muted transition-transform duration-200', userMenuOpen && 'rotate-180')} />
                  </button>

                  {/* 드롭다운 */}
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-premium border border-wishes-border/60 overflow-hidden py-1 animate-fade-in-up">
                      <div className="px-4 py-3 border-b border-wishes-border/40">
                        <p className="text-sm font-bold text-wishes-text truncate">{getUserDisplayName()}</p>
                        <p className="text-xs text-wishes-muted truncate mt-0.5">{user.email}</p>
                      </div>
                      <Link
                        href="/mypage"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-wishes-text/80 hover:bg-wishes-cream/50 transition-colors"
                      >
                        <Heart className="w-4 h-4 text-wishes-accent/60" />
                        찜한 매물
                      </Link>
                      <button
                        onClick={() => { signOut(); setUserMenuOpen(false); }}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-wishes-text/80 hover:bg-wishes-cream/50 transition-colors"
                      >
                        <LogOut className="w-4 h-4 text-wishes-muted" />
                        로그아웃
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="btn-accent text-sm px-5 py-2.5"
                >
                  <User className="w-4 h-4" />
                  로그인
                </button>
              )
            )}
          </div>

          {/* 모바일 메뉴 토글 */}
          <button
            className="lg:hidden p-2.5 text-wishes-primary hover:bg-wishes-cream/60 rounded-xl transition-colors"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="메뉴 열기"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* 모바일 메뉴 */}
        <div
          className={cn(
            'lg:hidden overflow-hidden transition-all duration-300 ease-out',
            isOpen ? 'max-h-[480px] pb-4' : 'max-h-0'
          )}
        >
          <div className="border-t border-wishes-border/30 pt-3">
            <nav className="flex flex-col gap-0.5 px-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                    isActive(item.href)
                      ? 'text-wishes-accent bg-wishes-accent/5'
                      : 'text-wishes-text/70 hover:bg-wishes-cream/50 hover:text-wishes-text'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="pt-3 mt-3 border-t border-wishes-border/30 px-3">
              {!loading && (
                user ? (
                  <div className="flex items-center justify-between px-2 py-2">
                    <div className="flex items-center gap-2.5">
                      {getUserAvatar() && !avatarError ? (
                        <img
                          src={getUserAvatar()!}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                          onError={() => setAvatarError(true)}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-wishes-accent/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-wishes-accent" />
                        </div>
                      )}
                      <span className="text-sm font-medium text-wishes-text">{getUserDisplayName()}</span>
                    </div>
                    <button
                      onClick={() => { signOut(); setIsOpen(false); }}
                      className="text-xs text-wishes-muted hover:text-wishes-text font-medium px-3 py-1.5 rounded-lg hover:bg-wishes-cream/50 transition-colors"
                    >
                      로그아웃
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowAuthModal(true); setIsOpen(false); }}
                    className="w-full btn-accent text-sm py-3"
                  >
                    <User className="w-4 h-4" />
                    ꄎ편 로그인
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
