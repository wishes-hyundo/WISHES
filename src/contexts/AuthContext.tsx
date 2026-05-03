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
  // 로그인 모달 안내 문구 (찜/비교 등 비로그인 액션 컨텍스트 전달)
  authModalMessage: string;
  setAuthModalMessage: (msg: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');

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
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wishes-auth-redirect', window.location.pathname + window.location.search);
    }

    // 2026-04-23: Kakao 는 Supabase 기본 provider 가 scope=account_email 을
    //   하드코딩해 KOE205 를 유발 (Kakao Developers 의 account_email 은 비즈 앱
    //   전환 후에만 설정 가능). 커스텀 백엔드 /api/auth/oauth-start/kakao 로
    //   리다이렉트하여 우리가 직접 Kakao authorize URL 을 구성한다 (scope=profile_nickname).
    if (provider === 'kakao' && typeof window !== 'undefined') {
      const target = window.location.pathname + window.location.search;
      window.location.href = `/api/auth/oauth-start/kakao?target=${encodeURIComponent(target)}`;
      return;
    }

    // 구글 등 나머지는 Supabase 네이티브 OAuth.
    const supabase = createAuthClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      console.error('소셜 로그인 오류:', error.message);
      throw error;
    }
  }, []);

  // G-92 (2026-05-04): 네이버 로그인을 /api/auth/oauth-start/naver 를 통해 통일.
  //   이전: 직접 nid.naver.com 으로 redirect → ws_naver_state 쿠키 미설정 →
  //   G-91 의 cookie 검증과 충돌해 로그인 실패. oauth-start 가 cookie + state 모두 처리.
  const signInWithNaver = useCallback(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('wishes-auth-redirect', window.location.pathname + window.location.search);
    const target = window.location.pathname + window.location.search;
    window.location.href = `/api/auth/oauth-start/naver?target=${encodeURIComponent(target)}`;
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
      // L-sec37 (2026-04-22): 서버가 이제 JWT 에서 user.id 를 가져오므로 Authorization 헤더 필수.
      const supabase = createAuthClient();
      const { data: { session: sess } } = await supabase.auth.getSession();
      if (!sess?.access_token) return { success: false, error: '세션이 만료되었습니다.' };
      const res = await fetch('/api/auth/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sess.access_token}`,
        },
        body: JSON.stringify({}),
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
        authModalMessage,
        setAuthModalMessage,
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
