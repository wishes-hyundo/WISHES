'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AdminAppointmentsPanel — 방문 예약 관리 패널 (#47)
//
//   - 오늘 / 내일 / 이번주 / 지난주 섹션 분리
//   - 각 예약 상태 변경(요청→확정→완료/취소/노쇼)
//   - 중개사 메모 인라인 편집
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Phone,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  MessageSquare,
  User as UserIcon,
} from 'lucide-react';

type AppointmentStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

type Appointment = {
  id: number;
  listingId: number | null;
  contactId: number | null;
  name: string;
  phone: string;
  email: string | null;
  visitDate: string; // YYYY-MM-DD
  visitSlot: string; // morning | afternoon | evening | HH:MM
  note: string | null;
  status: AppointmentStatus;
  agentMemo: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  listingTitle: string | null;
  listingMeta: string | null;
};

const STATUS_META: Record<AppointmentStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  requested: { label: '요청', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertCircle },
  confirmed: { label: '확정', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: CheckCircle2 },
  completed: { label: '완료', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  cancelled: { label: '취소', className: 'bg-gray-100 text-gray-600 border-gray-200', icon: XCircle },
  no_show: { label: '노쇼', className: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
};

const SLOT_LABEL: Record<string, string> = {
  morning: '오전 (09-12)',
  afternoon: '오후 (13-17)',
  evening: '저녁 (18-20)',
};

function fmtDate(iso: string): { label: string; day: number; month: number; weekday: string; bucket: string } {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  let bucket: string;
  if (diffDays < 0) bucket = diffDays >= -7 ? '지난주' : '이전';
  else if (diffDays === 0) bucket = '오늘';
  else if (diffDays === 1) bucket = '내일';
  else if (diffDays <= 7) bucket = '이번주';
  else bucket = '이후';

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  return {
    label: `${d.getMonth() + 1}.${d.getDate()} (${WEEKDAYS[d.getDay()]})`,
    day: d.getDate(),
    month: d.getMonth() + 1,
    weekday: WEEKDAYS[d.getDay()],
    bucket,
  };
}

export default function AdminAppointmentsPanel({ authToken }: { authToken: string }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [memoDraft, setMemoDraft] = useState<Record<number, string>>({});
  const [memoDirty, setMemoDirty] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  // L-leak4: unmount/deps 변경 시 in-flight fetch 취소. refresh 버튼 호출 호환.
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/appointments', {
        headers: { Authorization: authToken },
        signal,
      });
      if (signal?.aborted) return;
      const json = await res.json();
      if (signal?.aborted) return;
      if (!json.success) throw new Error(json.error || '조회 실패');
      setAppointments(json.appointments || []);
      // 메모 초기 draft
      const draft: Record<number, string> = {};
      (json.appointments || []).forEach((a: Appointment) => {
        draft[a.id] = a.agentMemo || '';
      });
      setMemoDraft(draft);
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') return;
      setError(e?.message || '오류 발생');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    // L-leak4: unmount/deps 변경 시 in-flight /api/admin/appointments fetch 취소.
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const patch = async (id: number, body: any) => {
    setUpdating(id);
    try {
      const res = await fetch('/api/admin/appointments', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authToken,
        },
        body: JSON.stringify({ id, ...body }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '수정 실패');
    } catch (e: any) {
      setError(e?.message || '수정 오류');
      throw e;
    } finally {
      setUpdating(null);
    }
  };

  const changeStatus = async (id: number, next: AppointmentStatus) => {
    try {
      await patch(id, { status: next });
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: next } : a)));
    } catch {}
  };

  const saveMemo = async (id: number) => {
    const memo = memoDraft[id] || '';
    try {
      await patch(id, { agentMemo: memo });
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, agentMemo: memo } : a)));
      setMemoDirty((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    } catch {}
  };

  const grouped = useMemo(() => {
    const g: Record<string, Appointment[]> = { 오늘: [], 내일: [], 이번주: [], 지난주: [], 이후: [], 이전: [] };
    for (const a of appointments) {
      const f = fmtDate(a.visitDate);
      if (!g[f.bucket]) g[f.bucket] = [];
      g[f.bucket].push(a);
    }
    return g;
  }, [appointments]);

  const stats = useMemo(() => {
    let req = 0, conf = 0, comp = 0;
    for (const a of appointments) {
      if (a.status === 'requested') req++;
      else if (a.status === 'confirmed') conf++;
      else if (a.status === 'completed') comp++;
    }
    return { req, conf, comp, total: appointments.length };
  }, [appointments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-wishes-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 헤더 + 요약 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-wishes-secondary" />
          <h3 className="text-lg font-bold text-wishes-primary">방문 예약 관리</h3>
          <span className="px-2 py-0.5 rounded-full bg-wishes-accent text-wishes-secondary text-xs font-bold">
            총 {stats.total}건
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
            요청 {stats.req}
          </span>
          <span className="px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-800 font-semibold">
            확정 {stats.conf}
          </span>
          <span className="px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
            완료 {stats.comp}
          </span>
          <button
            type="button"
            onClick={load}
            className="ml-2 px-3 py-1 rounded-md bg-white border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
          >
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {appointments.length === 0 && (
        <div className="p-12 text-center border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-500">
          아직 방문 예약이 없습니다.
        </div>
      )}

      {/* 그룹별 렌더 */}
      {(['오늘', '내일', '이번주', '지난주', '이후'] as const).map((bucket) => {
        const items = grouped[bucket];
        if (!items || items.length === 0) return null;
        return (
          <section key={bucket}>
            <h4 className="text-sm font-bold text-wishes-primary mb-2 flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${bucket === '오늘' ? 'bg-wishes-secondary' : 'bg-gray-400'}`} />
              {bucket} <span className="text-gray-400 font-normal">({items.length}건)</span>
            </h4>
            <div className="space-y-2">
              {items.map((a) => {
                const statusMeta = STATUS_META[a.status];
                const StatusIcon = statusMeta.icon;
                const dateInfo = fmtDate(a.visitDate);
                const slotLabel = SLOT_LABEL[a.visitSlot] || a.visitSlot;
                const memoChanged = memoDirty.has(a.id);
                return (
                  <div
                    key={a.id}
                    className={`p-3 rounded-xl border ${bucket === '오늘' ? 'border-wishes-secondary/30 bg-wishes-accent/30' : 'border-gray-200 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      {/* Left: date + slot + customer */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="shrink-0 text-center px-2 py-1.5 rounded-lg bg-white border border-gray-200 min-w-[60px]">
                          <div className="text-[10px] text-gray-400">{dateInfo.month}월</div>
                          <div className="text-lg font-black text-wishes-primary leading-none">{dateInfo.day}</div>
                          <div className="text-[10px] text-gray-500">({dateInfo.weekday})</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusMeta.className}`}>
                              <StatusIcon className="w-3 h-3" />
                              {statusMeta.label}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                              <Clock className="w-3 h-3" />
                              {slotLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-wishes-primary truncate">
                            <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                            {a.name}
                            <a
                              href={`tel:${a.phone.replace(/[^0-9]/g, '')}`}
                              className="inline-flex items-center gap-1 text-xs text-wishes-secondary hover:underline ml-1"
                            >
                              <Phone className="w-3 h-3" />
                              {a.phone}
                            </a>
                          </div>
                          {a.listingTitle && (
                            <div className="mt-1 text-xs text-gray-600 truncate">
                              <span className="text-gray-400">매물:</span>{' '}
                              <a
                                href={`/listings/${a.listingId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-wishes-primary hover:underline"
                              >
                                {a.listingTitle}
                              </a>
                              {a.listingMeta && <span className="text-gray-400"> · {a.listingMeta}</span>}
                            </div>
                          )}
                          {a.note && (
                            <div className="mt-1 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                              <span className="text-gray-400">고객메모:</span> {a.note}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: status actions */}
                      <div className="flex flex-col gap-1 shrink-0">
                        {a.status === 'requested' && (
                          <>
                            <button
                              type="button"
                              onClick={() => changeStatus(a.id, 'confirmed')}
                              disabled={updating === a.id}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              확정
                            </button>
                            <button
                              type="button"
                              onClick={() => changeStatus(a.id, 'cancelled')}
                              disabled={updating === a.id}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              취소
                            </button>
                          </>
                        )}
                        {a.status === 'confirmed' && (
                          <>
                            <button
                              type="button"
                              onClick={() => changeStatus(a.id, 'completed')}
                              disabled={updating === a.id}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              완료
                            </button>
                            <button
                              type="button"
                              onClick={() => changeStatus(a.id, 'no_show')}
                              disabled={updating === a.id}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-white border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              노쇼
                            </button>
                          </>
                        )}
                        {(a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show') && (
                          <button
                            type="button"
                            onClick={() => changeStatus(a.id, 'requested')}
                            disabled={updating === a.id}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            되돌리기
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Agent memo */}
                    <div className="mt-2 flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-gray-400 mt-2" />
                      <textarea
                        value={memoDraft[a.id] || ''}
                        onChange={(e) => {
                          setMemoDraft((prev) => ({ ...prev, [a.id]: e.target.value }));
                          setMemoDirty((prev) => new Set(prev).add(a.id));
                        }}
                        placeholder="중개사 메모 (내부용)"
                        rows={1}
                        className="flex-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary resize-none"
                      />
                      {memoChanged && (
                        <button
                          type="button"
                          onClick={() => saveMemo(a.id)}
                          className="px-2.5 py-1.5 text-[11px] font-bold rounded-md bg-wishes-secondary text-white hover:bg-wishes-primary"
                        >
                          저장
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
