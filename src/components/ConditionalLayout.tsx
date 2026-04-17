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
// ※ 복원(2026-04-17): 이전 배포에서 누락됐던 핵심 기능 2종
//   - AIChatBot: Claude API 기반 부동산 상담 챗봇
//   - CompareBar: 매물 비교(최대 4개) 플로팅 바
import AIChatBot from '@/components/AIChatBot';
import CompareBar from '@/components/CompareBar';

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
    // 중개사 포털은 자체 인증 로직 사용 — AuthProvider 불필요
    // AuthProvider의 getSession()이 Supabase 다운 시 행(hang) 유발하므로 제외
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
            {/* 매물 비교 플로팅 바 — 지도 페이지 제외 전 페이지에서 동작 */}
            {!isMapPage && <CompareBar />}
            {/* AI 상담 챗봇(Claude) — 지도 페이지는 전체화면이라 제외 */}
            {!isMapPage && <AIChatBot />}
            {!isMapPage && <ChatbotWidget />}
            {!isMapPage && <BottomCTA />}
            {!isMapPage && <CookieConsent />}
          </ToastProvider>
        </FavoritesProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
