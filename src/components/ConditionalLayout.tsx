'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FloatingButtons } from '@/components/FloatingButtons';
import { AuthProvider } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <FloatingButtons />
      <AuthModal />
    </AuthProvider>
  );
}
