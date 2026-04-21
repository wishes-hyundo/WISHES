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
import { SavedSearchProvider } from '@/contexts/SavedSearchContext';
import AuthModal from '@/components/AuthModal';
// ※ 복원(2026-04-17): 이전 배포에서 누락됐던 핵심 기능 2종
//   - AIChatBot: Claude API 기반 부동산 상담 챗봇
//   - CompareBar: 매물 비교(최대 4개) 플로팅 바
import AIChatBot from '@/components/AIChatBot';
import CompareBar from '@/components/CompareBar';
// T3-3: 모바일 하단 5탭 네비게이션 (md 이하에서만 노출)
import MobileBottomNav from '@/components/MobileBottomNav';
// #33 + #45: 매물 상세 모바일 전용 sticky CTA (문의 + 방문예약 병치)
import StickyLeadCTA from '@/components/StickyLeadCTA';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  // /map-2026 도 전체화면 지도 페이지이므로 /map 과 동일하게 처리
  const isMapPage = pathname === '/map' || pathname === '/map-2026';
  // MAP 2026 은 사이트 기본 Header 까지 숨기고 main 에 명시적 100dvh 를 줘야
  // 내부 grid 의 h-full 체인이 픽셀값으로 해결됨.
  // (min-h-screen 은 "최소 100vh" 라 ListPanel 의 긴 리스트가 body 를 밀어서
  //  h-full 체인이 auto 로 fallback → 컨테이너가 38,000px 로 팽창하는 버그 발생)
  const isFullScreenMap = pathname === '/map-2026';
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
          <SavedSearchProvider>
          <ToastProvider>
            {/* MAP 2026 은 전체화면 지도이므로 사이트 기본 Header 숨김 (MapClient 가 자체 헤더 렌더링) */}
            {!isFullScreenMap && <Header />}
            {/* MAP 2026 은 main 에 명시적 100dvh 를 줘야 내부 h-full 체인이 픽셀로 해결됨 */}
            <main className={
              isFullScreenMap
                ? 'h-[100dvh] overflow-hidden'
                : isMapPage
                  ? 'flex-1 overflow-hidden'
                  : 'flex-1'
            }>{children}</main>
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
            {/* 모바일 5탭 하단 네비: /admin · /map · 중개사 포털은 내부에서 비노출 */}
            <MobileBottomNav />
            {/* #33 + #45: /listings/[id] 상세에서만 노출되는 sticky 문의/방문예약 CTA */}
            {!isMapPage && <StickyLeadCTA />}
          </ToastProvider>
          </SavedSearchProvider>
        </FavoritesProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
