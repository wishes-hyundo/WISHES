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

  if (!isMounted) {
    return (
      <div className="flex h-screen bg-gray-50" suppressHydrationWarning>
        <div className="w-64 bg-green-800" />
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">로딩 중...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-wishes-primary text-white transition-all duration-300 flex flex-col`}
      >
        <div className="p-4 border-b border-wishes-secondary flex items-center justify-between">
          {sidebarOpen && (
            <h1 className="text-xl font-bold">WISHES</h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-wishes-secondary rounded-lg transition"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <div className="p-4">
          <Link
            href="/admin/listings/new"
            className={`block w-full px-4 py-3 rounded-lg transition font-medium text-center ${
              isNewListing
                ? 'bg-white text-wishes-primary'
                : 'bg-wishes-secondary hover:bg-wishes-dark'
            }`}
          >
            {sidebarOpen ? '✨ 스마트 매물 등록' : '✨'}
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition text-sm font-medium ${
                pathname === item.href
                  ? 'bg-wishes-secondary text-white'
                  : 'text-gray-300 hover:bg-wishes-secondary hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-wishes-secondary">
          <button
            onClick={() => {
              localStorage.removeItem('admin_password');
              router.push('/');
            }}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition font-medium text-sm"
          >
            {sidebarOpen ? '로그아웃' : '⚙️'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">로딩 중...</p>
              </div>
            }
          >
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
