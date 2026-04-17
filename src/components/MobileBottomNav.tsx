'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MobileBottomNav (T3-3)
//   모바일 5탭 고정 하단 네비게이션
//   - 검색(매물)·지도·찜·상담·마이 페이지
//   - 현재 경로와 매치되면 키 컬러 활성
//   - 찜 개수 배지 노출 (FavoritesContext)
//   - safe-area-inset-bottom 대응 (iOS 노치/홈 인디케이터)
//   - md: 이상 비노출 (데스크톱은 기존 Header 네비 사용)
//   - /admin · /map · 중개사 포털(/search /login /signup) 에서는 렌더 안 함
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Search, Map, Heart, MessageCircle, User } from 'lucide-react';
import { useFavorites } from '@/contexts/FavoritesContext';

type NavItem = {
  href: string;
  label: string;
  Icon: typeof Search;
  match: (p: string) => boolean;
};

const items: NavItem[] = [
  { href: '/listings', label: '매물', Icon: Search, match: (p) => p.startsWith('/listings') },
  { href: '/map', label: '지도', Icon: Map, match: (p) => p === '/map' },
  { href: '/mypage?tab=favorites', label: '찜', Icon: Heart, match: (p) => p.startsWith('/mypage') },
  { href: '/contact', label: '상담', Icon: MessageCircle, match: (p) => p === '/contact' },
  { href: '/mypage', label: '마이', Icon: User, match: (p) => p === '/mypage' },
];

export default function MobileBottomNav() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const tab = searchParams?.get('tab') || '';
  const { favorites } = useFavorites();
  const favCount = favorites?.length ?? 0;

  // 비노출 경로
  const hide =
    pathname.startsWith('/admin') ||
    pathname === '/map' ||
    pathname === '/search' ||
    pathname === '/login' ||
    pathname === '/signup';
  if (hide) return null;

  return (
    <nav
      aria-label="모바일 하단 네비게이션"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, Icon, match }) => {
          // "찜" 탭은 /mypage?tab=favorites 가 정확히 일치할 때만 active, /mypage 는 "마이"로
          let active = false;
          if (label === '찜') active = pathname.startsWith('/mypage') && tab === 'favorites';
          else if (label === '마이') active = pathname === '/mypage' && tab !== 'favorites';
          else active = match(pathname);

          const showFavBadge = label === '찜' && favCount > 0;

          return (
            <li key={label}>
              <Link
                href={href}
                className={
                  'relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ' +
                  (active
                    ? 'text-wishes-primary'
                    : 'text-gray-500 hover:text-wishes-primary')
                }
              >
                <span className="relative">
                  <Icon className={'w-5 h-5 ' + (active ? 'stroke-[2.2]' : 'stroke-[1.8]')} />
                  {showFavBadge && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-wishes-accent text-[9px] font-bold text-white flex items-center justify-center leading-none"
                      aria-label={`찜 ${favCount}개`}
                    >
                      {favCount > 99 ? '99+' : favCount}
                    </span>
                  )}
                </span>
                <span className="leading-none">{label}</span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-wishes-primary" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
