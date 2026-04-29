/**
 * /admin/listings/problematic — 문제 매물 검토 + 일괄 처리
 *
 * 출처: Phase 1-5 마이그레이션 (`phase1_05_pipa_anonymize_and_p1_backfill`)
 *      이 자동 표시한 is_problematic = true 매물 3,965건.
 *
 * 사장님 명령 (2026-04-28): "문제있는 매물 제외하고는 기간이 오래돼도 삭제 X"
 *   → 사장님이 직접 보고 status (공개/비공개/계약완료) 또는 is_problematic 해제 결정.
 *   → hard-delete 는 별도 (사장님 직권만, audit log 남김).
 *
 * 권한: owner / superadmin / admin / master 만 (RLS + ALLOWED_VIEW_ROLES 패턴).
 *
 * 사용 흐름:
 *   1. 사유별 (area_invalid / type_rooms_inconsistent / 둘다) 탭 필터
 *   2. 매물 카드 또는 테이블 보기 (사용자 선택)
 *   3. 다중 선택 → 일괄 액션 (비공개 / is_problematic 해제 / 보존 마킹)
 *   4. 모든 변경 admin_audit_log 자동 기록 (DB trigger)
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/adminFetch';
import { useAdminSession } from '@/lib/useAdminSession';

const ALLOWED = new Set(['owner', 'superadmin', 'admin', 'master']);

type ProblemReason = 'all' | 'area_invalid' | 'type_rooms_inconsistent' | 'both' | 'other';

type ProblemListing = {
  id: number;
  type?: string | null;
  deal?: string | null;
  address?: string | null;
  dong?: string | null;
  gu?: string | null;
  area_m2?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  floor_current?: number | null;
  status?: string | null;
  problematic_reason?: string | null;
  problematic_marked_at?: string | null;
  is_problematic?: boolean;
  created_at?: string | null;
};

function categorize(reason: string | null | undefined): ProblemReason {
  if (!reason) return 'other';
  const hasArea = reason.includes('area_m2_invalid') || reason.includes('area_invalid');
  const hasRooms = reason.includes('type_rooms_inconsistent');
  if (hasArea && hasRooms) return 'both';
  if (hasArea) return 'area_invalid';
  if (hasRooms) return 'type_rooms_inconsistent';
  return 'other';
}

function fmtArea(m2: number | null | undefined): string {
  if (m2 == null) return '-';
  const pyeong = Math.round((m2 / 3.305) * 10) / 10;
  return `${m2}㎡ (${pyeong}평)`;
}

export default function AdminProblematicListingsPage() {
  const router = useRouter();
  const { token } = useAdminSession('/admin/listings/problematic');
  const [authChecked, setAuthChecked] = useState(false);
  const [denied, setDenied] = useState(false);
  const [listings, setListings] = useState<ProblemListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProblemReason>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; area_invalid: number; type_rooms: number; both: number } | null>(null);

  // 권한 체크
  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success || !ALLOWED.has(d.user?.role)) {
          alert('관리자만 접근 가능합니다.');
          router.replace('/admin');
          setDenied(true);
          return;
        }
        setAuthChecked(true);
      })
      .catch(() => {
        setDenied(true);
        router.replace('/admin');
      });
  }, [token, router]);

  // 매물 로드
  const load = useCallback(async () => {
    if (!authChecked || !token) return;
    setLoading(true);
    try {
      // Phase 1-5: problematic=true 파라미터 (admin/listings GET 추가).
      //   fallback: 미지원 시 limit=2000 조회 후 client filter.
      const res = await adminFetch('/api/admin/listings?problematic=true&limit=2000', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      let rows: ProblemListing[] = data?.listings || data?.data || [];
      // 서버가 problematic 미지원이면 client filter
      if (rows.length > 0 && rows.some((r) => !r.is_problematic)) {
        rows = rows.filter((r) => r.is_problematic === true);
      }
      setListings(rows);

      const s = { total: rows.length, area_invalid: 0, type_rooms: 0, both: 0 };
      for (const r of rows) {
        const c = categorize(r.problematic_reason);
        if (c === 'area_invalid') s.area_invalid++;
        else if (c === 'type_rooms_inconsistent') s.type_rooms++;
        else if (c === 'both') s.both++;
      }
      setStats(s);
    } catch (e) {
      console.error('[problematic] load:', e);
    } finally {
      setLoading(false);
    }
  }, [authChecked, token]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return listings;
    return listings.filter((l) => categorize(l.problematic_reason) === filter);
  }, [listings, filter]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((l) => l.id)));
  };

  // 일괄 액션
  const bulkAction = async (action: 'hide' | 'clear_problematic' | 'preserve') => {
    if (selectedIds.size === 0) {
      alert('매물을 선택해주세요.');
      return;
    }
    const confirmText = {
      hide: `${selectedIds.size}건을 비공개로 전환하시겠습니까? (사장님 명령상 데이터는 보존됩니다)`,
      clear_problematic: `${selectedIds.size}건의 문제 표시를 해제하시겠습니까?`,
      preserve: `${selectedIds.size}건을 "보존 확인"으로 마킹하시겠습니까?`,
    }[action];
    if (!confirm(confirmText)) return;

    setBusyAction(action);
    try {
      const ids = Array.from(selectedIds);
      const patch =
        action === 'hide'
          ? { status: '비공개' }
          : action === 'clear_problematic'
          ? { is_problematic: false, problematic_reason: null, problematic_marked_at: null }
          : { problematic_reason: '__preserved_by_owner__' };

      // /api/admin/listings-bulk-update 는 { listings: [{ id, ...patch }] } 형식
      const listings = ids.map((id) => ({ id, ...patch }));

      const res = await adminFetch('/api/admin/listings-bulk-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ listings }),
      });
      const data = await res.json();
      const ok = (data?.results || []).filter((r: { success: boolean }) => r.success).length;
      const fail = (data?.results || []).length - ok;
      if (ok === 0) {
        alert('처리 실패: ' + (data?.error || JSON.stringify(data?.results?.[0] || {}, null, 2)));
      } else {
        alert(`${ok}건 처리 완료 ${fail > 0 ? `(${fail}건 실패)` : ''}`);
        setSelectedIds(new Set());
        load();
      }
    } catch (e) {
      alert('서버 오류');
      console.error(e);
    } finally {
      setBusyAction(null);
    }
  };

  if (denied) return null;

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <header className="bg-[#2D5A27] text-white px-6 py-3.5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">⚠️ 문제 매물 검토</h1>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
              사장님 명령: 기록 보존
            </span>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded transition"
          >
            ← admin
          </button>
        </div>
      </header>

      <div className="p-6">
        {/* Stats 카드 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: '전체', value: stats.total, color: '#374151', filter: 'all' as const },
              { label: '면적 이상', value: stats.area_invalid, color: '#dc2626', filter: 'area_invalid' as const },
              { label: '방수 불일치', value: stats.type_rooms, color: '#d97706', filter: 'type_rooms_inconsistent' as const },
              { label: '둘 다', value: stats.both, color: '#7c3aed', filter: 'both' as const },
            ].map((s) => (
              <button
                key={s.label}
                onClick={() => setFilter(s.filter)}
                className={`bg-white p-4 rounded-lg border text-left transition hover:shadow ${
                  filter === s.filter ? 'border-[#2D5A27] shadow-md' : 'border-[#e5e7eb]'
                }`}
              >
                <div className="text-xs text-[#666] mb-1">{s.label}</div>
                <div className="text-2xl font-bold" style={{ color: s.color }}>
                  {s.value.toLocaleString()}
                </div>
                <div className="text-[10px] text-[#999] mt-1">건</div>
              </button>
            ))}
          </div>
        )}

        {/* 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-sm text-blue-900">
          <strong>📋 처리 가이드</strong>
          <ul className="list-disc ml-5 mt-1.5 space-y-0.5 text-xs">
            <li><b>면적 이상</b>: area_m2 가 0 이하 또는 10,000㎡ 초과 (단위 오기 추정)</li>
            <li><b>방수 불일치</b>: 원룸인데 방 2개 이상, 투룸인데 방 수가 2 아닌 경우</li>
            <li>사장님 명령: <b>거래 기록 영구 보존</b>. 문제 매물도 가능한 보존 (비공개로만 전환)</li>
          </ul>
        </div>

        {/* 일괄 액션 바 */}
        <div className="bg-white border rounded p-3 mb-3 flex items-center gap-2 flex-wrap sticky top-0 z-10 shadow-sm">
          <button
            onClick={selectAll}
            className="text-xs px-3 py-1.5 rounded border bg-white hover:bg-[#f5f5f5]"
          >
            {selectedIds.size === filtered.length && filtered.length > 0 ? '전체 해제' : '전체 선택'}
          </button>
          <span className="text-xs text-[#666]">
            선택 <strong className="text-[#2D5A27]">{selectedIds.size}</strong> / {filtered.length}건
          </span>
          <div className="flex-1" />
          <button
            disabled={busyAction !== null || selectedIds.size === 0}
            onClick={() => bulkAction('hide')}
            className="text-xs px-3 py-1.5 rounded font-semibold text-white disabled:opacity-50"
            style={{ background: '#dc2626' }}
          >
            {busyAction === 'hide' ? '처리 중...' : '비공개 전환'}
          </button>
          <button
            disabled={busyAction !== null || selectedIds.size === 0}
            onClick={() => bulkAction('clear_problematic')}
            className="text-xs px-3 py-1.5 rounded font-semibold text-white disabled:opacity-50"
            style={{ background: '#16a34a' }}
          >
            {busyAction === 'clear_problematic' ? '처리 중...' : '문제 표시 해제'}
          </button>
          <button
            disabled={busyAction !== null || selectedIds.size === 0}
            onClick={() => bulkAction('preserve')}
            className="text-xs px-3 py-1.5 rounded font-semibold text-white disabled:opacity-50"
            style={{ background: '#2563eb' }}
          >
            {busyAction === 'preserve' ? '처리 중...' : '보존 마킹'}
          </button>
        </div>

        {/* 매물 테이블 */}
        {loading && (
          <div className="text-center py-12 text-[#666] bg-white rounded border">
            매물 로드 중...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-[#999] bg-white rounded border">
            <div className="text-4xl mb-2">🎉</div>
            해당 카테고리에 문제 매물이 없습니다.
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="bg-white rounded border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f9fafb] text-xs text-[#374151]">
                <tr>
                  <th className="p-2 text-left w-10"></th>
                  <th className="p-2 text-left">ID</th>
                  <th className="p-2 text-left">유형</th>
                  <th className="p-2 text-left">거래</th>
                  <th className="p-2 text-left">주소</th>
                  <th className="p-2 text-left">면적</th>
                  <th className="p-2 text-left">방/욕실/층</th>
                  <th className="p-2 text-left">상태</th>
                  <th className="p-2 text-left">사유</th>
                  <th className="p-2 text-left">표시일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {filtered.map((l) => {
                  const cat = categorize(l.problematic_reason);
                  const catColor = {
                    area_invalid: '#dc2626',
                    type_rooms_inconsistent: '#d97706',
                    both: '#7c3aed',
                    other: '#6b7280',
                    all: '#6b7280',
                  }[cat];
                  return (
                    <tr
                      key={l.id}
                      className={`hover:bg-[#fafafa] ${
                        selectedIds.has(l.id) ? 'bg-[#f0fdf4]' : ''
                      }`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(l.id)}
                          onChange={() => toggleSelect(l.id)}
                          aria-label={`매물 ${l.id} 선택`}
                        />
                      </td>
                      <td className="p-2 font-mono text-xs">{l.id}</td>
                      <td className="p-2 text-xs">{l.type || '-'}</td>
                      <td className="p-2 text-xs">{l.deal || '-'}</td>
                      <td className="p-2 text-xs">
                        {[l.gu, l.dong, l.address].filter(Boolean).join(' ') || '-'}
                      </td>
                      <td
                        className="p-2 text-xs"
                        style={{
                          color:
                            l.area_m2 == null || l.area_m2 <= 0 || l.area_m2 > 10000
                              ? '#dc2626'
                              : '#222',
                        }}
                      >
                        {fmtArea(l.area_m2)}
                      </td>
                      <td className="p-2 text-xs text-[#666]">
                        방{l.rooms ?? '-'} / 욕{l.bathrooms ?? '-'} / {l.floor_current ?? '-'}층
                      </td>
                      <td className="p-2 text-xs">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            background: l.status === '공개' ? '#dcfce7' : '#f3f4f6',
                            color: l.status === '공개' ? '#166534' : '#4b5563',
                          }}
                        >
                          {l.status || '-'}
                        </span>
                      </td>
                      <td className="p-2 text-xs">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: `${catColor}1a`, color: catColor }}
                        >
                          {cat === 'area_invalid' && '면적'}
                          {cat === 'type_rooms_inconsistent' && '방수'}
                          {cat === 'both' && '둘다'}
                          {cat === 'other' && '기타'}
                          {cat === 'all' && '-'}
                        </span>
                      </td>
                      <td className="p-2 text-xs text-[#888]">
                        {l.problematic_marked_at
                          ? new Date(l.problematic_marked_at).toISOString().slice(0, 10)
                          : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
