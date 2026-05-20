'use client';

/**
 * /search-preview — /search 현대식 재구축 검증 페이지
 *
 * 레거시 /search (content.js + 패치 84개) → 통합 React 재구축.
 * 각 컴포넌트를 단계별로 완성·검증 → 검증 완료 후 /search 와 swap.
 *
 * P2 (2026-05-20): 헤더 — iOS 26.5 Liquid Glass. 대표님 확정 디자인.
 *
 * 인증: 이 페이지는 디자인 목업(placeholder)만 표시 — 실제 매물 데이터 없음.
 *   권한 게이트 제거 (기존 게이트가 owner 도 막던 버그). 실제 인증은
 *   재구축 완료 후 /search swap 시점에 /search 자체 인증 로직 적용.
 */

import { useState } from 'react';
import { SearchHeader } from '@/features/search-2026/components/SearchHeader';

export default function SearchPreviewPage() {
  const [query, setQuery] = useState('');

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
            <div style={{ width: 58, height: 58, borderRadius: 11, background: s.c, flex: 'none' }} />
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
