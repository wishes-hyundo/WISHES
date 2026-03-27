'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FloatingButtons } from '@/components/FloatingButtons';
import { AuthProvider } from '@/contexts/AuthContext';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import AuthModal from '@/components/AuthModal';
import AIChatBot from '@/components/AIChatBot';
import CompareBar from '@/components/CompareBar';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      <FavoritesProvider>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <FloatingButtons />
        <CompareBar />
        <AIChatBot />
        <AuthModal />
      </FavoritesProvider>
    </AuthProvider>
  );
}
