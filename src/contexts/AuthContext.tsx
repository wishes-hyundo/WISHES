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

    // 현재 세션 확인 (3초 타임아웃 — Supabase 다운 시 무한 대기 방지)
    const sessionTimeout = setTimeout(() => {
      setLoading(false); // 타임아웃 시 세션 없이 진행
    }, 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(sessionTimeout);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      clearTimeout(sessionTimeout);
      setLoading(false);
    });

    // 인증 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        // 로그인 성공 시 모달 자동 닫기
        if (session?.user) {
          setShowAuthModal(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithProvider = useCallback(async (provider: 'kakao' | 'google') => {
    const supabase = createAuthClient();
    // 로그인 후 돌아갈 경로 저장
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wishes-auth-redirect', window.location.pathname + window.location.search);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error('소셜 로그인 오류:', error.message);
      throw error;
    }
  }, []);

  // 네이버는 Supabase 네이티브 미지원 → Custom OIDC 또는 별도 처리
  const signInWithNaver = useCallback(() => {
    // 로그인 후 돌아갈 경로 저장
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wishes-auth-redirect', window.location.pathname + window.location.search);
    }
    const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID || '';
    const REDIRECT_URI = `${window.location.origin}/auth/callback?provider=naver`;
    const STATE = Math.random().toString(36).substring(7);

    // 네이버 로그인 페이지로 리다이렉트
    window.location.href =
      `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${STATE}`;
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
        user,
        session,
        loading,
        signInWithProvider,
        signInWithNaver,
        signOut,
        deleteAccount,
        showAuthModal,
        setShowAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
