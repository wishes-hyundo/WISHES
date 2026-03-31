'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FloatingButtons } from '@/components/FloatingButtons';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import AuthModal from '@/components/AuthModal';
import AIChatBot from '@/components/AIChatBot';
import CompareBar from '@/components/CompareBar';
import ProfileCompletion from '@/components/ProfileCompletion';

function ProfileCompletionWrapper() {
  const { showProfileCompletion, setShowProfileCompletion } = useAuth();
  if (!showProfileCompletion) return null;
  return <ProfileCompletion onComplete={() => setShowProfileCompletion(false)} />;
}

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const isMapPage = pathname === '/map';

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      <FavoritesProvider>
        <Header />
        <main className="flex-1">{children}</main>
        {!isMapPage && <Footer />}
        <FloatingButtons />
        <CompareBar />
        <AIChatBot />
        <AuthModal />
        <ProfileCompletionWrapper />
      </FavoritesProvider>
    </AuthProvider>
  );
}