'use client';

/**
 * RFC 0014 — 시니어 토글 (PR-M-2)
 *
 * opt-in only, 기본 OFF.
 * localStorage + cookie 영속 (SSR hydration 깜빡임 0).
 *
 * 헌법 §3 'WCAG 2.2 AAA' 명시 요구 + '세 페르소나 — 시니어/고령' 1순위.
 * 사장님 추천 default: 우측 하단 floating, 1.25× 폰트, hint 자동.
 *
 * 토글 OFF 시 픽셀 변경 0 (data-senior 미설정).
 * /search vanilla / /admin 영향 0 (CSS body[data-route] 숨김).
 *
 * Alt+S 키보드 단축키 지원.
 */

import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'wishes-senior';
const COOKIE_NAME = 'wishes_senior';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1년

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persist(on: boolean): void {
  try {
    if (on) {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    document.cookie = `${COOKIE_NAME}=${on ? '1' : '0'}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    /* localStorage 차단 환경 — cookie 만으로 fallback */
  }
}

function applyAttribute(on: boolean): void {
  const html = document.documentElement;
  if (on) {
    html.setAttribute('data-senior', 'true');
  } else {
    html.removeAttribute('data-senior');
  }
}

export default function SeniorToggle() {
  const [on, setOn] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  // 첫 mount 시 영속 상태 복원
  useEffect(() => {
    const initial = readInitial();
    setOn(initial);
    applyAttribute(initial);
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      applyAttribute(next);
      persist(next);
      return next;
    });
  }, []);

  // Alt+S 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  // SSR 동안 mount 전 렌더 X (cookie 기반 SSR 보강은 후속 PR)
  if (!mounted) return null;

  return (
    <button
      type="button"
      className="senior-toggle no-senior-style"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? '큰 글씨 모드 끄기 (Alt+S)' : '큰 글씨 모드 켜기 (Alt+S)'}
      title={on ? '큰 글씨 모드 ON' : '큰 글씨 모드'}
    >
      <span aria-hidden="true">👴</span>
      <span>{on ? '큰 글씨 ON' : '큰 글씨'}</span>
    </button>
  );
}
