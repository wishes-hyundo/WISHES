'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const navItems = [
    { href: '/admin', label: '대시보드', icon: '📊' },
    { href: '/admin/listings', label: '매물 관리', icon: '🏠' },
    { href: '/admin?tab=contacts', label: '상담 관리', icon: '📞' },
  ];

  const isNewListing = pathname === '/admin/listings/new';

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 사이드바 */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-wishes-primary text-white transition-all duration-300 flex flex-col shadow-lg`}>
        {/* 헤더 */}
        <div className="p-6 border-b border-wishes-secondary">
          <div className="flex items-center justify-between">
            {sidebarOpen && <h1 className="text-xl font-bold text-wishes-accent">WISHES</h1>}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-wishes-secondary rounded-lg transition">
              {sidebarOpen ? '◀' : '▶'}
            </button>
          </div>
        </div>

        {/* 스마트 매물 등록 버튼 */}
        <div className="p-4">
          <Link
            href="/admin/listings/new"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200 shadow-md ${
              isNewListing
                ? 'bg-white text-wishes-primary shadow-lg scale-[1.02]'
                : 'bg-gradient-to-r from-wishes-accent to-yellow-400 text-wishes-primary hover:shadow-lg hover:scale-[1.02]'
            } ${!sidebarOpen ? 'justify-center' : ''}`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {sidebarOpen && <span>스마트 매물 등록</span>}
          </Link>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href.split('?')[0]));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition text-sm font-medium ${
                  isActive ? 'bg-wishes-secondary text-white' : 'hover:bg-wishes-secondary/60'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Command Center 바로가기 */}
        <div className="px-4 pb-2">
          <a
            href="/admin/command-center.html"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 shadow-md hover:shadow-lg hover:scale-[1.02] ${!sidebarOpen ? 'justify-center' : ''}`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            {sidebarOpen && (
              <div className="flex flex-col">
                <span>Command Center</span>
                <span className="text-[10px] font-normal opacity-75">통합 관리 센터</span>
              </div>
            )}
          </a>
        </div>

        {/* 로그아웃 */}
        <div className="p-4 border-t border-wishes-secondary">
          <button
            onClick={() => {
              localStorage.removeItem('admin_password');
              router.push('/');
            }}
            className={`w-full flex items-center gap-3 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition font-medium text-sm ${!sidebarOpen ? 'justify-center' : ''}`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {sidebarOpen ? '로그아웃' : ''}
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><p className="text-gray-500">로딩 중...</p></div>}>
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
