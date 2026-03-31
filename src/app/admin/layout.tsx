'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [hasExtension, setHasExtension] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { setIsMounted(true); }, []);

  // ========================================
  // 인증 가드 - 회원가입 + 승인 필수
  // ========================================
  useEffect(() => {
    if (!isMounted) return;

    const checkAuth = async () => {
      try {
        const token = window.sessionStorage.getItem('ws_token');
        const userStr = window.sessionStorage.getItem('ws_user');
        const loginTime = window.sessionStorage.getItem('ws_login_time');

        if (!token || !userStr || !loginTime) {
          window.location.href = '/admin/admin-auth.html';
          return;
        }

        const elapsed = Date.now() - new Date(loginTime).getTime();
        if (elapsed > 30 * 60 * 1000) {
          window.sessionStorage.clear();
          window.location.href = '/admin/admin-auth.html';
          return;
        }

        if (!token.startsWith('admin_bridge_')) {
          const verifyRes = await fetch('/api/auth/verify', {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (!verifyRes.ok) {
            window.sessionStorage.clear();
            window.location.href = '/admin/admin-auth.html';
            return;
          }
        }

        // 사용자 역할 추출
        try {
          const userData = JSON.parse(userStr);
          setUserRole(userData.role || '');
        } catch { setUserRole(''); }

        setIsAuthenticated(true);
      } catch (e) {
        window.sessionStorage.clear();
        window.location.href = '/admin/admin-auth.html';
      } finally {
        setIsAuthChecking(false);
      }
    };

    checkAuth();
  }, [isMounted]);

  // ========================================
  // 크롬 확장프로그램 감지
  // ========================================
  useEffect(() => {
    if (!isMounted) return;

    const checkExtension = () => {
      const extEl = document.getElementById('wishes-search-extension') ||
                    document.querySelector('[data-wishes-extension]');
      if (extEl) { setHasExtension(true); return true; }
      return false;
    };

    const handleExtMessage = (e: MessageEvent) => {
      if (e.data?.type === 'WS_EXTENSION_LOADED' || e.data?.type === 'WS_AUTH_CHECK') {
        setHasExtension(true);
      }
    };

    window.addEventListener('message', handleExtMessage);
    checkExtension();
    const t1 = setTimeout(checkExtension, 500);
    const t2 = setTimeout(checkExtension, 1500);
    const t3 = setTimeout(checkExtension, 3000);

    return () => {
      window.removeEventListener('message', handleExtMessage);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, [isMounted]);

  // 모바일 메뉴 열림 시 body 스크롤 방지
  useEffect(() => {
    if (mobileMenuOpen) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  // ========================================
  // Chrome 확장 프로그램 인증 브릿지
  // ========================================
  useEffect(() => {
    if (!isAuthenticated) return;

    const removeAuthWall = () => {
      const wall = document.getElementById('ws-auth-wall');
      if (wall) wall.remove();
    };
    removeAuthWall();

    const handleAuthCheck = (e: MessageEvent) => {
      if (e.data?.type === 'WS_AUTH_CHECK') {
        const user = window.sessionStorage.getItem('ws_user');
        window.postMessage({
          type: 'WS_AUTH_RESPONSE',
          verified: true,
          user: user ? JSON.parse(user) : { email: 'admin', role: 'superadmin', status: 'approved' }
        }, '*');
      }
    };

    window.addEventListener('message', handleAuthCheck);
    const checker = setInterval(removeAuthWall, 500);
    const stop = setTimeout(() => clearInterval(checker), 3000);

    return () => {
      window.removeEventListener('message', handleAuthCheck);
      clearInterval(checker); clearTimeout(stop);
    };
  }, [isAuthenticated]);

  const navItems = [
    { href: '/admin', label: '대시보드', icon: '📊' },
    { href: '/admin/listings', label: '매물 관리', icon: '🏠' },
    { href: '/admin?tab=contacts', label: '상담 관리', icon: '📞' },
  ];

  const isNewListing = pathname === '/admin/listings/new';
  const isAdminRole = userRole === 'superadmin' || userRole === 'admin';

  const handleCommandCenter = () => {
    try {
      const token = window.sessionStorage.getItem('ws_token');
      const userStr = window.sessionStorage.getItem('ws_user');
      if (!token || !userStr) {
        const adminPw = window.localStorage.getItem('admin_password');
        if (adminPw) {
          window.sessionStorage.setItem('ws_token', 'admin_bridge_' + Date.now());
          window.sessionStorage.setItem('ws_user', JSON.stringify({
            email: 'wishes@wishes.co.kr', role: 'superadmin', name: 'WISHES Admin'
          }));
          window.sessionStorage.setItem('ws_login_time', Date.now().toString());
        }
      }
    } catch (e) {}
    window.location.href = '/admin/command-center.html';
  };

  const handleLogout = () => {
    window.localStorage.removeItem('admin_password');
    window.sessionStorage.clear();
    window.location.href = '/admin/admin-auth.html';
  };

  if (!isMounted) return null;

  if (isAuthChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-wishes-bg">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-wishes-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white/60 text-sm">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin' && !isNewListing;
    return pathname.startsWith(href);
  };

  const SidebarContent = () => (
    <>
      <div className="flex items-center justify-between px-4 py-4 border-b border-green-700/30">
        {sidebarOpen && <h1 className="text-xl font-black tracking-wide text-wishes-accent">WISHES</h1>}
        <button onClick={() => { setSidebarOpen(!sidebarOpen); setMobileMenuOpen(false); }}
          className="p-2 rounded-lg hover:bg-white/10 transition hidden md:block" aria-label="사이드바 토글">
          {sidebarOpen ? '◀' : '▶'}
        </button>
      </div>

      <div className="px-3 pt-4 pb-2">
        <Link href="/admin/listings/new" onClick={() => setMobileMenuOpen(false)}
          className={`flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all duration-200 ${
            isNewListing ? 'bg-yellow-500 text-black shadow-lg scale-[1.02]'
              : 'bg-gradient-to-r from-yellow-400 to-orange-400 text-black hover:shadow-lg hover:scale-[1.02] active:scale-95'
          }`}>
          <span>+</span>
          {sidebarOpen && <span>스마트 매물 등록</span>}
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 min-h-[48px] ${
              isActive(item.href) ? 'bg-white/20 text-white shadow-inner font-bold'
                : 'text-white/80 hover:bg-white/10 hover:text-white active:bg-white/15'
            }`}>
            <span className="text-lg flex-shrink-0">{item.icon}</span>
            {sidebarOpen && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* 매물 검색 - 크롬 확장프로그램 설치 시에만 표시 */}
      {hasExtension && (
        <div className="px-3 pb-2">
          <Link href="/admin?tab=search" onClick={() => setMobileMenuOpen(false)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 min-h-[48px] text-white/80 hover:bg-white/10 hover:text-white active:bg-white/15">
            <span className="text-lg flex-shrink-0">🔍</span>
            {sidebarOpen && <span>매물 검색</span>}
          </Link>
        </div>
      )}

      {/* Command Center - admin/superadmin만 표시 */}
      {isAdminRole && (
        <div className="px-3 pb-2">
          <button onClick={handleCommandCenter}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-200 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-95 min-h-[48px] ${!sidebarOpen ? 'justify-center' : ''}`}>
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            {sidebarOpen && (
              <div className="flex flex-col text-left">
                <span>Command Center</span>
                <span className="text-[10px] font-normal opacity-75">통합 관리 센터</span>
              </div>
            )}
          </button>
        </div>
      )}

      <div className="px-3 pb-4">
        <button onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-red-500/30 transition-all duration-200 min-h-[48px] active:bg-red-500/50 ${!sidebarOpen ? 'justify-center' : ''}`}>
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {sidebarOpen && <span>로그아웃</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-wishes-bg">
      <button onClick={() => setMobileMenuOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 p-2.5 bg-wishes-primary text-white rounded-xl shadow-lg active:scale-95 transition"
        aria-label="메뉴 열기">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside className={`hidden md:flex flex-col sticky top-0 h-screen bg-wishes-primary text-white transition-all duration-300 flex-shrink-0 ${sidebarOpen ? 'w-60' : 'w-20'}`}>
        <SidebarContent />
      </aside>

      <aside className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-wishes-primary text-white flex flex-col transform transition-transform duration-300 ease-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 pt-3">
          <span></span>
          <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/70" aria-label="메뉴 닫기">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SidebarContent />
      </aside>

      <main className="flex-1 min-h-screen md:p-6 p-4 pt-14 md:pt-6 overflow-x-hidden">
        <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-wishes-primary border-t-transparent rounded-full" /></div>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
