'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /admin/dedup — 중복매물 리뷰·정리 센터
//
// 워크플로:
//   1) [중복 스캔] 클릭 → /api/admin/dedup/scan 호출
//   2) 그룹 카드 렌더 (대표 🏆 + 숨길 후보 🫥 사진/필드 비교)
//   3) 관리자가 확인 후 [숨김 처리] → soft-delete (30일 복구 가능)
//   4) [복구 큐] 탭 → 30일 내 복구 가능
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import React, { useState, useEffect, useMemo, useCallback } from 'react';

interface Summary {
  id: number;
  title: string | null;
  type: string | null;
  address: string | null;
  address_detail: string | null;
  area_m2: number | null;
  floor_current: string | null;
  deposit: number | null;
  monthly: number | null;
  price: number | null;
  source_site: string | null;
  source_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  image_count: number;
  thumbnail: string | null;
  confidence?: number;
  mismatches?: string[];
}

interface Group {
  group_id: string;
  kept: Summary;
  duplicates: Summary[];
  reason: string;
  confidence: number;
  mismatches: string[];
}

interface ScanResult {
  success: boolean;
  total_listings: number;
  total_groups: number;
  total_duplicates: number;
  groups: Group[];
  min_confidence: number;
  scanned_at: string;
}

interface QueueRow {
  id: number;
  title: string;
  address: string;
  address_detail: string | null;
  area_m2: number | null;
  floor_current: string | null;
  deposit: number | null;
  monthly: number | null;
  price: number | null;
  source_site: string | null;
  dedup_requested_at: string | null;
  dedup_reason: string | null;
  dedup_group_id: string | null;
  dedup_kept_id: number | null;
  age_days: number;
  remain_days: number;
  will_hard_delete_soon: boolean;
  image_count: number;
  thumbnail: string | null;
}

function fmtPrice(d: Summary): string {
  const parts: string[] = [];
  if (d.price) parts.push(`매매 ${(d.price / 10000).toFixed(1)}억`);
  if (d.deposit) parts.push(`${d.deposit.toLocaleString()}`);
  if (d.monthly) parts.push(`/${d.monthly.toLocaleString()}`);
  return parts.join(' ') || '-';
}

function fmtDate(s: string | null): string {
  if (!s) return '-';
  try {
    return new Date(s).toLocaleString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s.slice(0, 16);
  }
}

function ConfidenceBadge({ c }: { c: number }) {
  const color =
    c >= 95 ? 'bg-red-600 text-white' : c >= 85 ? 'bg-orange-500 text-white' : 'bg-amber-500 text-white';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color}`}>{c}%</span>;
}

function ListingChip({
  data,
  role,
  onClick,
}: {
  data: Summary;
  role: 'kept' | 'dup';
  onClick?: () => void;
}) {
  const isKept = role === 'kept';
  const border = isKept ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white';
  const badge = isKept ? (
    <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
      🏆 대표 유지
    </span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded-full bg-slate-500 text-white text-[10px] font-bold">
      🫥 숨김 대상
    </span>
  );

  return (
    <div
      className={`relative border-2 rounded-xl p-3 ${border} cursor-pointer hover:shadow-lg transition`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-slate-200">
          {data.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.thumbnail}
              alt={data.title || ''}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full text-slate-400 text-xs">
              📷 없음
            </div>
          )}
          {data.image_count > 1 && (
            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px]">
              📷 {data.image_count}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">{badge}</div>
          <div className="text-xs text-slate-500">#{data.id}</div>
          <div className="font-bold text-sm text-slate-900 truncate" title={data.title || ''}>
            {data.title || '-'}
          </div>
          <div className="text-xs text-slate-600 truncate mt-0.5">
            {data.address} {data.address_detail}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            {data.type} · {data.area_m2 ? `${data.area_m2.toFixed(1)}m²` : '-'} ·{' '}
            {data.floor_current || '-'}
          </div>
          <div className="text-xs font-semibold text-slate-800 mt-0.5">{fmtPrice(data)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            출처: {data.source_site || '수동'} / 등록: {fmtDate(data.created_at)}
          </div>
          {!isKept && typeof data.confidence === 'number' && (
            <div className="mt-1 flex items-center gap-2">
              <ConfidenceBadge c={data.confidence} />
              {!!data.mismatches?.length && (
                <span className="text-[10px] text-amber-700">
                  ⚠ {data.mismatches.join(' · ')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupCard({
  g,
  onHide,
  busy,
}: {
  g: Group;
  onHide: (g: Group) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <ConfidenceBadge c={g.confidence} />
          <span className="font-bold text-slate-800">
            그룹 {g.group_id}
          </span>
          <span className="text-xs text-slate-500">
            1건 유지 · {g.duplicates.length}건 숨김 후보
          </span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-slate-600 hover:text-slate-900 underline"
        >
          {open ? '접기' : '펼치기'}
        </button>
      </div>

      <div className="mb-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-xs text-slate-500 mb-0.5">✅ 매칭 근거</div>
        <div className="text-sm text-slate-800">{g.reason}</div>
        {!!g.mismatches.length && (
          <div className="mt-1 text-xs text-amber-700">
            ⚠ 차이점: {g.mismatches.join(' · ')}
          </div>
        )}
      </div>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <ListingChip
            data={g.kept}
            role="kept"
            onClick={() => window.open(`/admin/listings/${g.kept.id}`, '_blank')}
          />
          {g.duplicates.map((d) => (
            <ListingChip
              key={d.id}
              data={d}
              role="dup"
              onClick={() => window.open(`/admin/listings/${d.id}`, '_blank')}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button
          disabled={busy}
          onClick={() => onHide(g)}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-500 disabled:opacity-50 transition"
        >
          {busy ? '처리 중...' : `🫥 숨김 처리 (${g.duplicates.length}건, 30일 복구 가능)`}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── 메인 페이지 ───────────────────────── */

export default function AdminDedupPage() {
  const [tab, setTab] = useState<'scan' | 'queue'>('scan');
  const [loading, setLoading] = useState(false);
  const [minConfidence, setMinConfidence] = useState(85);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const getToken = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return (
      window.sessionStorage.getItem('ws_token') ||
      window.localStorage.getItem('ws_token') ||
      'wishes2026'
    );
  }, []);

  const runScan = useCallback(async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const r = await fetch('/api/admin/dedup/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ minConfidence, limit: 300 }),
      });
      const j = (await r.json()) as ScanResult;
      if (!j.success) throw new Error((j as any).error || 'scan failed');
      setResult(j);
      setHiddenGroups(new Set());
      setStatusMsg(
        `✅ 스캔 완료: 전체 ${j.total_listings.toLocaleString()}건 중 ${j.total_groups}개 그룹 / ${j.total_duplicates}건 중복 후보`,
      );
    } catch (e: any) {
      setStatusMsg(`❌ 스캔 실패: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [minConfidence, getToken]);

  const runHide = useCallback(
    async (g: Group) => {
      if (!confirm(`[${g.group_id}] ${g.duplicates.length}건을 숨김 처리합니다.\n\n30일 이내 복구 가능하며, 30일 후 자동 영구삭제됩니다.\n\n계속할까요?`)) {
        return;
      }
      setBusyGroup(g.group_id);
      try {
        const r = await fetch('/api/admin/dedup/hide', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            ids: g.duplicates.map((d) => d.id),
            group_id: g.group_id,
            kept_id: g.kept.id,
            reason: g.reason,
          }),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error || 'hide failed');
        setHiddenGroups((prev) => {
          const next = new Set(prev);
          next.add(g.group_id);
          return next;
        });
        setStatusMsg(`✅ ${j.hidden}건 숨김 처리 완료. 30일 이내 [복구 큐] 에서 되살릴 수 있습니다.`);
      } catch (e: any) {
        setStatusMsg(`❌ 숨김 처리 실패: ${e.message || e}`);
      } finally {
        setBusyGroup(null);
      }
    },
    [getToken],
  );

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const r = await fetch('/api/admin/dedup/restore', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'queue load failed');
      setQueue(j.rows || []);
    } catch (e: any) {
      setStatusMsg(`❌ 큐 로드 실패: ${e.message || e}`);
    } finally {
      setQueueLoading(false);
    }
  }, [getToken]);

  const restoreOne = useCallback(
    async (id: number) => {
      if (!confirm(`매물 #${id} 을(를) 다시 '가용' 상태로 복구할까요?`)) return;
      try {
        const r = await fetch('/api/admin/dedup/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ ids: [id] }),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error || 'restore failed');
        setStatusMsg(`✅ #${id} 복구 완료`);
        await loadQueue();
      } catch (e: any) {
        setStatusMsg(`❌ 복구 실패: ${e.message || e}`);
      }
    },
    [getToken, loadQueue],
  );

  const restoreGroup = useCallback(
    async (group_id: string) => {
      if (!confirm(`그룹 ${group_id} 전체를 복구할까요?`)) return;
      try {
        const r = await fetch('/api/admin/dedup/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ group_id }),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error || 'restore failed');
        setStatusMsg(`✅ 그룹 ${group_id} 복구 완료 (${j.restored}건)`);
        await loadQueue();
      } catch (e: any) {
        setStatusMsg(`❌ 그룹 복구 실패: ${e.message || e}`);
      }
    },
    [getToken, loadQueue],
  );

  useEffect(() => {
    if (tab === 'queue') loadQueue();
  }, [tab, loadQueue]);

  const pendingGroups = useMemo(
    () => (result?.groups || []).filter((g) => !hiddenGroups.has(g.group_id)),
    [result, hiddenGroups],
  );

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-white mb-1">
          🧹 중복 매물 정리 센터
        </h1>
        <p className="text-white/70 text-sm">
          소재지·동호수·거래유형·가격이 모두 일치하는 "100% 중복" 매물을 탐지하고 리뷰합니다.
          숨김 처리 후 30일 동안 복구 가능하며, 30일이 지나면 자동으로 영구 삭제됩니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab('scan')}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition ${
            tab === 'scan' ? 'bg-emerald-500 text-black shadow-lg' : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          🔍 중복 스캔
        </button>
        <button
          onClick={() => setTab('queue')}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition ${
            tab === 'queue' ? 'bg-amber-400 text-black shadow-lg' : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          ♻️ 복구 큐 {queue.length > 0 && `(${queue.length})`}
        </button>
      </div>

      {statusMsg && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-sm">
          {statusMsg}
        </div>
      )}

      {/* 스캔 탭 */}
      {tab === 'scan' && (
        <>
          <div className="mb-5 p-4 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold text-slate-700">
              최소 신뢰도:
              <select
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="ml-2 px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
              >
                <option value={70}>70%+ (관대)</option>
                <option value={80}>80%+ </option>
                <option value={85}>85%+ (권장)</option>
                <option value={90}>90%+ </option>
                <option value={95}>95%+ (엄격)</option>
              </select>
            </label>
            <button
              onClick={runScan}
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {loading ? '🔄 스캔 중...' : '🔍 중복 스캔 실행'}
            </button>
            {result && (
              <div className="text-xs text-slate-500 ml-auto">
                마지막 스캔: {fmtDate(result.scanned_at)} · 처리: {result.total_listings.toLocaleString()}건
              </div>
            )}
          </div>

          {!result && !loading && (
            <div className="p-10 text-center bg-white/5 rounded-2xl border border-dashed border-white/20 text-white/60">
              "중복 스캔 실행" 을 눌러 시작하세요. 전체 매물을 대상으로 4축 완전일치 그룹을 찾아냅니다.
            </div>
          )}

          {result && pendingGroups.length === 0 && (
            <div className="p-10 text-center bg-white/5 rounded-2xl border border-white/20 text-white/70">
              🎉 설정한 신뢰도({minConfidence}%) 이상의 중복 후보가 없습니다.
            </div>
          )}

          {pendingGroups.map((g) => (
            <GroupCard
              key={g.group_id}
              g={g}
              onHide={runHide}
              busy={busyGroup === g.group_id}
            />
          ))}
        </>
      )}

      {/* 복구 큐 탭 */}
      {tab === 'queue' && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={loadQueue}
              disabled={queueLoading}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold"
            >
              {queueLoading ? '로딩...' : '🔄 새로고침'}
            </button>
            <div className="text-xs text-white/70">
              숨김 처리된 매물은 30일 동안 복구 가능합니다.
            </div>
          </div>

          {queue.length === 0 && !queueLoading && (
            <div className="p-10 text-center bg-white/5 rounded-2xl border border-dashed border-white/20 text-white/60">
              현재 복구 가능한 매물이 없습니다.
            </div>
          )}

          <div className="grid gap-3">
            {queue.map((r) => (
              <div
                key={r.id}
                className={`bg-white rounded-xl border p-3 flex items-start gap-3 ${
                  r.will_hard_delete_soon ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-200'
                }`}
              >
                <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-slate-200">
                  {r.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full text-slate-400 text-xs">
                      없음
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">#{r.id}</span>
                    {r.will_hard_delete_soon ? (
                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                        ⚠ {r.remain_days}일 후 영구삭제
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                        {r.remain_days}일 복구 가능
                      </span>
                    )}
                    {r.dedup_group_id && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
                        그룹 {r.dedup_group_id}
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-sm text-slate-900 truncate">{r.title}</div>
                  <div className="text-xs text-slate-600">
                    {r.address} {r.address_detail}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    보증금 {(r.deposit || 0).toLocaleString()} / {(r.monthly || 0).toLocaleString()}
                    {r.area_m2 ? ` · ${r.area_m2.toFixed(1)}m²` : ''}
                    {r.floor_current ? ` · ${r.floor_current}` : ''}
                  </div>
                  {r.dedup_reason && (
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      사유: {r.dedup_reason}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => restoreOne(r.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500"
                  >
                    ♻️ 복구
                  </button>
                  {r.dedup_group_id && (
                    <button
                      onClick={() => restoreGroup(r.dedup_group_id!)}
                      className="px-3 py-1.5 rounded-lg bg-white/70 border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
                    >
                      그룹 복구
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
