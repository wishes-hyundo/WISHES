'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AdminBriefingPanel (T5-5)
//   중개사 일일 브리핑 위젯 — 관리자 대시보드 상단에 노출
//   매일 아침 한 번 열어서 "오늘의 중점 매물·상담·등록"을 확인하는 용도
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Eye, Phone, Mail, MessageSquare, Calendar, Flame, PlusCircle, PieChart, Building, Sparkles, RefreshCw, ArrowRight, AlertCircle } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';

type TopListing = {
  id: number;
  title: string;
  type: string;
  deal: string;
  dong: string;
  deposit: number;
  monthly?: number | null;
  price?: number | null;
  views: number;
  source_site?: string | null;
};

type RecentListing = {
  id: number;
  title: string;
  type: string;
  deal: string;
  dong: string;
  deposit: number;
  monthly?: number | null;
  price?: number | null;
  created_at: string;
  source_site?: string | null;
};

type PendingContact = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  message?: string | null;
  created_at: string;
};

type BriefingData = {
  topViews: TopListing[];
  recent: RecentListing[];
  pendingContacts: PendingContact[];
  dealCounts: Record<string, number>;
  ownVsCrawled: { own: number; crawled: number };
  generatedAt: string;
};

// 가격 포맷
function formatMan(man?: number | null): string {
  if (!man) return '—';
  if (man >= 10000) {
    const uk = Math.floor(man / 10000);
    const rest = man % 10000;
    return rest > 0 ? `${uk}억 ${rest.toLocaleString()}` : `${uk}억`;
  }
  return `${man.toLocaleString()}만원`;
}

function priceOf(l: { deal: string; deposit: number; monthly?: number | null; price?: number | null }): string {
  if (l.deal === '월세') return `${formatMan(l.deposit)} / 월 ${l.monthly ? l.monthly.toLocaleString() : '—'}`;
  if (l.deal === '전세') return `전세 ${formatMan(l.deposit)}`;
  if (l.deal === '매매') return `매매 ${formatMan(l.price || l.deposit)}`;
  return formatMan(l.price || l.deposit);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return '방금';
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function AdminBriefingPanel({ authHeader }: { authHeader: string }) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // L-leak4: unmount/deps 변경 시 in-flight fetch 취소. refresh 버튼 호출 호환.
  const fetchBriefing = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      // L-sec147 (2026-04-23, C-2 phase 3b): adminFetch — credentials+CSRF.
      const res = await adminFetch('/api/admin/briefing', {
        headers: { authorization: authHeader },
        signal,
      });
      if (signal?.aborted) return;
      if (!res.ok) throw new Error('브리핑 데이터를 불러오지 못했습니다');
      const json = await res.json();
      if (signal?.aborted) return;
      if (!json.success) throw new Error(json.error || '알 수 없는 오류');
      setData(json.data);
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') return;
      setError(e?.message || '조회 실패');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    const ac = new AbortController();
    fetchBriefing(ac.signal);
    return () => ac.abort();
  }, [fetchBriefing]);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
        오늘의 브리핑 데이터 불러오는 중…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 text-sm flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span className="flex-1">{error}</span>
        <button onClick={() => fetchBriefing()} className="px-3 py-1 rounded-lg bg-white border border-red-300 hover:bg-red-100 text-xs font-semibold">
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) return null;

  const totalPublic = data.ownVsCrawled.own + data.ownVsCrawled.crawled;
  const ownPct = totalPublic > 0 ? Math.round((data.ownVsCrawled.own / totalPublic) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-wishes-primary to-wishes-secondary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-wishes-primary">오늘의 중개 브리핑</h3>
            <p className="text-xs text-gray-500">
              {new Date(data.generatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 기준
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchBriefing()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wishes-primary/30 text-wishes-primary text-xs font-semibold hover:bg-wishes-primary/5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 1. 거래유형 · 포트폴리오 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <PieChart className="w-4 h-4 text-wishes-primary" />
            <p className="text-xs font-bold text-gray-600">거래유형 분포 (공개)</p>
          </div>
          <div className="space-y-1.5 mt-3">
            {(['전세', '월세', '매매'] as const).map((deal) => {
              const count = data.dealCounts[deal] || 0;
              const pct = totalPublic > 0 ? (count / totalPublic) * 100 : 0;
              const color = deal === '전세' ? 'bg-blue-500' : deal === '월세' ? 'bg-emerald-500' : 'bg-amber-500';
              return (
                <div key={deal}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-semibold text-gray-700">{deal}</span>
                    <span className="text-gray-500">{count}건 ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building className="w-4 h-4 text-wishes-primary" />
            <p className="text-xs font-bold text-gray-600">자체 매물 vs 외부</p>
          </div>
          <div className="mt-3">
            <div className="flex items-end justify-between mb-1">
              <div>
                <p className="text-[10px] text-gray-500">자체 매물</p>
                <p className="text-2xl font-bold text-wishes-primary">{data.ownVsCrawled.own}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500">외부 소스</p>
                <p className="text-xl font-bold text-gray-500">{data.ownVsCrawled.crawled}</p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-wishes-primary to-wishes-secondary" style={{ width: `${ownPct}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">자체 매물 비중 {ownPct}%</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-wishes-primary to-wishes-secondary rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4" />
            <p className="text-xs font-bold opacity-90">미처리 상담</p>
          </div>
          <p className="text-4xl font-bold mt-3">{data.pendingContacts.length}</p>
          <p className="text-xs opacity-80 mt-1">오늘 대응이 필요한 건수</p>
          <Link
            href="/admin?tab=contacts"
            className="inline-flex items-center gap-1 mt-3 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-1 transition-colors"
          >
            상담 관리로 이동
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* 2. 조회수 TOP 5 + 최근 등록 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 조회수 TOP */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <h4 className="text-sm font-bold text-gray-800">HOT 매물 TOP 5</h4>
            </div>
            <span className="text-[10px] text-gray-400">조회수 순</span>
          </div>
          {data.topViews.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">조회 데이터가 없습니다</p>
          ) : (
            <ol className="space-y-2">
              {data.topViews.slice(0, 5).map((l, idx) => (
                <li key={l.id}>
                  <Link
                    href={`/listings/${l.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      idx === 0 ? 'bg-yellow-100 text-yellow-700'
                      : idx === 1 ? 'bg-gray-100 text-gray-700'
                      : idx === 2 ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-50 text-gray-500'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span>{l.dong}</span><span>·</span><span>{l.type}</span><span>·</span><span>{l.deal}</span>
                        {l.source_site && (
                          <span className="ml-1 px-1 py-0.5 bg-gray-100 rounded text-[8px] font-bold text-gray-500">외부</span>
                        )}
                      </div>
                      <p className="text-[12px] font-semibold text-gray-800 truncate group-hover:text-wishes-primary">
                        {l.title}
                      </p>
                      <p className="text-[10px] text-gray-500">{priceOf(l)}</p>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-orange-600 shrink-0">
                      <Eye className="w-3 h-3" />
                      {l.views?.toLocaleString() || 0}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* 최근 등록 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-wishes-secondary" />
              <h4 className="text-sm font-bold text-gray-800">최근 7일 등록 매물</h4>
            </div>
            <span className="text-[10px] text-gray-400">{data.recent.length}건</span>
          </div>
          {data.recent.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">최근 등록 매물이 없습니다</p>
          ) : (
            <ul className="space-y-2">
              {data.recent.slice(0, 5).map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/listings/${l.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <Calendar className="w-4 h-4 text-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span>{l.dong}</span><span>·</span><span>{l.type}</span><span>·</span><span>{l.deal}</span>
                        {l.source_site && (
                          <span className="ml-1 px-1 py-0.5 bg-gray-100 rounded text-[8px] font-bold text-gray-500">외부</span>
                        )}
                      </div>
                      <p className="text-[12px] font-semibold text-gray-800 truncate group-hover:text-wishes-primary">
                        {l.title}
                      </p>
                      <p className="text-[10px] text-gray-500">{priceOf(l)}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {timeAgo(l.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 3. 미처리 상담 요약 */}
      {data.pendingContacts.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-red-500" />
              <h4 className="text-sm font-bold text-gray-800">미처리 상담 ({data.pendingContacts.length})</h4>
            </div>
            <Link href="/admin?tab=contacts" className="text-[11px] font-semibold text-wishes-primary hover:underline">
              전체 보기 →
            </Link>
          </div>
          <ul className="divide-y divide-gray-100">
            {data.pendingContacts.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-2">
                <div className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {c.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{c.name}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                      <Phone className="w-3 h-3" />
                      {c.phone}
                    </span>
                    {c.email && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <Mail className="w-3 h-3" />
                        {c.email}
                      </span>
                    )}
                  </div>
                  {c.message && (
                    <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2">{c.message}</p>
                  )}
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(c.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
