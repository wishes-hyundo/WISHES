'use client';

export const dynamic = 'force-static';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createAuthClient } from '@/lib/supabase';

/**
 * /reset-password
 *
 * Supabase "Reset Password" 이메일의 링크가 착지하는 페이지.
 * 링크에는 access_token 이 포함돼 있어 createAuthClient() 의
 * detectSessionInUrl:true 가 자동으로 URL 에서 세션을 파싱한다.
 * 세션이 성공적으로 감지되면 updateUser({ password }) 로 새 비밀번호를 설정한다.
 *
 * Supabase 대시보드 설정 (사용자가 직접 해야 함):
 *   Authentication → URL Configuration → Redirect URLs 에
 *     https://wishes.co.kr/reset-password
 *     http://localhost:3000/reset-password  (개발용)
 *   두 URL 을 허용 목록에 등록해야 이메일 링크가 정상 동작한다.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState<'checking' | 'ready' | 'missing'>('checking');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // 이메일 링크로 착지한 직후 Supabase 가 URL hash 의 token 을 세션으로 변환할 시간을 준다.
  // (detectSessionInUrl:true 가 자동 수행)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const sb = createAuthClient();
        // 짧게 폴링 — hash 파싱은 보통 즉시지만 안전하게 최대 3초 대기.
        for (let i = 0; i < 15; i++) {
          if (cancelled) return;
          const { data } = await sb.auth.getSession();
          if (data.session) {
            setSessionReady('ready');
            return;
          }
          await new Promise((r) => setTimeout(r, 200));
        }
        setSessionReady('missing');
      } catch {
        setSessionReady('missing');
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const validatePassword = (p: string) => {
    if (p.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
    if (!/[a-zA-Z]/.test(p)) return '영문자를 최소 1자 포함해야 합니다.';
    if (!/[0-9]/.test(p)) return '숫자를 최소 1자 포함해야 합니다.';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const v = validatePassword(password);
    if (v) {
      setError(v);
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setLoading(true);
    try {
      const sb = createAuthClient();
      const { error: updateError } = await sb.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || '비밀번호 변경에 실패했습니다.');
        setLoading(false);
        return;
      }
      // 안전: 재로그인 유도를 위해 세션 종료
      await sb.auth.signOut().catch(() => {});
      setDone(true);
      setLoading(false);
    } catch {
      setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✓</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, color: '#2D5A27' }}>비밀번호가 변경되었습니다</h2>
          <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 24 }}>새 비밀번호로 로그인해 주세요.</p>
          <button
            onClick={() => router.push('/login')}
            style={{ padding: '12px 28px', background: '#2D5A27', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            로그인 페이지로
          </button>
        </div>
      </div>
    );
  }

  if (sessionReady === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <div style={{ color: '#999', fontSize: 14 }}>링크 검증 중...</div>
      </div>
    );
  }

  if (sessionReady === 'missing') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#dc2626' }}>링크가 만료되었거나 유효하지 않습니다</h2>
          <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 24, fontSize: 14 }}>
            비밀번호 재설정 링크는 보안상 1시간만 유효해요.<br />
            새로운 링크를 받아 다시 시도해 주세요.
          </p>
          <Link href="/forgot-password" style={{ display: 'inline-block', padding: '12px 28px', background: '#2D5A27', color: '#fff', borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
            다시 요청하기
          </Link>
        </div>
      </div>
    );
  }

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: '#2D5A27' }}>새 비밀번호 설정</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: 30, fontSize: 13 }}>
          안전한 새 비밀번호를 입력해 주세요.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' }}>새 비밀번호 (8자 이상, 영문+숫자)</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' }}>새 비밀번호 확인</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              style={inputStyle}
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
            {loading ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>로딩 중...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
