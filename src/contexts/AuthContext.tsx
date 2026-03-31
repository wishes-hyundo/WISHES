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
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  showProfileCompletion: boolean;
  setShowProfileCompletion: (show: boolean) => void;
  profileCompleted: boolean;
  authModalMessage: string;
  setAuthModalMessage: (msg: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');

  // 프로필 완성 여부 체크
  const checkProfile = useCallback(async (accessToken: string) => {
    try {
      const resp = await fetch('/api/profile', {
        headers: { 'Authorization': 'Bearer ' + accessToken },
      });
      if (resp.ok) {
        const profile = await resp.json();
        if (profile.profile_completed) {
          setProfileCompleted(true);
        } else {
          setProfileCompleted(false);
          setShowProfileCompletion(true);
        }
      }
    } catch (e) { console.error('Profile check error:', e); }
  }, []);

  useEffect(() => {
    const supabase = createAuthClient();
    // 현재 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.access_token) {
        checkProfile(session.access_token);
      }
    });
    // 인증 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (event === 'SIGNED_IN' && session?.access_token) {
          checkProfile(session.access_token);
        }
        if (event === 'SIGNED_OUT') {
          setProfileCompleted(false);
          setShowProfileCompletion(false);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [checkProfile]);

  const signInWithProvider = useCallback(async (provider: 'kakao' | 'google') => {
    const supabase = createAuthClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    });
    if (error) { console.error('소셜 로그인 오류:', error.message); }
  }, []);

  // 네이버는 Supabase 네이티브 미지원
  const signInWithNaver = useCallback(() => {
    const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID || '';
    const REDIRECT_URI = window.location.origin + '/auth/callback?provider=naver';
    const STATE = Math.random().toString(36).substring(7);
    window.location.href = 'https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=' + NAVER_CLIENT_ID + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) + '&state=' + STATE;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createAuthClient();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user, session, loading,
        signInWithProvider, signInWithNaver, signOut,
        showAuthModal, setShowAuthModal,
        showProfileCompletion, setShowProfileCompletion,
        profileCompleted,
        authModalMessage, setAuthModalMessage,
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