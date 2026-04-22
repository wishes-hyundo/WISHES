'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AdminNewsletterPanel (T5-7)
//   어드민: 활성 구독자 리스트 + 뉴스레터 대량 발송 + 매칭 알림 수동 트리거
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useCallback } from 'react';
import { Bell, Users, Mail, Send, RefreshCw, Loader2, CheckCircle2, AlertCircle, Play } from 'lucide-react';

type Subscriber = {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  deal: string | null;
  type: string | null;
  gu: string | null;
  dong: string | null;
  max_price: number | null;
  max_deposit: number | null;
  max_monthly: number | null;
  min_area_m2: number | null;
  source: string | null;
  last_notified_at: string | null;
  total_sent: number;
  active: boolean;
  created_at: string;
};

function filterLabel(s: Subscriber): string[] {
  const out: string[] = [];
  if (s.gu) out.push(s.gu);
  if (s.dong) out.push(s.dong);
  if (s.deal) out.push(s.deal);
  if (s.type) out.push(s.type);
  if (s.max_deposit) out.push(`보증금 ${s.max_deposit.toLocaleString('ko-KR')}만 이하`);
  if (s.max_price) out.push(`매매 ${s.max_price.toLocaleString('ko-KR')}만 이하`);
  if (s.max_monthly) out.push(`월세 ${s.max_monthly.toLocaleString('ko-KR')}만 이하`);
  if (s.min_area_m2) out.push(`${s.min_area_m2}㎡ 이상`);
  return out;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '미발송';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d >= 1) return `${d}일 전`;
  const h = Math.floor(diff / 3600000);
  if (h >= 1) return `${h}시간 전`;
  return '최근';
}

export default function AdminNewsletterPanel({ authHeader }: { authHeader: string }) {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<{ total: number; active: number; neverNotified: number }>({
    total: 0, active: 0, neverNotified: 0,
  });
  const [loading, setLoading] = useState(true);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; msg: string } | null>(null);

  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  // L-leak4: unmount/deps 변경 시 in-flight fetch 취소. refresh 버튼 호출 호환.
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/subscribers?active=1', {
        headers: { Authorization: authHeader },
        signal,
      });
      if (signal?.aborted) return;
      const json = await res.json();
      if (signal?.aborted) return;
      if (json.success) {
        setSubs(json.subscribers || []);
        setStats(json.stats || { total: 0, active: 0, neverNotified: 0 });
      }
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') return;
      console.error(e);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const sendNewsletter = async () => {
    if (!subject.trim() || !body.trim()) {
      setSendResult({ success: false, msg: '제목과 본문을 입력해주세요' });
      return;
    }
    if (!confirm(`활성 구독자 ${stats.active}명에게 뉴스레터를 발송합니다.\n\n제목: ${subject}\n\n진행하시겠습니까?`)) return;

    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/admin/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ subject, body }),
      });
      const json = await res.json();
      if (json.success) {
        setSendResult({
          success: true,
          msg: `발송 완료: ${json.sent}/${json.total}건${json.failedCount ? ` · 실패 ${json.failedCount}건` : ''}`,
        });
        setSubject(''); setBody('');
      } else {
        setSendResult({ success: false, msg: json.error || '발송 실패' });
      }
    } catch (e: any) {
      setSendResult({ success: false, msg: e?.message || '네트워크 오류' });
    } finally {
      setSending(false);
    }
  };

  const triggerMatches = async () => {
    if (!confirm('신규 매물 매칭 알림을 지금 발송합니다. 활성 구독자 전체에 대해 조건 매칭 후 발송합니다.')) return;
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch('/api/cron/notify-matches', {
        method: 'POST',
        headers: { Authorization: authHeader },
      });
      const json = await res.json();
      if (json.success) {
        setTriggerResult(`구독자 ${json.subscribers}명 중 ${json.sent}명에게 매칭 알림 발송 완료`);
        load();
      } else {
        setTriggerResult(`실패: ${json.error || '알 수 없는 오류'}`);
      }
    } catch (e: any) {
      setTriggerResult(`오류: ${e?.message || '네트워크 오류'}`);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-wishes-primary/[0.04] to-white">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-wishes-primary/10">
            <Bell className="w-4 h-4 text-wishes-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold text-wishes-primary">매물 알림 구독 · 뉴스레터</h2>
            <p className="text-[11px] text-gray-500 leading-tight">활성 구독자 {stats.active}명 · 신규 매물 매칭 · 대량 발송</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 상단 요약 + 트리거 버튼 */}
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-gray-100">
        <StatCell label="활성 구독자" value={stats.active} icon={Users} color="text-wishes-primary" />
        <StatCell label="최초 발송 대기" value={stats.neverNotified} icon={Mail} color="text-amber-600" />
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={triggerMatches}
            disabled={triggering || stats.active === 0}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-wishes-primary text-white font-bold text-sm hover:bg-wishes-secondary disabled:opacity-60"
          >
            {triggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            신규 매물 매칭 알림 발송
          </button>
        </div>
      </div>
      {triggerResult && (
        <div className="px-5 py-2.5 bg-green-50 border-b border-green-100 text-xs text-green-800 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> {triggerResult}
        </div>
      )}

      {/* 뉴스레터 작성 */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/30">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
          <Send className="w-4 h-4 text-wishes-primary" /> 어드민 뉴스레터 발송
        </h3>
        <div className="space-y-3">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="제목 (예: 4월 강남 아파트 추천 매물)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-primary/30"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="본문 (HTML 허용 — <br>, <strong>, <a> 등 사용 가능)"
            rows={6}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-primary/30 font-mono"
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-500">
              활성 구독자 <strong className="text-wishes-primary">{stats.active}</strong>명 전체에게 발송됩니다.
            </p>
            <button
              type="button"
              onClick={sendNewsletter}
              disabled={sending || !subject.trim() || !body.trim() || stats.active === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-wishes-secondary text-white text-sm font-bold hover:bg-wishes-primary disabled:opacity-60"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              발송
            </button>
          </div>
          {sendResult && (
            <div
              className={`px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 ${
                sendResult.success
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {sendResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {sendResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* 구독자 리스트 */}
      <div className="px-5 py-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-wishes-primary" /> 활성 구독자 ({subs.length}명)
        </h3>
        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm"><Loader2 className="w-5 h-5 animate-spin inline" /> 불러오는 중...</div>
        ) : subs.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">아직 구독자가 없습니다.</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {subs.map((s) => {
              const labels = filterLabel(s);
              return (
                <div key={s.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-wishes-primary/40 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-wishes-primary/10 text-wishes-primary flex items-center justify-center font-bold text-sm shrink-0">
                    {(s.name || s.email)[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-800 truncate">{s.name || '—'}</span>
                      <a href={`mailto:${s.email}`} className="text-xs text-wishes-secondary hover:underline truncate">{s.email}</a>
                      {s.phone && <span className="text-[11px] text-gray-400">· {s.phone}</span>}
                    </div>
                    {labels.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {labels.map((l) => (
                          <span key={l} className="inline-flex px-2 py-0.5 rounded-full bg-wishes-primary/[0.06] border border-wishes-primary/15 text-[10px] font-semibold text-wishes-primary">
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] text-gray-400">
                      발송 {s.total_sent}회 · 마지막 {timeAgo(s.last_notified_at)} · 등록 {new Date(s.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function StatCell({ label, value, icon: Icon, color }: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-200">
      <Icon className={`w-6 h-6 ${color}`} />
      <div>
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{label}</div>
        <div className={`text-xl font-extrabold ${color}`}>{value.toLocaleString()}</div>
      </div>
    </div>
  );
}
