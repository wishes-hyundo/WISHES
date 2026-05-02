'use client';

/**
 * L-cc1 Phase 1 (2026-04-23): Command Center v2
 *
 * React 이식 버전. 기존 /admin/command-center.html 정적 HTML 은 유지하되
 * 본 /admin/command-center-v2 가 모던 React 구현. 안정화 이후 기존 .html 을
 * 이 route 로 리다이렉트 예정.
 *
 * 특징:
 *   - Vercel/Linear 스타일 미니멀 다크 UI (blueprint grid 배경)
 *   - Inline role editing (admin/agent/user dropdown)
 *   - 실시간 검색, role/status facet 필터, 정렬
 *   - Optimistic UI + 실패 시 toast + 자동 롤백
 *   - Keyboard shortcuts: / (검색), r (새로고침), ? (도움말)
 *   - Responsive (모바일 card list)
 *
 * 외부 deps 미사용 — 순수 React + Tailwind + lucide-react 로만 구현해
 * 빌드 복잡도 낮춤. Phase 2 에서 shadcn/TanStack Table 로 업그레이드.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Search,
  RefreshCw,
  Check,
  X,
  Ban,
  Unlock,
  Shield,
  Users,
  Clock,
  AlertTriangle,
  ChevronDown,
  Filter,
  LogOut,
} from 'lucide-react';

type Role = 'superadmin' | 'owner' | 'admin' | 'broker' | 'agent' | 'partner' | 'pending' | 'user';
type Status = 'approved' | 'pending' | 'rejected' | 'blocked';

interface AdminUser {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  role: Role;
  status: Status;
  reason?: string;
  createdAt?: string;
  lastLogin?: string;
  online?: boolean;
}

type Toast = { id: number; type: 'success' | 'error' | 'info'; text: string };

// G-16-2 (2026-05-03): 고객 (profiles) 통합
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
}

const ROLES: Role[] = ['superadmin', 'owner', 'admin', 'broker', 'agent', 'partner', 'pending', 'user'];
const STATUSES: Status[] = ['approved', 'pending', 'rejected', 'blocked'];

const ROLE_LABEL: Record<Role, string> = {
  superadmin: '슈퍼어드민',
  owner: '오너 (사장님)',
  admin: '관리자',
  broker: '중개사',
  agent: '중개사 (구)',
  partner: '파트너',
  pending: '승인 대기',
  user: '일반',
};

const STATUS_LABEL: Record<Status, string> = {
  approved: '승인됨',
  pending: '대기중',
  rejected: '거절됨',
  blocked: '차단됨',
};

const ROLE_TONE: Record<Role, string> = {
  superadmin: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  owner: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  admin: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  broker: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  agent: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  partner: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  pending: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  user: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

const STATUS_TONE: Record<Status, string> = {
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rejected: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  blocked: 'bg-red-500/15 text-red-300 border-red-500/30',
};

// ─── 토큰 헤더 ───
function getAuthHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};
  const t = window.sessionStorage.getItem('ws_token');
  const csrf = window.sessionStorage.getItem('ws_csrf') || '';
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: 'Bearer ' + t } : {}),
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
  };
}

export default function CommandCenterV2Page() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [customers, setCustomers] = useState<CustomerUser[]>([]);
  // G-16-2 (2026-05-03): 두 탭 — 운영자(staff) / 고객(customer)
  const [tab, setTab] = useState<'staff' | 'customer'>('staff');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [sort, setSort] = useState<{ key: keyof AdminUser; dir: 'asc' | 'desc' }>({
    key: 'email',
    dir: 'asc',
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // ─── toast ───
  const pushToast = useCallback(
    (type: Toast['type'], text: string) => {
      const id = ++toastIdRef.current;
      setToasts((t) => [...t, { id, type, text }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
    },
    [],
  );

  // ─── fetch users ───
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = tab === 'customer' ? '/api/admin/users?type=customer' : '/api/admin/users';
      const r = await fetch(url, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'unknown');
      if (tab === 'customer') {
        const rows = (j.users || []).map((c: any): CustomerUser => ({
          id: c.id,
          email: c.email || '',
          name: c.name || '',
          phone: c.phone || '',
          source: c.source || 'email',
          purpose: c.purpose,
          budget_min: c.budget_min,
          budget_max: c.budget_max,
          move_in_date: c.move_in_date,
          profile_level: c.profile_level || 0,
          profile_completed: c.profile_completed,
          created_at: c.created_at,
          last_sign_in_at: c.last_sign_in_at,
        }));
        setCustomers(rows);
      } else {
        const rows = (j.users || []).map(
          (u: any): AdminUser => ({
            id: u.id,
            email: u.email,
            name: u.name || '',
            phone: u.phone || '',
            company: u.company || '',
            role: (u.role || 'user') as Role,
            status: (u.status || 'pending') as Status,
            reason: u.reason || '',
            createdAt: u.createdAt || u.created_at,
            lastLogin: u.lastLogin || u.last_sign_in_at,
            online: Boolean(u.online),
          }),
        );
        setUsers(rows);
      }
    } catch (e: any) {
      setError(e.message || '사용자 목록을 불러오지 못했습니다');
      pushToast('error', '사용자 목록 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [pushToast, tab]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, tab]);

  // ─── keyboard shortcuts ───
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        loadUsers();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loadUsers]);

  // ─── mutation ───
  async function mutateUser(userId: string, body: any, successMsg: string) {
    try {
      const r = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ userId, ...body }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        throw new Error(j.error || 'HTTP ' + r.status);
      }
      pushToast('success', successMsg);
      loadUsers();
    } catch (e: any) {
      pushToast('error', '실패: ' + e.message);
      loadUsers();
    }
  }

  const changeRole = (id: string, current: Role, newRole: Role) => {
    if (current === newRole) return;
    if (!confirm(`역할을 ${ROLE_LABEL[current]} → ${ROLE_LABEL[newRole]}(으)로 변경하시겠습니까?`)) {
      return;
    }
    // Optimistic update
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
    mutateUser(id, { action: 'change_role', role: newRole }, `${ROLE_LABEL[newRole]} 로 변경됨`);
  };

  const approveUser = (id: string) => {
    mutateUser(id, { action: 'approve', role: 'agent' }, '승인 완료');
  };

  const rejectUser = (id: string) => {
    if (!confirm('이 사용자의 가입을 거절하시겠습니까?')) return;
    mutateUser(id, { action: 'reject' }, '거절 완료');
  };

  const blockUser = (id: string) => {
    if (!confirm('이 사용자를 차단하시겠습니까?')) return;
    mutateUser(id, { action: 'block' }, '차단 완료');
  };

  const unblockUser = (id: string) => {
    mutateUser(id, { action: 'unblock' }, '차단 해제');
  };

  // ─── filtered + sorted ───
  const filtered = useMemo(() => {
    let rows = users;
    if (roleFilter !== 'all') rows = rows.filter((u) => u.role === roleFilter);
    if (statusFilter !== 'all') rows = rows.filter((u) => u.status === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          (u.name || '').toLowerCase().includes(q) ||
          (u.company || '').toLowerCase().includes(q),
      );
    }
    const { key, dir } = sort;
    rows = [...rows].sort((a, b) => {
      const av = String(a[key] ?? '');
      const bv = String(b[key] ?? '');
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return rows;
  }, [users, roleFilter, statusFilter, query, sort]);

  // ─── facet counts ───
  const roleCounts = useMemo(() => {
    const acc: Record<string, number> = { all: users.length };
    for (const r of ROLES) acc[r] = users.filter((u) => u.role === r).length;
    return acc;
  }, [users]);

  const statusCounts = useMemo(() => {
    const acc: Record<string, number> = { all: users.length };
    for (const s of STATUSES) acc[s] = users.filter((u) => u.status === s).length;
    return acc;
  }, [users]);

  function toggleSort(key: keyof AdminUser) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)', backgroundSize: '24px 24px' }}>
      {/* ─── Top bar ─── */}
      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-emerald-400" />
            <div>
              <div className="text-sm font-semibold tracking-wide">WISHES</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Command Center v2</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadUsers}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/60 transition"
              title="새로고침 (r)"
            >
              <RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} />
              새로고침
            </button>
            {/* G-21 (2026-05-03): 사장님 명령 — '기존 v1' 버튼 제거. 사장님 헷갈림 방지. */}
            <a
              href="/admin/admin-auth.html"
              onClick={(e) => {
                try { window.sessionStorage.clear(); window.localStorage.clear(); } catch {}
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-900/40 bg-red-950/40 px-3 py-1.5 text-xs text-red-200 hover:border-red-700 hover:bg-red-900/40 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              로그아웃
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* G-16-2 (2026-05-03): 탭 — 운영자 / 고객 */}
        <div className="mb-4 flex gap-0 border-b border-zinc-800">
          <button
            onClick={() => setTab('staff')}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors -mb-px border-b-2 ${
              tab === 'staff'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            운영자/직원 ({tab === 'staff' ? users.length : '...'})
          </button>
          <button
            onClick={() => setTab('customer')}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors -mb-px border-b-2 ${
              tab === 'customer'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            고객 ({tab === 'customer' ? customers.length : '...'})
          </button>
        </div>

        {tab === 'staff' && (
        <>
        {/* ─── Stat strip (운영자) ─── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Users className="h-4 w-4" />} label="전체 사용자" value={users.length} tone="slate" />
          <StatCard icon={<Check className="h-4 w-4" />} label="활성 (승인됨)" value={statusCounts.approved || 0} tone="emerald" />
          <StatCard icon={<Clock className="h-4 w-4" />} label="승인 대기" value={statusCounts.pending || 0} tone="amber" />
          <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="차단" value={statusCounts.blocked || 0} tone="red" />
        </div>

        {/* ─── Filters bar ─── */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름, 이메일, 소속 검색 (  / )"
              className="w-full rounded-md border border-zinc-800 bg-zinc-900/40 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-500 focus:border-emerald-600/50 focus:ring-2 focus:ring-emerald-600/20"
            />
          </div>
          <FacetSelect
            label="역할"
            icon={<Filter className="h-3.5 w-3.5" />}
            value={roleFilter}
            onChange={(v) => setRoleFilter(v as any)}
            options={[
              { value: 'all', label: `전체 (${roleCounts.all})` },
              ...ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]} (${roleCounts[r]})` })),
            ]}
          />
          <FacetSelect
            label="상태"
            icon={<Filter className="h-3.5 w-3.5" />}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as any)}
            options={[
              { value: 'all', label: `전체 (${statusCounts.all})` },
              ...STATUSES.map((s) => ({ value: s, label: `${STATUS_LABEL[s]} (${statusCounts[s]})` })),
            ]}
          />
        </div>

        {/* ─── Table ─── */}
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                <Th onClick={() => toggleSort('name')} sorted={sort.key === 'name' ? sort.dir : undefined}>이름</Th>
                <Th onClick={() => toggleSort('email')} sorted={sort.key === 'email' ? sort.dir : undefined}>이메일</Th>
                <Th className="hidden md:table-cell">소속</Th>
                <Th>역할</Th>
                <Th>상태</Th>
                <Th className="hidden lg:table-cell">마지막 접속</Th>
                <Th className="text-right">작업</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                    <RefreshCw className="inline h-4 w-4 animate-spin" /> 불러오는 중…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-red-400">
                    {error}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                    조건에 맞는 사용자가 없습니다
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-900/40 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={'h-1.5 w-1.5 rounded-full ' + (u.online ? 'bg-emerald-400' : 'bg-zinc-600')} />
                        <span className="font-medium">{u.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{u.email}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-zinc-400">{u.company || '—'}</td>
                    <td className="px-4 py-3">
                      {u.role === 'superadmin' ? (
                        <Badge className={ROLE_TONE.superadmin}>superadmin</Badge>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, u.role, e.target.value as Role)}
                          className={
                            'rounded-md border bg-zinc-900/60 px-2 py-1 text-xs cursor-pointer outline-none focus:ring-2 focus:ring-emerald-600/30 ' +
                            ROLE_TONE[u.role]
                          }
                        >
                          <option value="admin">admin</option>
                          <option value="agent">agent</option>
                          <option value="user">user</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-zinc-500 font-mono text-xs">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleString('ko-KR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        {u.status === 'pending' && (
                          <>
                            <IconButton title="승인" onClick={() => approveUser(u.id)} variant="emerald"><Check className="h-3.5 w-3.5" /></IconButton>
                            <IconButton title="거절" onClick={() => rejectUser(u.id)} variant="zinc"><X className="h-3.5 w-3.5" /></IconButton>
                          </>
                        )}
                        {u.status === 'blocked' ? (
                          <IconButton title="차단 해제" onClick={() => unblockUser(u.id)} variant="emerald"><Unlock className="h-3.5 w-3.5" /></IconButton>
                        ) : u.role !== 'superadmin' && u.status === 'approved' ? (
                          <IconButton title="차단" onClick={() => blockUser(u.id)} variant="red"><Ban className="h-3.5 w-3.5" /></IconButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="mt-6 flex items-center justify-between text-xs text-zinc-500">
          <div>
            {filtered.length} / {users.length} 명
          </div>
          <div className="flex items-center gap-3">
            <Kbd>/</Kbd> 검색
            <Kbd>r</Kbd> 새로고침
          </div>
        </footer>
        </>
        )}

        {tab === 'customer' && (
        <>
        {/* G-16-2 (2026-05-03): 고객 명부 (profiles 테이블) */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Users className="h-4 w-4" />} label="전체 고객" value={customers.length} tone="slate" />
          <StatCard icon={<Check className="h-4 w-4" />} label="프로필 완료" value={customers.filter(c => c.profile_completed).length} tone="emerald" />
          <StatCard icon={<Clock className="h-4 w-4" />} label="카카오/네이버" value={customers.filter(c => c.source === 'kakao' || c.source === 'naver').length} tone="amber" />
          <StatCard icon={<Users className="h-4 w-4" />} label="구글/이메일" value={customers.filter(c => c.source === 'google' || c.source === 'email').length} tone="slate" />
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/40">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80">
              <tr>
                <Th>이름</Th>
                <Th>이메일</Th>
                <Th className="hidden md:table-cell">연락처</Th>
                <Th>가입경로</Th>
                <Th className="hidden lg:table-cell">목적/예산</Th>
                <Th className="hidden lg:table-cell">가입일</Th>
                <Th className="hidden xl:table-cell">마지막 접속</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-zinc-500"><RefreshCw className="inline h-4 w-4 animate-spin" /> 불러오는 중…</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-zinc-500">아직 가입된 고객이 없습니다. 카카오 / 네이버 / 구글 로그인으로 가입한 사용자가 여기 표시됩니다.</td></tr>
              ) : (
                customers.map((c) => {
                  const sourceMap: Record<string, { label: string; tone: string }> = {
                    kakao: { label: '카카오', tone: 'border-yellow-700/40 bg-yellow-950/40 text-yellow-300' },
                    naver: { label: '네이버', tone: 'border-emerald-700/40 bg-emerald-950/40 text-emerald-300' },
                    google: { label: '구글', tone: 'border-blue-700/40 bg-blue-950/40 text-blue-300' },
                    email: { label: '이메일', tone: 'border-zinc-700/40 bg-zinc-950/40 text-zinc-300' },
                  };
                  const s = sourceMap[c.source] || sourceMap.email;
                  const purposeMap: Record<string, string> = { residence: '거주', investment: '투자', lease: '임대', other: '기타' };
                  return (
                    <tr key={c.id} className="hover:bg-zinc-900/40 transition">
                      <td className="px-4 py-3"><span className="font-medium">{c.name || '—'}</span></td>
                      <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{c.email || '—'}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-zinc-400">{c.phone || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge className={s.tone}>{s.label}</Badge>
                        {c.profile_completed && <span className="ml-2 text-[10px] text-emerald-400">완료</span>}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-zinc-400 text-xs">
                        {c.purpose && <div>{purposeMap[c.purpose] || c.purpose}</div>}
                        {c.budget_min && c.budget_max && <div>{c.budget_min}~{c.budget_max}만원</div>}
                        {c.move_in_date && <div className="text-zinc-500">{c.move_in_date}</div>}
                        {!c.purpose && !c.budget_min && !c.move_in_date && <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-zinc-500 font-mono text-xs">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : '—'}
                      </td>
                      <td className="hidden xl:table-cell px-4 py-3 text-zinc-500 font-mono text-xs">
                        {c.last_sign_in_at ? new Date(c.last_sign_in_at).toLocaleString('ko-KR') : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <footer className="mt-4 flex items-center justify-between text-xs text-zinc-500">
          <div>{customers.length} 명</div>
        </footer>
        </>
        )}
      </main>

      {/* ─── Toasts ─── */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'pointer-events-auto rounded-md border px-4 py-2.5 text-sm shadow-lg animate-in fade-in slide-in-from-right-5 ' +
              (t.type === 'success'
                ? 'border-emerald-700/40 bg-emerald-950/80 text-emerald-200'
                : t.type === 'error'
                ? 'border-red-700/40 bg-red-950/80 text-red-200'
                : 'border-zinc-700/40 bg-zinc-900/80 text-zinc-200')
            }
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 보조 컴포넌트 ───
function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ' + className}>
      {children}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'slate' | 'emerald' | 'amber' | 'red';
}) {
  const toneMap: Record<string, string> = {
    slate: 'border-zinc-800 bg-zinc-900/40 text-zinc-200',
    emerald: 'border-emerald-900/40 bg-emerald-950/30 text-emerald-200',
    amber: 'border-amber-900/40 bg-amber-950/30 text-amber-200',
    red: 'border-red-900/40 bg-red-950/30 text-red-200',
  };
  return (
    <div className={'flex items-center gap-3 rounded-lg border px-4 py-3 ' + toneMap[tone]}>
      <div className="rounded-md bg-black/30 p-2">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-widest opacity-70">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function FacetSelect({
  label,
  icon,
  value,
  onChange,
  options,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 text-xs text-zinc-400">
      {icon}
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none cursor-pointer text-zinc-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-zinc-900">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
    </label>
  );
}

function Th({
  children,
  onClick,
  sorted,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  sorted?: 'asc' | 'desc';
  className?: string;
}) {
  return (
    <th
      className={'px-4 py-2 text-left font-medium ' + (onClick ? 'cursor-pointer select-none hover:text-zinc-200 ' : '') + className}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : ''}
      </span>
    </th>
  );
}

function IconButton({
  title,
  onClick,
  variant,
  children,
}: {
  title: string;
  onClick: () => void;
  variant: 'emerald' | 'red' | 'zinc';
  children: React.ReactNode;
}) {
  const toneMap: Record<string, string> = {
    emerald:
      'border-emerald-900/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-700',
    red: 'border-red-900/40 bg-red-950/30 text-red-300 hover:bg-red-900/40 hover:border-red-700',
    zinc: 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-800/60 hover:border-zinc-700',
  };
  return (
    <button
      onClick={onClick}
      title={title}
      className={'inline-flex h-7 w-7 items-center justify-center rounded-md border transition ' + toneMap[variant]}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-zinc-700 bg-zinc-900 px-1 font-mono text-[10px] text-zinc-400">
      {children}
    </kbd>
  );
}
