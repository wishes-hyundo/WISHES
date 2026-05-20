'use client';

/**
 * /search-preview — /search 현대식 재구축 검증 페이지 (Owner/Admin 전용)
 *
 * 레거시 /search (content.js + 패치 84개) → 통합 React 재구축.
 * 각 컴포넌트를 단계별로 완성·검증 → 검증 완료 후 /search 와 swap.
 *
 * P2 (2026-05-20): 헤더 — iOS 26.5 Liquid Glass. 대표님 확정 디자인.
 *   유리 헤더가 sticky 로 떠 있어 스크롤 시 뒤 콘텐츠가 비침.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchHeader } from '@/features/search-2026/components/SearchHeader';

const ALLOWED_ROLES = new Set(['owner', 'superadmin', 'admin', 'master']);

export default function SearchPreviewPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<'loading' | 'denied' | 'ok'>('loading');
  const [role, setRole] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let token = '';
    try {
      token = sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
    } catch {}
    if (!token) {
      router.replace('/login?next=/search-preview');
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && ALLOWED_ROLES.has(d.user?.role)) {
          setAuthState('ok');
          setRole(d.user.role);
        } else {
          setAuthState('denied');
          setRole(d?.user?.role || 'unknown');
        }
      })
      .catch(() => setAuthState('denied'));
  }, [router]);

  if (authState === 'loading') {
    return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>권한 확인 중...</div>;
  }

  if (authState === 'denied') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f5',
        }}
      >
        <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <h1 style={{ color: '#2D5A27', marginBottom: 12, fontSize: 18 }}>
            검증 페이지 접근 권한 없음
          </h1>
          <p style={{ fontSize: 13, color: '#666' }}>
            /search-preview 는 Owner/Admin 전용입니다. (현재 권한: {role})
          </p>
          <button
            onClick={() => router.replace('/search')}
            style={{
              marginTop: 14,
              padding: '8px 20px',
              background: '#2D5A27',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            /search 로 이동
          </button>
        </div>
      </div>
    );
  }

  // 스크롤 시 유리 헤더 너머로 비치는 효과 확인용 임시 콘텐츠
  const sample = [
    { c: 'linear-gradient(135deg,#a6c8ad,#688f70)', deal: '#34C759' },
    { c: 'linear-gradient(135deg,#bfcce6,#8597c4)', deal: '#2D5A27' },
    { c: 'linear-gradient(135deg,#ead4c5,#cba98c)', deal: '#34C759' },
    { c: 'linear-gradient(135deg,#d8c8ea,#a98aca)', deal: '#2D5A27' },
    { c: 'linear-gradient(135deg,#a6c8ad,#688f70)', deal: '#34C759' },
    { c: 'linear-gradient(135deg,#bfcce6,#8597c4)', deal: '#2D5A27' },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,#EDEEF0,#E7E9EC)',
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard','Malgun Gothic',sans-serif",
      }}
    >
      <SearchHeader
        query={query}
        onQueryChange={setQuery}
        onReset={() => setQuery('')}
        onSearch={(v) => console.log('[search-preview] 검색:', v)}
      />

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#9398a0', textAlign: 'center', padding: '6px 0 10px' }}>
          ── 헤더 재구축 검증 (P2) · 위로 스크롤하면 유리 헤더 효과 확인 ──
        </div>
        {sample.concat(sample).map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 11,
              alignItems: 'center',
              background: '#fff',
              borderRadius: 15,
              padding: 11,
              boxShadow: '0 1px 3px rgba(0,0,0,.05)',
            }}
          >
            <div
              style={{ width: 58, height: 58, borderRadius: 11, background: s.c, flex: 'none' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ height: 9, width: '55%', background: '#1d1d1f', opacity: 0.82, borderRadius: 3 }} />
              <div style={{ height: 7, width: '84%', background: '#e4e5e8', borderRadius: 3, marginTop: 8 }} />
              <div style={{ height: 7, width: '46%', background: '#eef0f1', borderRadius: 3, marginTop: 6 }} />
            </div>
            <div style={{ padding: '6px 10px', background: '#EAF7EC', borderRadius: 8 }}>
              <div style={{ height: 9, width: 36, background: s.deal, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
