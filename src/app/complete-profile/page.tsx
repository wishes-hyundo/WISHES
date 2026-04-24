'use client';

export const dynamic = 'force-static';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase';

/**
 * /complete-profile
 *
 * 소셜 로그인(Kakao/Naver/Google) 직후 이름/연락처가 비어있는 경우 반드시 경유하는
 * 프로필 완성 페이지. 이미 값이 있으면 prefill 해서 사용자가 확인만 하도록 한다.
 * 제출 성공 시 return 쿼리(기본 /search)로 이동.
 */
function safePath(raw: string | null): string {
  const v = String(raw || '').trim();
  if (!v) return '/search';
  if (!v.startsWith('/')) return '/search';
  if (v.startsWith('//')) return '/search';
  if (v.includes('\\')) return '/search';
  if (v.length > 512) return '/search';
  return v;
}

function CompleteProfileForm() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safePath(params.get('return'));

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [pageState, setPageState] = useState<'checking' | 'form' | 'submitting' | 'done' | 'unauthenticated'>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const sb = createAuthClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) {
          setPageState('unauthenticated');
          setTimeout(() => { window.location.href = '/login'; }, 2000);
          return;
        }
        setToken(session.access_token);

        // 기존 name/phone prefill (user_metadata + /api/auth/me 모두 조회)
        const meta = session.user?.user_metadata || {};
        const prefilledName =
          meta.name || meta.full_name || '';
        const prefilledPhone = meta.phone || meta.mobile || '';

        setName(prefilledName);
        setPhone(prefilledPhone);

        // /api/auth/me 로 최신 admin_users 값 우선 조회
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const data = await res.json();
          if (data?.success && data.user) {
            if (data.user.name) setName(data.user.name);
            if (data.user.phone) setPhone(data.user.phone);
            // 이미 완성된 경우 바로 return
            if (data.user.name && data.user.phone) {
              // 프로필이 이미 완성 → 자동 이동
              setPageState('done');
              setTimeout(() => router.replace(returnTo), 400);
              return;
            }
          }
        } catch { /* noop */ }

        setPageState('form');
      } catch {
        setPageState('unauthenticated');
      }
    })();
  }, [router, returnTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      setError('이름을 1~100자로 입력해주세요.');
      return;
    }
    const phoneDigits = trimmedPhone.replace(/[^\d]/g, '');
    if (phoneDigits.length < 9 || phoneDigits.length > 15) {
      setError('올바른 연락처를 입력해주세요 (예: 010-0000-0000).');
      return;
    }
    if (!token) {
      setError('로그인 정보가 만료되었습니다. 다시 로그인해주세요.');
      return;
    }
    setPageState('submitting');
    try {
      const res = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmedName, phone: trimmedPhone }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.message || '저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
        setPageState('form');
        return;
      }
      setPageState('done');
      setTimeout(() => router.replace(returnTo), 600);
    } catch {
      setError('서버와의 통신에 실패했습니다.');
      setPageState('form');
    }
  };

  if (pageState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <div style={{ color: '#999', fontSize: 14 }}>프로필 확인 중...</div>
      </div>
    );
  }
  if (pageState === 'unauthenticated') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <div style={{ color: '#dc2626', fontSize: 14 }}>로그인이 필요합니다. 로그인 페이지로 이동합니다...</div>
      </div>
    );
  }
  if (pageState === 'done') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
          <div style={{ color: '#2D5A27', fontSize: 16, fontWeight: 600 }}>저장 완료</div>
          <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>잠시 후 이동합니다...</div>
        </div>
      </div>
    );
  }

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 440, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: '#2D5A27' }}>프로필 완성</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: 28, fontSize: 13, lineHeight: 1.6 }}>
          서비스 이용을 위해 이름과 연락처를<br />한 번만 입력해 주세요.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' }}>이름 *</label>
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' }}>연락처 *</label>
            <input
              type="tel"
              required
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>숫자만 입력하셔도 됩니다. 자동으로 하이픈이 추가됩니다.</div>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={pageState === 'submitting'}
            style={{ width: '100%', padding: '13px', background: pageState === 'submitting' ? '#94a3b8' : '#2D5A27', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: pageState === 'submitting' ? 'not-allowed' : 'pointer' }}
          >
            {pageState === 'submitting' ? '저장 중...' : '저장하고 계속하기'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#aaa' }}>
          입력하신 정보는 서비스 이용 및 중개사 연락을 위해서만 사용됩니다.
        </div>
      </div>
    </div>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>로딩 중...</div>}>
      <CompleteProfileForm />
    </Suspense>
  );
}
