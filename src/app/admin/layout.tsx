'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();
  const navItems = [
    { href: '/admin', label: '대시보드', icon: '📊' },
    { href: '/admin?tab=listings', label: '매물 관리', icon: '🏠' },
    { href: '/admin?tab=contacts', label: '상담 관리', icon: '📞' },
  ];
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-wishes-primary text-white transition-all duration-300 flex flex-col shadow-lg`}>
        <div className="p-6 border-b border-wishes-secondary">
          <div className="flex items-center justify-between">
            {sidebarOpen && <h1 className="text-xl font-bold text-wishes-accent">WISHES</h1>}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-wishes-secondary rounded-lg transition">{sidebarOpen ? '◀' : '▶'}</button>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-wishes-secondary transition text-sm font-medium">
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-wishes-secondary">
          <button onClick={() => { localStorage.removeItem('admin_password'); router.push('/'); }} className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition font-medium text-sm">
            {sidebarOpen ? '로그아웃' : '⚙️'}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><div className="p-8">{children}</div></main>
    </div>
  );
}
