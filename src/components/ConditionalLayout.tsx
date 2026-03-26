'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FloatingButtons } from '@/components/FloatingButtons';
import { CompareBar } from '@/components/CompareBar';
import AIChatBot from '@/components/AIChatBot';
import { AuthProvider } from '@/contexts/AuthContext';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import AuthModal from '@/components/AuthModal';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      <FavoritesProvider>
        <Header />
        <main>{children}</main>
        <Footer />
        <FloatingButtons />
        <CompareBar />
        <AIChatBot />
        <AuthModal />
      </FavoritesProvider>
    </AuthProvider>
  );
}
