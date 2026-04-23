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
    const supabase = createAuthClient();
    // 로그인 후 돌아갈 경로 저장
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wishes-auth-redirect', window.location.pathname + window.location.search);
    }
    // 2026-04-23: Kakao 는 비즈 앱 전환 전까지 account_email 동의항목 등록 불가 →
    //   KOE205 회피를 위해 scope 를 profile_nickname 으로 축소. 비즈 앱 승인 후
    //   'profile_nickname account_email' 로 확장 예정.
    const options: { redirectTo: string; scopes?: string } = {
      redirectTo: `${window.location.origin}/auth/callback`,
    };
    if (provider === 'kakao') {
      options.scopes = 'profile_nickname';
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider, options });
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
    // L-sec107 (2026-04-22): OAuth CSRF state 를 crypto-strong 하게 생성하고
    //   sessionStorage 에 stash 하여 callback 에서 대조한다. Math.random().toString(36).substring(7)
    //   은 실효 3~6자 (≈ 18 비트) 라 CSRF 토큰으로 의미 없고, 기존에는 callback 에서
    //   비교조차 하지 않아 공격자가 임의 state 로 피해자를 로그인 callback 에 유도
    //   가능한 상태였다. 128-bit 엔트로피 + 세션-스코프 바인딩.
    let STATE: string;
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      STATE = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      try {
        sessionStorage.setItem('wishes-naver-oauth-state', STATE);
      } catch {
        /* quota/privacy mode — continue without stash; callback 에서 비교 실패 처리 */
      }
    } else {
      // 극단적으로 오래된 환경: 안전하게 로그인 중단
      console.error('Web Crypto API 를 사용할 수 없어 네이버 로그인을 시작할 수 없습니다.');
      return;
    }

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
