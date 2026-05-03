'use client';

// G-42 (2026-05-03): /command → /admin/command-center-v2 단일화.
//   /command 는 V2 precursor 로 더 이상 어디서도 링크되지 않음.
//   사장님 "통합" 명령 (G-16) 의 후속 — V2 가 canonical, 나머지는 redirect.

import { useEffect } from 'react';

export default function CommandRedirect() {
  useEffect(() => {
    window.location.replace('/admin/command-center-v2');
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Pretendard, system-ui, sans-serif', color: '#6b7280' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 14 }}>Command Center V2 로 이동 중...</p>
        <p style={{ fontSize: 12, marginTop: 8 }}><a href="/admin/command-center-v2" style={{ color: '#2D5A27' }}>바로 가기 →</a></p>
      </div>
    </div>
  );
}
