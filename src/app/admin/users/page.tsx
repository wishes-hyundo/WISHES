'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminFetch';

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

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  // 인증 체크
  useEffect(() => {
    // L-leak3: unmount 시 /api/auth/me 응답이 늦게 와도 setState 안 하게 차단.
    const ac = new AbortController();
    (async () => {
      try {
        const sb = createAuthClient();
        const { data: { session } } = await sb.auth.getSession();
        if (ac.signal.aborted) return;
        if (!session) {
          router.replace('/login?redirect=/admin/users');
          return;
        }
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        const meData = await meRes.json();
        if (ac.signal.aborted) return;
        if (!meData.success || meData.user.role !== 'superadmin') {
          alert('관리자만 접근 가능합니다.');
          router.replace('/');
          return;
        }
        setToken(session.access_token);
      } catch (err: any) {
        if (ac.signal.aborted || err?.name === 'AbortError') return;
        throw err;
      }
    })();
    return () => ac.abort();
  }, [router]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch.
      const res = await adminFetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (token) loadUsers();
  }, [token, loadUsers]);

  const updateStatus = async (userId: string, newStatus: 'approved' | 'rejected') => {
    if (!confirm(newStatus === 'approved' ? '이 사용자를 승인하시겠습니까?' : '이 사용자를 거절하시겠습니까?')) return;
    try {
      const action = newStatus === 'approved' ? 'approve' : 'reject';
      const body = newStatus === 'approved'
        ? { userId, action, role: 'agent' }
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
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>직원 승인 관리</h1>
      </header>

      <div style={{ padding: 24 }}>
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

        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>로딩 중...</div>}

        {!loading && filteredUsers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 10, color: '#9ca3af' }}>
            해당하는 사용자가 없습니다.
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {filteredUsers.map(u => (
            <div key={u.id} style={{ background: '#fff', padding: 18, borderRadius: 10, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{u.name || '(이름 없음)'}</div>
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
      </div>
    </div>
  );
}
