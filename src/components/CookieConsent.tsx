'use client';

import { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // 이미 동의한 경우 표시하지 않음
    const consent = localStorage.getItem('wishes_cookie_consent');
    if (!consent) {
      // 약간의 딜레이 후 표시 (UX 개선)
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('wishes_cookie_consent', 'accepted');
    setShow(false);
    // GA4 consent update
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('consent', 'update', {
        analytics_storage: 'granted',
      });
    }
  };

  const handleDecline = () => {
    localStorage.setItem('wishes_cookie_consent', 'declined');
    setShow(false);
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('consent', 'update', {
        analytics_storage: 'denied',
      });
    }
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 animate-fade-in-up">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl border border-wishes-border/60 p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-wishes-accent/10 flex items-center justify-center shrink-0">
            <Cookie className="w-5 h-5 text-wishes-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-wishes-text mb-1">쿠키 사용 안내</p>
            <p className="text-xs text-wishes-muted leading-relaxed">
              WISHES는 더 나은 서비스 제공을 위해 쿠키를 사용합니다.
              웹사이트 이용 분석 및 서비스 개선 목적으로 사용되며,
              개인정보는 안전하게 보호됩니다.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleAccept}
                className="px-5 py-2 bg-wishes-secondary text-white text-xs font-bold rounded-lg hover:bg-wishes-primary transition-colors"
              >
                동의
              </button>
              <button
                onClick={handleDecline}
                className="px-5 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                거부
              </button>
            </div>
          </div>
          <button
            onClick={handleDecline}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
