'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/adminFetch';
import { useAdminSession } from '@/lib/useAdminSession';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  company: string;
  role: string;
  status: string;
  reason?: string;
  created_at?: string;
}

// P3-2 (2026-05-03): 고객 명부 (profiles 테이블)
interface CustomerUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  source: string;
  purpose?: string;
  budget_min?: number;
  budget_max?: number;
  move_in_date?: string;
  profile_level?: number;
  profile_completed?: boolean;
  created_at?: string;
  last_sign_in_at?: string;
  last_engagement_at?: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  // L-session-unify (2026-04-24): useAdminSession 사용.
  //   이전에는 인라인으로 Supabase getSession() 만 확인해 admin-auth.html 경로
  //   로그인 사용자가 /admin/users 진입 시 /login 으로 튕기는 문제 발생.
  const { token } = useAdminSession('/admin/users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [customers, setCustomers] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [roleChecked, setRoleChecked] = useState(false);
  // P3-2 (2026-05-03): 두 탭 (운영자/고객) — 사장님 명령
  const [tab, setTab] = useState<'staff' | 'customer'>('staff');

  // superadmin 역할 체크 (token 확보 후)
  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        const meData = await meRes.json();
        if (ac.signal.aborted) return;
        // Phase 1 (2026-04-28): owner(신)/superadmin(legacy) 모두 허용. admin 등급은 SELECT 까지.
        const ALLOWED = new Set(['owner', 'superadmin', 'admin', 'master']);
        if (!meData.success || !ALLOWED.has(meData.user.role)) {
          alert('관리자만 접근 가능합니다.');
          router.replace('/');
          return;
        }
        setRoleChecked(true);
      } catch (err: any) {
        if (ac.signal.aborted || err?.name === 'AbortError') return;
        /* verify 실패는 무시 — token 자체는 유효 */
        setRoleChecked(true);
      }
    })();
    return () => ac.abort();
  }, [token, router]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const url = tab === 'customer' ? '/api/admin/users?type=customer' : '/api/admin/users';
      const res = await adminFetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (tab === 'customer') {
        if (data.users) setCustomers(data.users);
      } else {
        if (data.users) setUsers(data.users);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [token, tab]);

  useEffect(() => {
    if (token && roleChecked) loadUsers();
  }, [token, roleChecked, loadUsers, tab]);

  // L-useradmin-dedupe (2026-04-24): 동명이인 구별 라벨 생성.
  //   "위시스"가 일반 이메일과 카카오 OAuth 에 중복 존재 → 이메일 특징을
  //   라벨로 붙여 UI 에서 혼동 없이 구분.
  const userDisplayName = (u: AdminUser): string => {
    const base = u.name || '(이름 없음)';
    const sameName = users.filter(x => (x.name || '') === (u.name || ''));
    if (sameName.length <= 1) return base;
    const email = (u.email || '').toLowerCase();
    let suffix = '';
    if (email.startsWith('kakao_')) suffix = ' (카카오)';
    else if (email.startsWith('naver_')) suffix = ' (네이버)';
    else if (email.startsWith('google_')) suffix = ' (구글)';
    else if (email.includes('@')) suffix = ` (${email.split('@')[0]})`;
    return `${base}${suffix}`;
  };

  const updateStatus = async (userId: string, newStatus: 'approved' | 'rejected') => {
    if (!confirm(newStatus === 'approved' ? '이 사용자를 승인하시겠습니까?' : '이 사용자를 거절하시겠습니까?')) return;
    try {
      const action = newStatus === 'approved' ? 'approve' : 'reject';
      // Phase 1 (2026-04-28): 신 5단계 enum 기본 라벨 'broker' (legacy 'agent' 매핑됨).
      const body = newStatus === 'approved'
        ? { userId, action, role: 'broker' }
        : { userId, action };
      const res = await adminFetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success !== false) {
        loadUsers();
      } else {
        alert('처리 실패: ' + (data.error || data.message || '알 수 없는 오류'));
      }
    } catch (e) {
      alert('서버 오류');
      console.error(e);
    }
  };

  const filteredUsers = filter === 'all' ? users : users.filter(u => u.status === filter);

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <header style={{ background: '#2D5A27', color: '#fff', padding: '14px 24px' }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>회원 관리</h1>
      </header>

      <div style={{ padding: 24 }}>
        {/* P3-2 (2026-05-03): 두 탭 (운영자 / 고객) */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
          <button
            onClick={() => setTab('staff')}
            style={{ padding: '12px 24px', background: 'transparent', color: tab === 'staff' ? '#2D5A27' : '#9ca3af', border: 'none', borderBottom: tab === 'staff' ? '3px solid #2D5A27' : '3px solid transparent', cursor: 'pointer', fontSize: 14, fontWeight: 700, marginBottom: '-2px' }}
          >
            운영자/직원 ({users.length})
          </button>
          <button
            onClick={() => setTab('customer')}
            style={{ padding: '12px 24px', background: 'transparent', color: tab === 'customer' ? '#2D5A27' : '#9ca3af', border: 'none', borderBottom: tab === 'customer' ? '3px solid #2D5A27' : '3px solid transparent', cursor: 'pointer', fontSize: 14, fontWeight: 700, marginBottom: '-2px' }}
          >
            고객 ({customers.length})
          </button>
        </div>

        {tab === 'staff' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{ padding: '8px 16px', background: filter === s ? '#2D5A27' : '#fff', color: filter === s ? '#fff' : '#333', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              {s === 'pending' ? '승인 대기' : s === 'approved' ? '승인됨' : s === 'rejected' ? '거절됨' : '전체'}
              {' '}({users.filter(u => s === 'all' || u.status === s).length})
            </button>
          ))}
        </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>로딩 중...</div>}

        {/* P3-2: tab === 'staff' (운영자 명부) */}
        {tab === 'staff' && !loading && filteredUsers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 10, color: '#9ca3af' }}>
            해당하는 사용자가 없습니다.
          </div>
        )}

        {tab === 'staff' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredUsers.map(u => (
            <div key={u.id} style={{ background: '#fff', padding: 18, borderRadius: 10, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{userDisplayName(u)}</div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: u.status === 'approved' ? '#dcfce7' : u.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                    color: u.status === 'approved' ? '#16a34a' : u.status === 'rejected' ? '#dc2626' : '#d97706'
                  }}>{u.status === 'approved' ? '승인됨' : u.status === 'rejected' ? '거절됨' : '승인 대기'}</span>
                  {u.role && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#e0e7ff', color: '#4338ca' }}>{u.role}</span>}
                </div>
                <div style={{ fontSize: 13, color: '#4b5563' }}>{u.email}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  {u.phone && <span>{u.phone}</span>}
                  {u.company && <span> · {u.company}</span>}
                </div>
                {u.reason && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, fontStyle: 'italic' }}>&quot;{u.reason}&quot;</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {u.status !== 'approved' && (
                  <button onClick={() => updateStatus(u.id, 'approved')} style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>승인</button>
                )}
                {u.status !== 'rejected' && (
                  <button onClick={() => updateStatus(u.id, 'rejected')} style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>거절</button>
                )}
              </div>
            </div>
          ))}
        </div>
        )}

        {/* P3-2: tab === 'customer' (고객 명부) */}
        {tab === 'customer' && !loading && customers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 10, color: '#9ca3af' }}>
            등록된 고객이 없습니다.
          </div>
        )}

        {tab === 'customer' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {customers.map(c => {
            const sourceLabel = c.source === 'kakao' ? '카카오' : c.source === 'naver' ? '네이버' : c.source === 'google' ? '구글' : '이메일';
            const sourceBg = c.source === 'kakao' ? '#fef3c7' : c.source === 'naver' ? '#dcfce7' : c.source === 'google' ? '#e0e7ff' : '#f3f4f6';
            const sourceColor = c.source === 'kakao' ? '#d97706' : c.source === 'naver' ? '#16a34a' : c.source === 'google' ? '#4338ca' : '#6b7280';
            return (
              <div key={c.id} style={{ background: '#fff', padding: 18, borderRadius: 10, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{c.name || '(이름 없음)'}</div>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: sourceBg, color: sourceColor }}>{sourceLabel}</span>
                    {c.profile_completed && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#dcfce7', color: '#16a34a' }}>프로필 완료</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#4b5563' }}>{c.email}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    {c.phone && <span>{c.phone}</span>}
                    {c.purpose && <span> · 목적: {c.purpose === 'residence' ? '거주' : c.purpose === 'investment' ? '투자' : c.purpose === 'lease' ? '임대' : '기타'}</span>}
                    {c.budget_min && c.budget_max && <span> · 예산: {c.budget_min}~{c.budget_max}만원</span>}
                    {c.move_in_date && <span> · 입주: {c.move_in_date}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    가입: {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : '?'}
                    {c.last_sign_in_at && ` · 마지막 접속: ${new Date(c.last_sign_in_at).toLocaleDateString('ko-KR')}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
