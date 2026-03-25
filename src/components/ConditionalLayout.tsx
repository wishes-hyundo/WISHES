'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FloatingButtons } from '@/components/FloatingButtons';
import AIChatBot from '@/components/AIChatBot';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import CompareBar from './CompareBar';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return <FavoritesProvider>{children}</FavoritesProvider>;
  }

  return (
    <FavoritesProvider>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <FloatingButtons />
      <CompareBar />
          <AIChatBot />
    </FavoritesProvider>
  );
}
