'use client';
// /search/v2 — BoB Phase 1: shadcn + TanStack 기반 새 중개사 포털
// 옛날 /search content.js 와 병행 (Strangler Fig 패턴)
//
// 작성: 2026-04-27 v3 세션

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Building2, Phone, BarChart3, Users, Settings, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

type AuthState = 'loading' | 'nosession' | 'ok';

const NAV_ITEMS = [
  { href: '/search/v2', label: '대시보드', icon: BarChart3 },
  { href: '/search/v2/listings', label: '매물 관리', icon: Building2 },
  { href: '/search/v2/contacts', label: '상담 관리', icon: Phone },
  { href: '/search/v2/profile', label: '내 프로필', icon: Users },
];

export default function SearchV2Layout({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const pathname = usePathname();

  useEffect(() => {
    try {
      const token =
        sessionStorage.getItem('ws_token') ||
        localStorage.getItem('ws_token') ||
        '';
      setAuthState(token ? 'ok' : 'nosession');
    } catch {
      setAuthState('nosession');
    }
  }, []);

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (authState === 'nosession') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="bg-card rounded-2xl shadow-lg p-8 max-w-md w-full text-center border">
          <div className="text-5xl mb-4">🔐</div>
          <h1 className="text-xl font-bold text-primary mb-3">로그인이 필요합니다</h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            중개사 포털 v2 (BoB) 는 승인된 직원만 이용할 수 있습니다.
          </p>
          <Link
            href="/admin/admin-auth.html"
            className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition"
          >
            로그인하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-primary text-primary-foreground flex-shrink-0 border-r">
        <div className="p-6 border-b border-primary-foreground/10">
          <Link href="/search/v2" className="text-xl font-black tracking-wide">
            WISHES <span className="text-xs font-normal opacity-70">v2 BoB</span>
          </Link>
          <p className="text-[11px] opacity-60 mt-1">중개사 포털 — Next.js 16 + shadcn/ui</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/search/v2' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary-foreground/15 font-bold'
                    : 'opacity-80 hover:opacity-100 hover:bg-primary-foreground/10'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-primary-foreground/10 space-y-2">
          <Link
            href="/search"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium opacity-70 hover:opacity-100 hover:bg-primary-foreground/10 transition"
          >
            <Home className="w-3 h-3" />
            <span>옛날 가게 (/search)</span>
            <ExternalLink className="w-3 h-3 ml-auto" />
          </Link>
          <Link
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium opacity-70 hover:opacity-100 hover:bg-primary-foreground/10 transition"
          >
            <Settings className="w-3 h-3" />
            <span>관리자 (/admin)</span>
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
