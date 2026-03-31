'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createAuthClient } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithProvider: (provider: 'kakao' | 'google') => Promise<void>;
  signInWithNaver: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const supabase = createAuthClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  const signInWithProvider = useCallback(async (provider: 'kakao' | 'google') => {
    const supabase = createAuthClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) console.error('소셜 로그인 오류:', error.message);
  }, []);

  const signInWithNaver = useCallback(() => {
    const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID || '';
    const REDIRECT_URI = `${window.location.origin}/auth/callback?provider=naver`;
    const STATE = Math.random().toString(36).substring(7);
    window.location.href = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${STATE}`;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createAuthClient();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const deleteAccount = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: '로그인 상태가 아닙니다.' };
    try {
      const res = await fetch('/api/auth/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data.success) {
        const supabase = createAuthClient();
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        return { success: true };
      }
      return { success: false, error: data.error || '탈퇴 처리에 실패했습니다.' };
    } catch {
      return { success: false, error: '서버와 통신 중 오류가 발생했습니다.' };
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user, session, loading,
        signInWithProvider, signInWithNaver, signOut, deleteAccount,
        showAuthModal, setShowAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
