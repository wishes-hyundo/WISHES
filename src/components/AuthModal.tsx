'use client';

import { useState } from 'react';
import { X, Heart, Bell, Star, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthModal() {
  const { showAuthModal, setShowAuthModal, signInWithProvider, signInWithNaver, authModalMessage, setAuthModalMessage } = useAuth();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  if (!showAuthModal) return null;

  const handleSocialLogin = async (provider: 'kakao' | 'google' | 'naver') => {
    setIsLoading(provider);
    try {
      if (provider === 'naver') { signInWithNaver(); }
      else { await signInWithProvider(provider); }
    } catch { setIsLoading(null); }
  };

  const handleClose = () => {
    setShowAuthModal(false);
    setAuthModalMessage('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <button onClick={handleClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 transition-colors z-10" aria-label="닫기">
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {/* 헤더 */}
        <div className="pt-8 pb-4 px-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-wishes-secondary to-wishes-accent flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">간편 로그인</h2>
          <p className="text-sm text-gray-500 mt-1.5">
            {authModalMessage || '소셜 계정으로 간편하게 시작하세요'}
          </p>
        </div>

        {/* 회원 전용 혜택 배너 */}
        <div className="mx-8 mb-5 p-4 bg-gradient-to-r from-wishes-secondary/5 to-wishes-accent/5 rounded-xl border border-wishes-secondary/10">
          <p className="text-xs font-bold text-wishes-secondary mb-2.5">회원 전용 혜택</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Heart className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>관심 매물 찜하기 &amp; 어디서든 확인</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Bell className="w-3.5 h-3.5 text-wishes-secondary shrink-0" />
              <span>맞춤 신규 매물 알림 받기</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Star className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              <span>AI 맞춤 매물 추천 서비스</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>전문 상담사 우선 배정</span>
            </div>
          </div>
        </div>

        {/* 소셜 로그인 버튼들 */}
        <div className="px-8 pb-6 space-y-3">
          <button onClick={() => handleSocialLogin('kakao')} disabled={isLoading !== null} className="w-full flex items-center justify-center gap-3 h-[52px] rounded-xl font-semibold text-[15px] transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:opacity-60" style={{ backgroundColor: '#FEE500', color: '#191919' }}>
            {isLoading === 'kakao' ? <LoadingSpinner color="#191919" /> : (<><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.722 1.8 5.108 4.509 6.458l-.96 3.56c-.076.282.242.503.487.34l4.233-2.834c.56.068 1.136.104 1.731.104 5.523 0 10-3.463 10-7.628S17.523 3 12 3z"/></svg>카카오로 시작하기</>)}
          </button>
          <button onClick={() => handleSocialLogin('naver')} disabled={isLoading !== null} className="w-full flex items-center justify-center gap-3 h-[52px] rounded-xl font-semibold text-[15px] text-white transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:opacity-60" style={{ backgroundColor: '#03C75A' }}>
            {isLoading === 'naver' ? <LoadingSpinner color="#ffffff" /> : (<><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" transform="scale(0.7) translate(5, 5)"/></svg>네이버로 시작하기</>)}
          </button>
          <button onClick={() => handleSocialLogin('google')} disabled={isLoading !== null} className="w-full flex items-center justify-center gap-3 h-[52px] rounded-xl font-semibold text-[15px] text-gray-700 bg-white border-2 border-gray-200 transition-all duration-200 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] disabled:opacity-60">
            {isLoading === 'google' ? <LoadingSpinner color="#4285F4" /> : (<><svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Google로 시작하기</>)}
          </button>
        </div>

        {/* 하단 안내 */}
        <div className="px-8 pb-6 text-center">
          <p className="text-xs text-gray-400 leading-relaxed">
            로그인 시 <span className="underline cursor-pointer hover:text-gray-500">이용약관</span> 및 <span className="underline cursor-pointer hover:text-gray-500">개인정보 처리방침</span>에 동의합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner({ color }: { color: string }) {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke={color} strokeWidth="3" />
      <path className="opacity-75" fill={color} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}