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
  // 중개사 포털 관련 페이지는 헤더/푸터 없이 전체화면 렌더링
  const isBrokerPortal = pathname === '/search' || pathname === '/login' || pathname === '/signup';

  if (isAdmin) {
    return <>{children}</>;
  }

  if (isBrokerPortal) {
    // AuthProvider만 래핑 (createAuthClient 사용을 위해)
    return (
      <AuthProvider>
        {children}
      </AuthProvider>
    );
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
