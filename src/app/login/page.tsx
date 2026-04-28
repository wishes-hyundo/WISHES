'use client';

export const dynamic = 'force-static';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createAuthClient } from '@/lib/supabase';

// ⏱ 타임아웃 헬퍼
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// L-sec50 (2026-04-22): open redirect guard.
//   ?redirect=https://evil.com 로 피싱 리다이렉터 악용 방지.
//   same-origin path 만 허용: '/' 로 시작, '//' 아님, '\\' 없음.
function safeRedirect(raw: string | null | undefined): string {
  const v = String(raw || '').trim();
  if (!v) return '/search';
  if (!v.startsWith('/')) return '/search';
  if (v.startsWith('//')) return '/search';
  if (v.includes('\\')) return '/search';
  if (v.length > 512) return '/search';
  return v;
}

function LoginForm() {
  const params = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pageState, setPageState] = useState<'checking' | 'form' | 'redirecting'>('checking');
  const redirectedRef = useRef(false);

  function hardRedirect(url: string) {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    setPageState('redirecting');
    window.location.href = url;
  }

  // 이미 Supabase 세션이 있으면 바로 redirect
  useEffect(() => {
    if (redirectedRef.current) return;

    (async () => {
      try {
        const sb = createAuthClient();
        const { data: { session } } = await withTimeout(sb.auth.getSession(), 3000);
        if (session && !redirectedRef.current) {
          // 세션 유효 → ws_token 세팅 후 이동
          // sessionStorage + localStorage 이중 저장: 탭/브라우저 재시작에도 세션 유지
          try {
            const tok = session.access_token; // L-sec-bridge-remove (2026-04-24): prefix 제거, bare JWT 저장
            const now = Date.now().toString();
            sessionStorage.setItem('ws_token', tok);
            sessionStorage.setItem('ws_login_time', now);
            localStorage.setItem('ws_token', tok);
            localStorage.setItem('ws_login_time', now);
            // L-session2 (2026-04-24): refresh_token 도 저장 — 세션 만료 시 재발급용.
            //   Supabase-js 의 persistSession 이 특정 환경에서 localStorage 에 세션을
            //   저장하지 않아 refresh_token 유실 → 60분 후 강제 로그아웃 문제의 원인.
            if (session.refresh_token) {
              sessionStorage.setItem('ws_refresh_token', session.refresh_token);
              localStorage.setItem('ws_refresh_token', session.refresh_token);
            }
          } catch {}
          hardRedirect(redirect);
          return;
        }
      } catch {
        // Supabase 타임아웃 — 로그인 폼 표시
      }

      if (!redirectedRef.current) setPageState('form');
    })();
  }, [redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (redirectedRef.current) return;
    setError('');
    setLoading(true);

    try {
      const sb = createAuthClient();

      // L-login-fallback (2026-04-29): Supabase SDK 가 광고차단/확장/ISP 등에 의해
      //   직접 호출이 막힐 수 있음. 8초 timeout 후 server-side proxy /api/auth/login
      //   으로 자동 fallback. 응답 형식 일치 (token/refresh_token/user).
      let data: { session: { access_token: string; refresh_token: string | null } | null; user: { id: string } } | null = null;
      let supabaseFailed = false;

      try {
        const result = await withTimeout(
          sb.auth.signInWithPassword({ email: email.toLowerCase(), password }),
          8000,
        );
        if (result.error) {
          const msg = result.error.message || '';
          if (msg.includes('Invalid login') || msg.includes('invalid')) {
            setError('이메일 또는 비밀번호가 올바르지 않습니다.');
          } else {
            setError('로그인 실패: ' + msg);
          }
          setLoading(false);
          return;
        }
        data = result.data as typeof data;
      } catch {
        // Supabase SDK 직접 호출 실패 — server-side proxy 로 fallback
        supabaseFailed = true;
      }

      if (supabaseFailed) {
        try {
          const r = await withTimeout(
            fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ email: email.toLowerCase(), password }),
            }),
            10000,
          );
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            if (r.status === 401) {
              setError('이메일 또는 비밀번호가 올바르지 않습니다.');
            } else if (r.status === 403) {
              setError(j.message || '관리자 승인 대기 중입니다.');
            } else if (r.status === 429) {
              setError('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
            } else {
              setError('로그인 실패 — 잠시 후 다시 시도해주세요.');
            }
            setLoading(false);
            return;
          }
          const j = await r.json();
          if (!j.success || !j.token) {
            setError(j.message || '로그인 응답 처리 실패');
            setLoading(false);
            return;
          }
          // server proxy 응답 → SDK 와 동일 형식으로 정규화
          data = {
            session: {
              access_token: j.token,
              refresh_token: j.refresh_token || null,
            },
            user: { id: j.user?.id || '' },
          };
          // 사용자 정보도 즉시 저장 (me 단계 우회 가능)
          try {
            const userStr = JSON.stringify({
              email: j.user?.email || email,
              name: j.user?.name || '',
              role: j.user?.role || 'user',
              status: j.user?.status || 'approved',
            });
            sessionStorage.setItem('ws_user', userStr);
            localStorage.setItem('ws_user', userStr);
          } catch {}
        } catch {
          setError('서버 연결 시간 초과입니다. 잠시 후 다시 시도해주세요.');
          setLoading(false);
          return;
        }
      }

      if (!data) {
        setError('로그인 처리 실패');
        setLoading(false);
        return;
      }

      // 역할 및 승인 상태 확인 (5초 타임아웃)
      try {
        const meRes = await withTimeout(
          fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
          }),
          5000,
        );
        const meData = await meRes.json();

        if (!meData.success) {
          setError(meData.message || '사용자 정보 확인 실패');
          await sb.auth.signOut().catch(() => {});
          setLoading(false);
          return;
        }

        if (meData.user.status === 'pending') {
          setError('관리자 승인 대기 중입니다. 승인 후 이용 가능합니다.');
          await sb.auth.signOut().catch(() => {});
          setLoading(false);
          return;
        }

        if (meData.user.status === 'rejected') {
          setError('가입이 거절되었습니다. 관리자에게 문의하세요.');
          await sb.auth.signOut().catch(() => {});
          setLoading(false);
          return;
        }

        // ✅ 승인된 회원 → 세션 토큰 저장
        // sessionStorage + localStorage 이중 저장: 탭/브라우저 재시작에도 세션 유지
        try {
          const tok = data.session?.access_token || ''; // L-sec-bridge-remove: prefix 제거
          const userStr = JSON.stringify({
            email: meData.user.email,
            name: meData.user.name,
            role: meData.user.role,
            status: meData.user.status,
          });
          const now = Date.now().toString();
          sessionStorage.setItem('ws_token', tok);
          sessionStorage.setItem('ws_user', userStr);
          sessionStorage.setItem('ws_login_time', now);
          localStorage.setItem('ws_token', tok);
          localStorage.setItem('ws_user', userStr);
          localStorage.setItem('ws_login_time', now);
          // L-session2 (2026-04-24): refresh_token 이중 저장 (세션 갱신용)
          if (data.session?.refresh_token) {
            sessionStorage.setItem('ws_refresh_token', data.session.refresh_token);
            localStorage.setItem('ws_refresh_token', data.session.refresh_token);
          }
        } catch {}

      } catch {
        // /api/auth/me 타임아웃 → Supabase 인증은 성공했으므로 기본 토큰만 저장
        try {
          const tok = data.session?.access_token || ''; // L-sec-bridge-remove: prefix 제거
          const now = Date.now().toString();
          sessionStorage.setItem('ws_token', tok);
          sessionStorage.setItem('ws_login_time', now);
          localStorage.setItem('ws_token', tok);
          localStorage.setItem('ws_login_time', now);
          // L-session2 (2026-04-24): refresh_token 이중 저장 (세션 갱신용)
          if (data.session?.refresh_token) {
            sessionStorage.setItem('ws_refresh_token', data.session.refresh_token);
            localStorage.setItem('ws_refresh_token', data.session.refresh_token);
          }
        } catch {}
      }

      hardRedirect(redirect);
    } catch {
      setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      setLoading(false);
    }
  };

  // 리다이렉트 중
  if (pageState === 'redirecting') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#2D5A27', marginBottom: 8 }}>로그인 성공</div>
          <div style={{ color: '#999', fontSize: 14 }}>페이지 이동 중...</div>
        </div>
      </div>
    );
  }

  // 초기 세션 체크 중 (최대 3초)
  if (pageState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <div style={{ color: '#999', fontSize: 14 }}>확인 중...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: '#2D5A27' }}>WISHES 중개사 포털</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: 30, fontSize: 14 }}>로그인하여 매물 검색을 시작하세요</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' }}>이메일</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' }}>비밀번호</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '13px', background: loading ? '#94a3b8' : '#2D5A27', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#666' }}>
          아직 계정이 없으신가요?{' '}
          <Link href="/signup" style={{ color: '#2D5A27', fontWeight: 600, textDecoration: 'none' }}>회원가입</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>로딩 중...</div>}>
      <LoginForm />
    </Suspense>
  );
}
