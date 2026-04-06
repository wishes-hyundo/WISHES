'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FloatingButtons } from '@/components/FloatingButtons';
import { CookieConsent } from '@/components/CookieConsent';
import { BottomCTA } from '@/components/BottomCTA';
import { ToastProvider } from '@/components/Toast';
import { ChatbotWidget } from '@/components/ChatbotWidget';
import { LanguageProvider } from '@/components/LanguageToggle';
import { AuthProvider } from '@/contexts/AuthContext';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import AuthModal from '@/components/AuthModal';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const isMapPage = pathname === '/map';

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <LanguageProvider>
      <AuthProvider>
        <FavoritesProvider>
          <ToastProvider>
            <Header />
            <main className={isMapPage ? 'flex-1 overflow-hidden' : 'flex-1'}>{children}</main>
            {!isMapPage && <Footer />}
            {!isMapPage && <FloatingButtons />}
            <AuthModal />
            {!isMapPage && <ChatbotWidget />}
            {!isMapPage && <BottomCTA />}
            {!isMapPage && <CookieConsent />}
          </ToastProvider>
        </FavoritesProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
