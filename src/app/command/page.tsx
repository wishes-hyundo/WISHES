'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * /command — WISHES Command Center (React 재구축 버전, 2026-04-24)
 *
 * 기존 /admin/command-center.html (정적 HTML + 수동 DOM 조작) 이
 *  - 직접 sessionStorage/localStorage/cookie 를 다루다 동기 실패를 삼켜버려
 *    "토스트는 성공인데 DB 는 변화 없음" 같은 유령 버그를 반복 양산
 *  - F12 차단·console 오버라이드 같은 안티-디버깅으로 운영 중 진단 불가
 *  - React state 없이 화면 갱신은 innerHTML 대입으로만 → 파이프라인 단절
 *
 * 이 페이지는 위 문제를 전면 해결:
 *  - useState/useEffect/useCallback 기반 단일 소스 상태 관리
 *  - fetcher 한 곳에 Authorization + X-CSRF-Token + credentials + 401 자동 refresh + 403 CSRF 재발급
 *  - 각 mutation 호출 후 즉시 loadUsers() 를 재호출해 UI 와 DB 동기화
 *  - TypeScript 로 응답 스키마 명시 → 은폐된 실패 경로 차단
 *  - /admin/layout.tsx 의 refresh loop 도 그대로 상속
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type Role = 'superadmin' | 'admin' | 'agent' | 'viewer' | 'user' | string;
type Status = 'approved' | 'pending' | 'rejected' | 'blocked' | string;

interface AdminUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  company: string;
  role: Role;
  status: Status;
  created_at?: string;
  last_sign_in_at?: string | null;
}

interface UsersListResponse {
  success: boolean;
  users: AdminUser[];
  total?: number;
  pending?: number;
  approved?: number;
  error?: string;
}

type Toast = { id: number; kind: 'success' | 'error' | 'warn' | 'info'; text: string };

const ROLE_META: Record<string, { bg: string; fg: string; label: string }> = {
  superadmin: { bg: 'rgba(237,137,54,.18)', fg: '#ed8936', label: 'superadmin' },
  admin: { bg: 'rgba(66,153,225,.18)', fg: '#4299e1', label: 'admin' },
  agent: { bg: 'rgba(56,161,105,.18)', fg: '#38a169', label: 'agent' },
  viewer: { bg: 'rgba(214,158,46,.18)', fg: '#d69e2e', label: 'viewer' },
  user: { bg: 'rgba(122,154,122,.18)', fg: '#a0aec0', label: 'user' },
};

const STATUS_META: Record<string, { bg: string; fg: string; label: string }> = {
  approved: { bg: 'rgba(56,161,105,.15)', fg: '#38a169', label: '승인됨' },
  pending: { bg: 'rgba(214,158,46,.15)', fg: '#d69e2e', label: '대기중' },
  rejected: { bg: 'rgba(160,174,192,.15)', fg: '#a0aec0', label: '거절됨' },
  blocked: { bg: 'rgba(229,62,62,.15)', fg: '#e53e3e', label: '차단됨' },
};

function rolePill(role: Role) {
  const m = ROLE_META[role] || ROLE_META.user;
  return { bg: m.bg, fg: m.fg, label: m.label };
}
function statusPill(status: Status) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return { bg: m.bg, fg: m.fg, label: m.label };
}

/* ───────────────────────────────────────────────
 * 세션/토큰 관리 — 중앙집중식 헬퍼
 * ─────────────────────────────────────────────── */
function getStoredToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
}
function getStoredCsrf(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('ws_csrf') || '';
}
function getStoredRefreshToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('ws_refresh_token') || localStorage.getItem('ws_refresh_token') || '';
}

async function refreshAccessToken(): Promise<boolean> {
  const rt = getStoredRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch('/api/auth/refresh-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const j = await res.json();
    if (!j?.success || !j?.access_token) return false;
    const newToken = j.access_token; // L-sec-bridge-remove: prefix 제거
    sessionStorage.setItem('ws_token', newToken);
    localStorage.setItem('ws_token', newToken);
    if (j.refresh_token) {
      sessionStorage.setItem('ws_refresh_token', j.refresh_token);
      localStorage.setItem('ws_refresh_token', j.refresh_token);
    }
    if (j.expires_at) {
      sessionStorage.setItem('ws_token_expires_at', String(j.expires_at));
    }
    const now = Date.now().toString();
    sessionStorage.setItem('ws_login_time', now);
    localStorage.setItem('ws_login_time', now);

    // ws_session HttpOnly 쿠키 + ws_csrf 갱신
    try {
      const res2 = await fetch('/api/auth/cookie-issue', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: j.access_token }),
      });
      if (res2.ok) {
        const k = await res2.json();
        if (k?.success && k?.csrfToken) sessionStorage.setItem('ws_csrf', k.csrfToken);
      }
    } catch { /* ignore cookie sync failure — apiCall will retry on 403 */ }
    return true;
  } catch {
    return false;
  }
}

async function reissueCookie(): Promise<boolean> {
  const token = getStoredToken();
  const raw = token.startsWith('admin_bridge_') ? token.slice('admin_bridge_'.length) : token;
  if (!raw.startsWith('eyJ')) return false;
  try {
    const res = await fetch('/api/auth/cookie-issue', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: raw }),
    });
    if (!res.ok) return false;
    const j = await res.json();
    if (j?.success && j?.csrfToken) {
      sessionStorage.setItem('ws_csrf', j.csrfToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function apiCall<T>(
  endpoint: string,
  init: RequestInit & { retriedRefresh?: boolean; retriedCsrf?: boolean } = {},
): Promise<ApiResult<T>> {
  const token = getStoredToken();
  const csrf = getStoredCsrf();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (csrf) headers['X-CSRF-Token'] = csrf;

  const res = await fetch(endpoint, { ...init, headers, credentials: 'include' });

  // 401 → refresh + retry
  if (res.status === 401 && !init.retriedRefresh) {
    const ok = await refreshAccessToken();
    if (ok) return apiCall<T>(endpoint, { ...init, retriedRefresh: true });
    return { ok: false, status: 401, error: '세션 만료. 다시 로그인해주세요.' };
  }

  // 403 CSRF → reissue + retry
  if (res.status === 403 && !init.retriedCsrf) {
    const body = await res.clone().json().catch(() => null);
    const isCsrf = body?.error && /CSRF/i.test(body.error);
    if (isCsrf) {
      const ok = await reissueCookie();
      if (ok) return apiCall<T>(endpoint, { ...init, retriedCsrf: true });
    }
  }

  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const errMsg =
      (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${res.status}`) || `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: errMsg };
  }
  return { ok: true, data: body as T };
}

/* ───────────────────────────────────────────────
 * Toast 간단 구현 — 라이브러리 없이
 * ─────────────────────────────────────────────── */
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);
  return { toasts, push };
}

/* ───────────────────────────────────────────────
 * 메인 페이지
 * ─────────────────────────────────────────────── */
export default function CommandCenterPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'blocked'>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // userId currently being mutated
  const { toasts, push } = useToasts();

  // 로그인/슈퍼어드민 가드
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = getStoredToken();
    if (!token) {
      window.location.href = '/admin/admin-auth.html';
      return;
    }
    let userObj: { role?: string } | null = null;
    try { userObj = JSON.parse(sessionStorage.getItem('ws_user') || localStorage.getItem('ws_user') || 'null'); } catch { userObj = null; }
    if (userObj?.role !== 'superadmin') {
      setAuthError('슈퍼어드민만 접근 가능합니다.');
      setTimeout(() => { window.location.href = '/admin/admin-auth.html'; }, 1500);
      return;
    }
    setAuthChecking(false);

    // 진입 시 쿠키/리프레시 한 번 먼저 돌려 CSRF 동기화
    (async () => {
      if (getStoredRefreshToken()) await refreshAccessToken();
      else await reissueCookie();
    })();
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    const res = await apiCall<UsersListResponse>('/api/admin/users', { method: 'GET' });
    if (!res.ok) {
      setFetchError(`${res.status} · ${res.error}`);
      setLoading(false);
      if (res.status === 401) {
        push('error', '세션이 만료되었습니다. 다시 로그인해주세요.');
        setTimeout(() => { window.location.href = '/admin/admin-auth.html'; }, 1500);
      }
      return;
    }
    setUsers(res.data.users || []);
    setLoading(false);
  }, [push]);

  useEffect(() => {
    if (!authChecking) void loadUsers();
  }, [authChecking, loadUsers]);

  const filtered = useMemo(() => {
    let list = users;
    if (filter === 'pending') list = list.filter((u) => u.status === 'pending');
    else if (filter === 'approved') list = list.filter((u) => u.status === 'approved');
    else if (filter === 'blocked') list = list.filter((u) => u.status === 'blocked');
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        (u.company || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [users, filter, query]);

  const counts = useMemo(() => ({
    total: users.length,
    pending: users.filter((u) => u.status === 'pending').length,
    approved: users.filter((u) => u.status === 'approved').length,
    blocked: users.filter((u) => u.status === 'blocked').length,
  }), [users]);

  async function mutate(
    action: 'approve' | 'reject' | 'change_role' | 'block' | 'unblock',
    user: AdminUser,
    extra?: { role?: string },
  ) {
    setBusy(user.id);
    const body: Record<string, unknown> = { userId: user.id, action };
    if (extra?.role) body.role = extra.role;
    const res = await apiCall<{ success: boolean; message?: string; error?: string; dbUpdated?: boolean; metaUpdated?: boolean }>('/api/admin/users', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      push('error', `${action} 실패: ${res.error}`);
      return;
    }
    if (!res.data.dbUpdated) {
      push('warn', `${user.name || user.email}: 서버 DB 업데이트가 확인되지 않았어요. 관리자에게 알려주세요.`);
    } else {
      const msg =
        action === 'change_role' ? `${user.name} 님 역할 → ${extra?.role}`
        : action === 'approve' ? `${user.name} 님 승인 완료`
        : action === 'reject' ? `${user.name} 님 거절`
        : action === 'block' ? `${user.name} 님 차단`
        : action === 'unblock' ? `${user.name} 님 차단 해제`
        : '완료';
      push('success', msg);
    }
    void loadUsers();
  }

  async function removeUser(user: AdminUser) {
    if (user.role === 'superadmin') {
      push('error', '슈퍼어드민은 삭제할 수 없습니다.');
      return;
    }
    const ok = typeof window !== 'undefined'
      ? window.confirm(`[강제 탈퇴]\n\n${user.name || user.email} (${user.email})\n이 계정을 영구 삭제합니다. 복구 불가.\n\n계속하시겠습니까?`)
      : false;
    if (!ok) return;
    setBusy(user.id);
    const res = await apiCall<{ success: boolean; error?: string }>('/api/admin/users', {
      method: 'DELETE',
      body: JSON.stringify({ userId: user.id }),
    });
    setBusy(null);
    if (!res.ok) { push('error', `삭제 실패: ${res.error}`); return; }
    push('success', `${user.name || user.email} 삭제 완료`);
    void loadUsers();
  }

  async function onRoleChange(user: AdminUser, newRole: string) {
    if (newRole === user.role) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm(`${user.name} 님의 역할을 "${newRole}"(으)로 변경할까요?`)
      : false;
    if (!ok) return;
    await mutate('change_role', user, { role: newRole });
  }

  /* ── render ── */
  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f0a', color: '#e8f0e8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: 0.7 }}>인증 확인 중...</div>
      </div>
    );
  }
  if (authError) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f0a', color: '#fc8181', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>{authError}</div>
      </div>
    );
  }

  const bg = '#0a0f0a', card = '#111a11', border = '#1e2e1e', text = '#e8f0e8', dim = '#7a9a7a';

  return (
    <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: "'Segoe UI',Tahoma,sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 24px', borderBottom: `1px solid ${border}`, background: card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#2D5A27,#4CAF50)', display: 'grid', placeItems: 'center', fontSize: 18 }}>🛡️</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1.5 }}>WISHES</div>
            <div style={{ fontSize: 10, color: dim, letterSpacing: 2, textTransform: 'uppercase' }}>Command Center</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <a href="/admin" style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`, color: text, textDecoration: 'none', fontSize: 13 }}>관리자 홈</a>
        <button onClick={() => loadUsers()} disabled={loading} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`, color: text, background: card, cursor: 'pointer', fontSize: 13 }}>
          {loading ? '로딩...' : '새로고침'}
        </button>
        <button
          onClick={() => {
            sessionStorage.clear();
            localStorage.removeItem('ws_token');
            localStorage.removeItem('ws_user');
            localStorage.removeItem('ws_refresh_token');
            localStorage.removeItem('ws_login_time');
            fetch('/api/auth/cookie-issue', { method: 'DELETE', credentials: 'include' }).catch(() => {});
            window.location.href = '/admin/admin-auth.html';
          }}
          style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid rgba(229,62,62,.4)`, color: '#fc8181', background: card, cursor: 'pointer', fontSize: 13 }}
        >
          로그아웃
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr', gap: 20, maxWidth: 1600, margin: '0 auto' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: '전체 사용자', value: counts.total, color: '#4CAF50' },
            { label: '승인됨', value: counts.approved, color: '#38a169' },
            { label: '승인 대기', value: counts.pending, color: '#d69e2e' },
            { label: '차단됨', value: counts.blocked, color: '#e53e3e' },
          ].map((s) => (
            <div key={s.label} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ color: dim, fontSize: 12, marginBottom: 6 }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Users Table */}
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${border}`, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>사용자 관리</div>
            <div style={{ color: dim, fontSize: 12 }}>· {filtered.length}명</div>
            <div style={{ flex: 1 }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름/이메일/연락처/소속 검색"
              style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color: text, fontSize: 13, width: 240 }}
            />
            {(['all', 'pending', 'approved', 'blocked'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 12px', borderRadius: 8, border: `1px solid ${border}`,
                background: filter === f ? 'rgba(76,175,80,.15)' : 'transparent',
                color: filter === f ? '#4CAF50' : text, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>
                {f === 'all' ? '전체' : f === 'pending' ? '대기' : f === 'approved' ? '승인' : '차단'}
              </button>
            ))}
          </div>

          {fetchError && (
            <div style={{ background: 'rgba(229,62,62,.08)', color: '#fc8181', padding: '10px 18px', fontSize: 13 }}>
              ❌ {fetchError}
            </div>
          )}

          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,.02)', color: dim, textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>사용자</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>이메일</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>소속</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>역할</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>상태</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>마지막 접속</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>작업</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: dim }}>불러오는 중...</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: dim }}>사용자가 없습니다</td></tr>
                )}
                {!loading && filtered.map((u) => {
                  const rp = rolePill(u.role);
                  const sp = statusPill(u.status);
                  const isSuper = u.role === 'superadmin';
                  const isPending = u.status === 'pending';
                  const isBlocked = u.status === 'blocked';
                  const rowBusy = busy === u.id;

                  return (
                    <tr key={u.id} style={{ borderTop: `1px solid ${border}`, opacity: rowBusy ? 0.5 : 1 }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600 }}>{u.name || '(이름 없음)'}</div>
                        {u.phone && <div style={{ fontSize: 11, color: dim, marginTop: 2 }}>{u.phone}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: dim, fontSize: 12 }}>{u.email}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12 }}>{u.company || '-'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {isSuper ? (
                          <span style={{ padding: '4px 10px', borderRadius: 6, background: rp.bg, color: rp.fg, fontSize: 11, fontWeight: 700 }}>{rp.label}</span>
                        ) : (
                          <select
                            value={u.role}
                            disabled={rowBusy}
                            onChange={(e) => onRoleChange(u, e.target.value)}
                            style={{
                              padding: '5px 22px 5px 10px', borderRadius: 6,
                              background: rp.bg, color: rp.fg,
                              border: `1px solid ${rp.bg}`, fontSize: 11, fontWeight: 700,
                              cursor: 'pointer', appearance: 'none',
                            }}
                          >
                            {['user', 'viewer', 'agent', 'admin'].map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 6, background: sp.bg, color: sp.fg, fontSize: 11, fontWeight: 600 }}>{sp.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: dim }}>{u.last_sign_in_at || u.created_at || '-'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          {isPending && !isSuper && (
                            <>
                              <button disabled={rowBusy} onClick={() => mutate('approve', u, { role: 'agent' })} style={btnStyle('approve')}>승인</button>
                              <button disabled={rowBusy} onClick={() => mutate('reject', u)} style={btnStyle('reject')}>거절</button>
                            </>
                          )}
                          {!isPending && !isSuper && (
                            <button disabled={rowBusy} onClick={() => mutate(isBlocked ? 'unblock' : 'block', u)} style={btnStyle('block')}>
                              {isBlocked ? '해제' : '차단'}
                            </button>
                          )}
                          {!isSuper && (
                            <button disabled={rowBusy} onClick={() => removeUser(u)} style={btnStyle('delete')}>삭제</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div style={{ position: 'fixed', top: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000 }}>
        {toasts.map((t) => {
          const colors = {
            success: { bg: 'rgba(56,161,105,.15)', border: 'rgba(56,161,105,.4)', fg: '#68d391' },
            error: { bg: 'rgba(229,62,62,.15)', border: 'rgba(229,62,62,.4)', fg: '#fc8181' },
            warn: { bg: 'rgba(214,158,46,.15)', border: 'rgba(214,158,46,.4)', fg: '#f6e05e' },
            info: { bg: 'rgba(66,153,225,.15)', border: 'rgba(66,153,225,.4)', fg: '#90cdf4' },
          }[t.kind];
          return (
            <div key={t.id} style={{
              background: colors.bg, border: `1px solid ${colors.border}`, color: colors.fg,
              padding: '10px 16px', borderRadius: 10, fontSize: 13, maxWidth: 400,
            }}>
              {t.kind === 'success' ? '✅ ' : t.kind === 'error' ? '❌ ' : t.kind === 'warn' ? '⚠️ ' : 'ℹ️ '}{t.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function btnStyle(kind: 'approve' | 'reject' | 'block' | 'delete'): React.CSSProperties {
  const colors = {
    approve: { bg: 'rgba(56,161,105,.15)', fg: '#68d391', border: 'rgba(56,161,105,.35)' },
    reject: { bg: 'rgba(214,158,46,.15)', fg: '#f6e05e', border: 'rgba(214,158,46,.35)' },
    block: { bg: 'rgba(160,174,192,.12)', fg: '#a0aec0', border: 'rgba(160,174,192,.3)' },
    delete: { bg: 'rgba(229,62,62,.15)', fg: '#fc8181', border: 'rgba(229,62,62,.4)' },
  }[kind];
  return {
    padding: '5px 10px', borderRadius: 6, border: `1px solid ${colors.border}`,
    background: colors.bg, color: colors.fg, fontSize: 11, fontWeight: 600, cursor: 'pointer',
  };
}
