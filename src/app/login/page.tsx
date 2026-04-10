'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createAuthClient } from '@/lib/supabase';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') || '/search';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 이미 로그인되어 있으면 바로 redirect
  useEffect(() => {
    const sb = createAuthClient();
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(redirect);
    });
  }, [router, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const sb = createAuthClient();
      const { data, error: authErr } = await sb.auth.signInWithPassword({
        email: email.toLowerCase(),
        password,
      });

      if (authErr) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        setLoading(false);
        return;
      }

      // 역할 및 승인 상태 확인
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}` }
      });
      const meData = await meRes.json();

      if (!meData.success) {
        setError(meData.message || '사용자 정보 확인 실패');
        await sb.auth.signOut();
        setLoading(false);
        return;
      }

      if (meData.user.status === 'pending') {
        setError('관리자 승인 대기 중입니다. 승인 후 이용 가능합니다.');
        await sb.auth.signOut();
        setLoading(false);
        return;
      }

      if (meData.user.status === 'rejected') {
        setError('가입이 거절되었습니다. 관리자에게 문의하세요.');
        await sb.auth.signOut();
        setLoading(false);
        return;
      }

      // 승인됨 → 리다이렉트
      router.replace(redirect);
    } catch {
      setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      setLoading(false);
    }
  };

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
