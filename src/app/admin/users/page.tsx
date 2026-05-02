'use client';

// G-16 (2026-05-03): 사장님 명령 — 회원 관리 통합 (단순화).
//   /admin/users 와 /admin/command-center-v2 가 같은 목적 → V2 가 메인.
//   /admin/users 진입 시 자동으로 V2 로 redirect.
//   기존 사이드바 / bookmark 호환성 유지.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminUsersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/command-center-v2');
  }, [router]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
    }}>
      <div style={{ textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 16, marginBottom: 8 }}>회원 관리로 이동 중...</div>
        <div style={{ fontSize: 12 }}>Command Center 통합 페이지로 자동 이동합니다.</div>
      </div>
    </div>
  );
}
