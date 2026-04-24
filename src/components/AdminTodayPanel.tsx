'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AdminTodayPanel — 중개사용 "오늘 할 일" 위젯
//
//   목적: /admin 대시보드 최상단에서 한눈에 오늘의 액션 아이템을 보여준다.
//   - 왼쪽: 오늘 접수된 신규 문의 목록 (바로 전화 / 처리 완료)
//   - 오른쪽: 파이프라인 카운터 (new / contacted / visit_booked / contract)
//
//   재사용: /api/admin/contacts 엔드포인트 (pipeline_status 컬럼 포함)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useCallback } from 'react';
import { Phone, CheckCircle2, Clock, AlertCircle, RefreshCw, MessageSquare, TrendingUp, Tag } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';

type PipelineStatus = 'new' | 'contacted' | 'visit_booked' | 'contract' | 'closed_won' | 'closed_lost';
type LossReason = 'price' | 'inventory' | 'timing' | 'changed_mind' | 'other';

interface Contact {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  message?: string | null;
  listingTitle?: string | null;
  status: '접수' | '처리중' | '완료';
  pipelineStatus: PipelineStatus;
  lossReason?: LossReason | null;
  createdAt: string;
  lastFollowupAt?: string | null;
}

interface Props {
  authHeader: string;
}

const PIPELINE_META: Record<PipelineStatus, { label: string; color: string; bg: string }> = {
  new:          { label: '신규',     color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
  contacted:    { label: '연락 완료', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  visit_booked: { label: '방문 예정', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  contract:     { label: '계약 진행', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  closed_won:   { label: '계약 완료', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  closed_lost:  { label: '이탈',     color: 'text-gray-600',   bg: 'bg-gray-50 border-gray-200' },
};

export default function AdminTodayPanel({ authHeader }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // L-hy1 (2026-04-22): 하이드레이션 미스매치 방지.
  //   `new Date().toLocaleDateString('ko-KR', ...)` 는 서버(UTC)와 클라(KST)에서
  //   다른 문자열을 만들어 경고·DOM 리플로우 유발. 마운트 후 클라이언트에서만 채운다.
  const [displayDate, setDisplayDate] = useState('');

  // L-leak4: unmount/deps 변경 시 in-flight fetch 취소.
  //   refresh 버튼에서 signal 없이도 호출 가능하도록 옵셔널 시그니처.
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch 로 전환.
      //   credentials:'include' + X-CSRF-Token 자동 부착. authHeader prop 은
      //   legacy master-password 경로 호환을 위해 그대로 전달.
      const res = await adminFetch('/api/admin/contacts', {
        headers: { authorization: authHeader },
        signal,
      });
      if (signal?.aborted) return;
      if (res.ok) {
        const json = await res.json();
        if (signal?.aborted) return;
        setContacts(json.data || []);
      } else {
        setError('상담 목록을 불러오지 못했습니다.');
      }
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') return;
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    setDisplayDate(new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }));
  }, []);

  // 오늘(KST) 00:00 이후에 접수된 건만 필터
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayContacts = contacts.filter(c => new Date(c.createdAt) >= todayStart);
  const pendingContacts = contacts.filter(c => c.pipelineStatus === 'new');
  const counts = contacts.reduce<Record<PipelineStatus, number>>((acc, c) => {
    acc[c.pipelineStatus] = (acc[c.pipelineStatus] || 0) + 1;
    return acc;
  }, { new: 0, contacted: 0, visit_booked: 0, contract: 0, closed_won: 0, closed_lost: 0 });

  // #38: 이탈 사유 미분류 리드 — 분석 정확도를 위해 태깅을 독려
  //   closed_lost 상태이면서 loss_reason 이 null 인 건을 집계.
  //   1건 이상이면 상단에 경고 배너 + /admin?tab=contacts&stage=closed_lost 로 직결.
  const untaggedLost = contacts.filter(c => c.pipelineStatus === 'closed_lost' && !c.lossReason);

  const updatePipeline = async (id: number, pipelineStatus: PipelineStatus, markFollowedUp = false) => {
    try {
      const res = await adminFetch('/api/admin/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', authorization: authHeader },
        body: JSON.stringify({ id, pipelineStatus, markFollowedUp }),
      });
      if (res.ok) {
        // 로컬 상태 낙관 업데이트
        setContacts(prev => prev.map(c => c.id === id
          ? { ...c, pipelineStatus, lastFollowupAt: markFollowedUp ? new Date().toISOString() : c.lastFollowupAt }
          : c));
      }
    } catch (e) {
      console.error('파이프라인 업데이트 실패:', e);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-wishes-primary to-wishes-secondary">
        <div className="flex items-center gap-2 text-white">
          <TrendingUp className="w-5 h-5" />
          <h3 className="font-bold text-base">오늘 할 일</h3>
          <span className="ml-2 text-xs text-white/80" suppressHydrationWarning>{displayDate || '\u00A0'}</span>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-1 text-white/80 hover:text-white text-xs font-medium transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* #38: 이탈 사유 미분류 리드 알림 배너 */}
      {untaggedLost.length > 0 && (
        <a
          href="/admin?tab=contacts&stage=closed_lost"
          className="flex items-center justify-between gap-3 px-5 py-3 bg-amber-50 border-b border-amber-200 hover:bg-amber-100 transition-colors group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Tag className="w-4 h-4 text-amber-700 shrink-0" />
            <p className="text-xs sm:text-sm text-amber-900 leading-tight">
              <strong className="font-bold">이탈 사유 미분류 {untaggedLost.length}건</strong> —
              <span className="ml-1 text-amber-800">태깅하면 리드 소스/사유 분석 정확도가 올라갑니다.</span>
            </p>
          </div>
          <span className="text-xs font-bold text-amber-900 shrink-0 whitespace-nowrap group-hover:translate-x-0.5 transition-transform">
            지금 태깅 →
          </span>
        </a>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
        {/* ─── 좌측 2/3: 오늘 접수된 문의 + 미처리 신규 ─── */}
        <div className="lg:col-span-2 p-5 border-r border-gray-100">
          {/* 요약 */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-wishes-primary">{todayContacts.length}</span>
              <span className="text-xs text-gray-500">오늘 신규 접수</span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-red-600">{pendingContacts.length}</span>
              <span className="text-xs text-gray-500">미처리 (누적)</span>
            </div>
          </div>

          {/* 리스트 */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-xs text-red-700 border border-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">불러오는 중…</div>
          ) : pendingContacts.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-wishes-primary">미처리 문의가 없습니다</p>
              <p className="text-xs text-gray-500 mt-1">새로운 문의가 들어오면 여기에 표시됩니다</p>
            </div>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {pendingContacts.slice(0, 20).map(c => {
                const hoursAgo = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 3_600_000);
                const isStale = hoursAgo >= 24;
                return (
                  <li
                    key={c.id}
                    className={`p-3 border rounded-xl transition-colors hover:shadow-sm ${
                      isStale ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-wishes-primary truncate">{c.name}</p>
                          <span className="text-xs text-gray-500">{c.phone}</span>
                          {isStale && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                              <Clock className="w-3 h-3" />
                              {hoursAgo}시간+
                            </span>
                          )}
                        </div>
                        {c.listingTitle && (
                          <p className="text-xs text-wishes-secondary font-medium mt-0.5 truncate">📍 {c.listingTitle}</p>
                        )}
                        {c.message && (
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{c.message}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <a
                          href={`tel:${c.phone.replace(/[^0-9+]/g, '')}`}
                          onClick={() => updatePipeline(c.id, 'contacted', true)}
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-wishes-secondary hover:bg-wishes-primary text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          <Phone className="w-3 h-3" />
                          바로 전화
                        </a>
                        <button
                          onClick={() => updatePipeline(c.id, 'contacted', true)}
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          연락 완료
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ─── 우측 1/3: 파이프라인 카운터 ─── */}
        <div className="p-5 bg-gray-50/50">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-wishes-primary" />
            <p className="text-sm font-bold text-wishes-primary">리드 파이프라인</p>
          </div>
          <div className="space-y-1.5">
            {(['new', 'contacted', 'visit_booked', 'contract', 'closed_won'] as PipelineStatus[]).map((key, idx, arr) => {
              const meta = PIPELINE_META[key];
              const n = counts[key];
              const max = Math.max(1, ...arr.map(k => counts[k]));
              const pct = Math.round((n / max) * 100);
              return (
                <div key={key} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${meta.bg}`}>
                  <span className={`w-20 shrink-0 text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                  <div className="flex-1 h-2 bg-white/60 rounded-full overflow-hidden">
                    <div className={`h-full ${meta.color.replace('text-', 'bg-')}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-sm font-bold tabular-nums w-6 text-right ${meta.color}`}>{n}</span>
                </div>
              );
            })}
          </div>
          <a
            href="/admin?tab=contacts"
            className="mt-4 w-full inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-wishes-primary hover:bg-gray-50 transition-colors"
          >
            전체 상담 보기 →
          </a>
        </div>
      </div>
    </div>
  );
}
