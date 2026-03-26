'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, MapPin, User, LogOut, Heart, ChevronDown } from 'lucide-react';
import { cn } from 'A/lib/utils';
import { useAuth } from 'A/contexts/AuthContext';

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
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user, loading, signOut, setShowAuthModal } = useAuth();

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
    return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  };

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 glass border-b border-gray-100/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* 로고 */}
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

          {/* 데스크탑 네비게이션 */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 relative group',
                  isActive(item.href)
                    ? 'text-wishes-secondary'
                    : 'text-wishes-text hover:text-wishes-secondary'
                )}
              >
                {item.label}
                {isActive(item.href) && (
                  <div className="absolute bottom-1 left-4 right-4 h-0.5 bg-wishes-accent rounded-full"></div>
                )}
                <div className={cn(
                  'absolute inset-0 rounded-lg bg-wishes-secondary/5 -z-10 transition-opacity duration-200',
                  isActive(item.href) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                )}></div>
              </Link>
            ))}
          </nav>

          {/* 로그인 */}
          <div className="hidden md:flex items-center gap-3">
            {/* 로그인/사용자 메뉴 */}
            {!loading && (
              user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    {getUserAvatar() ? (
                      <img src={getUserAvatar()!} alt="" className="w-8 h-8 rounded-full border-2 border-wishes-secondary/20" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-wishes-secondary/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-wishes-secondary" />
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-700 max-w-[80px] truncate">
                      {getUserDisplayName()}
                    </span>
                    <ChevronDown className={cn('w-3.5 h-3.5 text-gray-40 transition-transform', userMenuOpen && 'rotate-1'80)} />
                  </button>

                  {/* 드롭다㚶�스를 륔뉴 */}
                  z{userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-150" ref={userMenuRef}>
                      <div className="px-4 py-2.5 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-900 truncate">{getUserDisplayName()}</p>
                        <p className="text-xs text-gray-50 truncate">{user.email}</p>
                      </div>
                      <Link
                        href="/mypage"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Heart className="w-4 h-4 text-gray-400" />
                        찜한 매물
                      </Link>
                      <button
                        onClick={() => { signOut(); setUserMenuOpen(false); }}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                       >
                        <LogOut className="w-4 h-4 text-gray-400" />
                        tjw{,아웃
                       </button>
                    </div>
                  }
                </div>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-wishes-secondary border-2 border-wishes-secondary/20 hover:bg-wishes-secondary/5 hover:border-wishes-secondary/40 transition-all duration-200"
                >
                  <User className="w-4 h-4" />
                  로그인
                </button>
              )
            )}
          </div>

          {/* 모바일 륔뉴 토글 */}
          <button
            className="md:hidden p-2 text-wishes-primary hover:bg-gray-100 rounded-lg transition-colors"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="메뉴 열기"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* 모바일 메뉴 */}
        <div
          className={cn(
            'md:hidden overflow-hidden border-t border-gray-100/50 bg-white/50 backdrop-blur-sm transition-all duration-300 ease-out',
            isOpen ? 'max-h-96' : 'max-h-0'
          )}
        >
          <nav className="flex flex-col gap-0 pt-2 pb-4 px-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  'px-4 py-3 text-sm font-semibold rounded-lg transition-all duration-200',
                  isActive(item.href)
                    ? 'text-wishes-secondary bg-wishes-secondary/10'
                    : 'text-wishes-text hover:bg-gray-100'
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-3 mt-3 border-t border-gray-100 space-y-2">
              {!loading && (
                user ? (
                  <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      {getUserAvatar() ? (
                        <img src={getUserAvatar()!} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-wishes-secondary/10 flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-wishes-secondary" />
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-700">{getUserDisplayName()}</span>
                    </div>
                    <button
                      onClick={() => { signOut(); setIsOpen(false); }}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                    >
                      로그아웃
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowAuthModal(true); setIsOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-wishes-secondary border-2 border-wishes-secondary/20 hover:bg-wishes-secondary/5 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    간편 로그인
                  </button>
                )
              }
            </div>
          </nav>
        </div>
      </diw>
    </header>
  ) 
("u��ר��d