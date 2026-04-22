'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AdminConversionPanel — 주간/월간 리드 전환율 카드
//
//   목적: 리드 → 연락 → 방문 → 계약 → 성사 단계별 전환율을
//          7일 / 30일 구간으로 한눈에 보여준다.
//
//   재사용: /api/admin/contacts (pipeline_status 컬럼)
//   계산 로직: 각 단계에 "도달한" 리드 수 = pipeline_status가
//            해당 단계 또는 그 이후 단계인 건수.
//            단, closed_lost는 항상 제외 (이탈).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, ArrowRight, RefreshCw, AlertCircle, Target } from 'lucide-react';

type PipelineStatus = 'new' | 'contacted' | 'visit_booked' | 'contract' | 'closed_won' | 'closed_lost';
type LossReason = 'price' | 'inventory' | 'timing' | 'changed_mind' | 'other';

interface Contact {
  id: number;
  pipelineStatus: PipelineStatus;
  lossReason?: LossReason | null;
  source?: string | null;
  createdAt: string;
}

// #37 + #49: 유입 경로 카테고리 매핑
//   - 저장된 source는 enrichSource()로 가공된 태그 혹은 pathname 기준
//   - UTM / 광고 / 검색엔진 프리픽스를 우선 매칭하고, 이후 pathname 카테고리
//   - 사람이 읽기 좋은 라벨로 치환
const SOURCE_CATEGORIES: { key: string; label: string; match: (s: string) => boolean; emoji: string }[] = [
  // ── 광고 / 검색 유입 (#49 UTM 파싱 결과) ────────────────────────────────
  { key: 'google-ads',    label: '구글 광고',     emoji: '🟢', match: (s) => s.startsWith('google-ads:') },
  { key: 'facebook-ads',  label: 'Meta 광고',     emoji: '🔵', match: (s) => s.startsWith('facebook-ads:') },
  { key: 'kakao-ads',     label: '카카오 광고',   emoji: '🟡', match: (s) => s.startsWith('kakao-ads:') },
  { key: 'search-naver',  label: '네이버 검색',   emoji: '🔍', match: (s) => s.startsWith('search:naver') },
  { key: 'search-google', label: '구글 검색',     emoji: '🔎', match: (s) => s.startsWith('search:google') },
  { key: 'search-daum',   label: '다음 검색',     emoji: '🔎', match: (s) => s.startsWith('search:daum') },
  { key: 'search-other',  label: '기타 검색',     emoji: '🔍', match: (s) => s.startsWith('search:') },
  { key: 'ref-external',  label: '외부 추천',     emoji: '🔗', match: (s) => s.startsWith('ref:') },
  { key: 'utm-other',     label: '기타 UTM',      emoji: '🎯', match: (s) => /^[a-z0-9_-]+:/i.test(s) && !s.startsWith('/') },
  // ── 자사 페이지 유입 (pathname 기반) ────────────────────────────────
  { key: 'home',         label: '홈 히어로',     emoji: '🏠', match: (s) => s === '/' || s === '' },
  { key: 'listing-detail', label: '매물 상세',    emoji: '📄', match: (s) => /^\/listings\/[^/]+/.test(s) },
  { key: 'listings',     label: '매물 리스트',   emoji: '📋', match: (s) => s === '/listings' || s.startsWith('/listings?') },
  { key: 'map',          label: '지도',          emoji: '🗺️', match: (s) => s === '/map' || s.startsWith('/map') },
  { key: 'contact',      label: '상담 페이지',   emoji: '💬', match: (s) => s === '/contact' || s.startsWith('/contact') },
  { key: 'calculator',   label: '대출 계산기',   emoji: '🧮', match: (s) => s.startsWith('/calculator') },
  { key: 'favorites',    label: '찜 목록',       emoji: '❤️', match: (s) => s.startsWith('/favorites') },
  { key: 'ai-match',     label: 'AI 매칭',       emoji: '🤖', match: (s) => s.startsWith('/ai') || s.startsWith('/match') },
];

function categorizeSource(src?: string | null): { key: string; label: string; emoji: string } {
  if (!src) return { key: 'unknown', label: '경로 미상', emoji: '❓' };
  const trimmed = src.trim();
  for (const cat of SOURCE_CATEGORIES) {
    if (cat.match(trimmed)) return { key: cat.key, label: cat.label, emoji: cat.emoji };
  }
  return { key: 'other', label: '기타', emoji: '🔗' };
}

const LOSS_REASON_LABELS: Record<LossReason, string> = {
  price: '가격',
  inventory: '매물 부족',
  timing: '타이밍',
  changed_mind: '고객 변심',
  other: '기타',
};

interface Props {
  authHeader: string;
}

// 단계 순서 (closed_lost 제외)
const STAGES: PipelineStatus[] = ['new', 'contacted', 'visit_booked', 'contract', 'closed_won'];

const STAGE_META: Record<PipelineStatus, { label: string; emoji: string; short: string }> = {
  new:          { label: '신규 접수',  emoji: '📨', short: '접수' },
  contacted:    { label: '연락 완료',  emoji: '📞', short: '연락' },
  visit_booked: { label: '방문 예정',  emoji: '🚗', short: '방문' },
  contract:     { label: '계약 진행',  emoji: '📝', short: '진행' },
  closed_won:   { label: '계약 완료',  emoji: '🏆', short: '성사' },
  closed_lost:  { label: '이탈',      emoji: '💨', short: '이탈' },
};

// 단계 순위 — "해당 단계 또는 그 이후" 판별용
const STAGE_RANK: Record<PipelineStatus, number> = {
  new: 0, contacted: 1, visit_booked: 2, contract: 3, closed_won: 4, closed_lost: -1,
};

type RangeKey = '7d' | '30d';

export default function AdminConversionPanel({ authHeader }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState<RangeKey>('7d');

  // L-leak4: unmount/deps 변경 시 in-flight fetch 취소. refresh 버튼 호출 호환.
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/contacts', {
        headers: { authorization: authHeader },
        signal,
      });
      if (signal?.aborted) return;
      if (res.ok) {
        const json = await res.json();
        if (signal?.aborted) return;
        setContacts(json.data || []);
      } else {
        setError('전환 데이터를 불러오지 못했습니다.');
      }
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') return;
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    // L-leak4: unmount/deps 변경 시 in-flight /api/admin/analytics fetch 취소.
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  // 범위 필터링
  const rangeDays = range === '7d' ? 7 : 30;
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    return d.getTime();
  }, [rangeDays]);

  const inRange = useMemo(
    () => contacts.filter(c => new Date(c.createdAt).getTime() >= cutoff),
    [contacts, cutoff]
  );

  // 이탈 제외한 유효 리드
  const activeLeads = inRange.filter(c => c.pipelineStatus !== 'closed_lost');
  const lostLeads = inRange.filter(c => c.pipelineStatus === 'closed_lost');

  // 각 단계 "도달" 건수 — 현재 상태의 rank >= 단계 rank
  const reached = useMemo(() => {
    const out: Record<PipelineStatus, number> = {
      new: 0, contacted: 0, visit_booked: 0, contract: 0, closed_won: 0, closed_lost: 0,
    };
    for (const c of activeLeads) {
      const currentRank = STAGE_RANK[c.pipelineStatus];
      for (const s of STAGES) {
        if (currentRank >= STAGE_RANK[s]) out[s]++;
      }
    }
    return out;
  }, [activeLeads]);

  // 단계 간 전환율 (각 단계 → 다음 단계)
  const stepRates: { from: PipelineStatus; to: PipelineStatus; rate: number }[] = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    const from = STAGES[i];
    const to = STAGES[i + 1];
    const rate = reached[from] > 0 ? Math.round((reached[to] / reached[from]) * 100) : 0;
    stepRates.push({ from, to, rate });
  }

  const totalLeads = inRange.length;
  const overallRate = totalLeads > 0 ? Math.round((reached.closed_won / totalLeads) * 100) : 0;
  const lostRate = totalLeads > 0 ? Math.round((lostLeads.length / totalLeads) * 100) : 0;

  // ─── 최근 4주 주간 전환율 추이 (스파크라인) — 선택 범위와 무관하게 고정 4주 (#31) ───
  const weekly = useMemo(() => {
    const weeks: { label: string; total: number; won: number; rate: number }[] = [];
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(now.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      const bucket = contacts.filter(c => {
        const t = new Date(c.createdAt).getTime();
        return t >= start.getTime() && t < end.getTime();
      });
      const won = bucket.filter(c => c.pipelineStatus === 'closed_won').length;
      const total = bucket.length;
      weeks.push({
        label: `${end.getMonth() + 1}/${end.getDate()}`,
        total,
        won,
        rate: total > 0 ? Math.round((won / total) * 100) : 0,
      });
    }
    return weeks;
  }, [contacts]);

  // ─── 리드 소스 분석 (#37) — 선택 범위(rangeDays) 내 유입 경로별 전환률 ───
  const sourceBreakdown = useMemo(() => {
    type Row = { key: string; label: string; emoji: string; total: number; won: number; active: number; rate: number };
    const rows = new Map<string, Row>();
    for (const c of inRange) {
      const cat = categorizeSource(c.source);
      const row = rows.get(cat.key) || { key: cat.key, label: cat.label, emoji: cat.emoji, total: 0, won: 0, active: 0, rate: 0 };
      row.total++;
      if (c.pipelineStatus === 'closed_won') row.won++;
      if (c.pipelineStatus !== 'closed_lost') row.active++;
      rows.set(cat.key, row);
    }
    const list = Array.from(rows.values())
      .map(r => ({ ...r, rate: r.total > 0 ? Math.round((r.won / r.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
    // 최고 전환률 (최소 리드 3건 이상만 후보)
    const bestByRate = list
      .filter(r => r.total >= 3 && r.won > 0)
      .reduce((best: Row | null, r) => (!best || r.rate > best.rate ? r : best), null);
    const totalLeadsAll = list.reduce((a, b) => a + b.total, 0);
    return { list, bestByRate, total: totalLeadsAll };
  }, [inRange]);

  // ─── 이탈 사유 집계 (#30 데이터 활용) ───
  const lossReasonBreakdown = useMemo(() => {
    const counts: Record<LossReason, number> = { price: 0, inventory: 0, timing: 0, changed_mind: 0, other: 0 };
    let untagged = 0;
    for (const c of lostLeads) {
      if (c.lossReason && counts[c.lossReason] !== undefined) counts[c.lossReason]++;
      else untagged++;
    }
    const sorted = (Object.keys(counts) as LossReason[])
      .map(k => ({ key: k, label: LOSS_REASON_LABELS[k], count: counts[k] }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count);
    return { items: sorted, untagged, total: lostLeads.length };
  }, [lostLeads]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-wishes-secondary/90 to-wishes-primary">
        <div className="flex items-center gap-2 text-white">
          <Target className="w-5 h-5" />
          <h3 className="font-bold text-base">리드 전환율</h3>
          <span className="ml-2 text-xs text-white/80">단계별 퍼널 분석</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 범위 토글 */}
          <div className="flex bg-white/15 rounded-lg p-0.5">
            {(['7d', '30d'] as RangeKey[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  range === r ? 'bg-white text-wishes-primary' : 'text-white/80 hover:text-white'
                }`}
              >
                {r === '7d' ? '최근 7일' : '최근 30일'}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 text-white/80 hover:text-white text-xs font-medium transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-50 text-xs text-red-700 border border-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="py-14 text-center text-sm text-gray-400">불러오는 중…</div>
      ) : totalLeads === 0 ? (
        <div className="py-14 text-center">
          <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-wishes-primary">해당 기간 리드가 없습니다</p>
          <p className="text-xs text-gray-500 mt-1">최근 {rangeDays}일 이내 신규 상담 건이 누적되면 표시됩니다</p>
        </div>
      ) : (
        <div className="p-5">
          {/* 상단 요약 KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <SummaryCard label="총 리드" value={totalLeads} suffix="건" color="text-wishes-primary" />
            <SummaryCard label="계약 성사" value={reached.closed_won} suffix="건" color="text-emerald-600" />
            <SummaryCard label="최종 전환율" value={overallRate} suffix="%" color="text-wishes-secondary" />
            <SummaryCard label="이탈률" value={lostRate} suffix="%" color="text-gray-500" subtle />
          </div>

          {/* 단계별 퍼널 */}
          <div className="space-y-2">
            {STAGES.map((stage, idx) => {
              const count = reached[stage];
              const meta = STAGE_META[stage];
              const baseMax = reached.new || 1;
              const pct = Math.round((count / baseMax) * 100);
              const isLast = idx === STAGES.length - 1;
              const nextRate = idx < stepRates.length ? stepRates[idx].rate : null;

              return (
                <div key={stage}>
                  <div className="flex items-center gap-3">
                    <div className="w-24 shrink-0 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                      <span>{meta.emoji}</span>
                      <span>{meta.label}</span>
                    </div>
                    <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                      <div
                        className={`h-full flex items-center justify-end pr-2 text-[11px] font-bold text-white transition-all ${
                          stage === 'closed_won' ? 'bg-emerald-500'
                          : stage === 'contract' ? 'bg-purple-500'
                          : stage === 'visit_booked' ? 'bg-blue-500'
                          : stage === 'contacted' ? 'bg-amber-500'
                          : 'bg-wishes-primary'
                        }`}
                        style={{ width: `${pct}%`, minWidth: count > 0 ? '24px' : '0' }}
                      >
                        {count > 0 && count}
                      </div>
                      {/* 기준선 라벨 (바가 너무 짧을 때 외부 표기) */}
                      {pct < 8 && count > 0 && (
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-700">{count}</span>
                      )}
                    </div>
                    <div className="w-12 shrink-0 text-right text-xs font-semibold text-gray-500 tabular-nums">
                      {pct}%
                    </div>
                  </div>
                  {/* 단계 간 전환율 */}
                  {!isLast && nextRate !== null && (
                    <div className="flex items-center gap-2 pl-24 pr-14 my-1 text-[10px] text-gray-500">
                      <ArrowRight className="w-3 h-3 text-gray-400" />
                      <span>
                        다음 단계 전환률{' '}
                        <strong className={`${nextRate >= 50 ? 'text-emerald-600' : nextRate >= 25 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {nextRate}%
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 인사이트 한 줄 */}
          <div className="mt-5 pt-4 border-t border-gray-100 flex items-start gap-2 text-xs text-gray-600">
            <TrendingUp className="w-4 h-4 text-wishes-primary mt-0.5 shrink-0" />
            <p>
              {(() => {
                const weakest = stepRates.reduce((min, s) => s.rate < min.rate ? s : min, stepRates[0] || { from: 'new' as PipelineStatus, to: 'contacted' as PipelineStatus, rate: 0 });
                if (totalLeads < 3) return '리드 수가 적어 의미 있는 추세를 산출하기 어렵습니다. 리드가 누적되면 병목 구간을 자동 감지합니다.';
                return (
                  <>
                    <strong className="text-wishes-primary">{STAGE_META[weakest.from].label} → {STAGE_META[weakest.to].label}</strong>
                    {' '}구간의 전환률이{' '}
                    <strong className={weakest.rate < 25 ? 'text-wishes-secondary' : 'text-amber-600'}>{weakest.rate}%</strong>
                    {'로 가장 낮습니다. 이 구간의 리드에게 우선 연락해 보세요.'}
                  </>
                );
              })()}
            </p>
          </div>

          {/* ─── 최근 4주 주간 전환률 스파크라인 (#31) ─── */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <WeeklySparkline weeks={weekly} />
          </div>

          {/* ─── 리드 소스 분석 (#37) ─── */}
          {sourceBreakdown.total > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <LeadSourceBreakdown
                items={sourceBreakdown.list}
                best={sourceBreakdown.bestByRate}
                total={sourceBreakdown.total}
                rangeDays={rangeDays}
              />
            </div>
          )}

          {/* ─── 이탈 사유 분포 (#30 연계) ─── */}
          {lossReasonBreakdown.total > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <LossReasonBreakdown
                items={lossReasonBreakdown.items}
                untagged={lossReasonBreakdown.untagged}
                total={lossReasonBreakdown.total}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ━━━ 최근 4주 주간 전환률 스파크라인 ━━━
function WeeklySparkline({ weeks }: { weeks: { label: string; total: number; won: number; rate: number }[] }) {
  const width = 280;
  const height = 60;
  const padding = 10;
  const hasAnyData = weeks.some(w => w.total > 0);
  const maxRate = Math.max(...weeks.map(w => w.rate), 20);
  const stepX = (width - padding * 2) / Math.max(weeks.length - 1, 1);

  const points = weeks.map((w, i) => {
    const x = padding + i * stepX;
    const y = padding + (height - padding * 2) * (1 - w.rate / maxRate);
    return { x, y, ...w };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${points[0].x.toFixed(1)} ${height - padding} Z`;

  const last = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];
  const delta = last.rate - prev.rate;
  const trendLabel = !hasAnyData
    ? '데이터 없음'
    : delta > 0
    ? `▲ ${delta}%p 상승`
    : delta < 0
    ? `▼ ${Math.abs(delta)}%p 하락`
    : '변동 없음';
  const trendColor = !hasAnyData
    ? 'text-gray-400'
    : delta > 0
    ? 'text-emerald-600'
    : delta < 0
    ? 'text-wishes-secondary'
    : 'text-gray-500';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-xs font-bold text-wishes-primary">최근 4주 전환률 추이</h4>
        <span className={`text-[11px] font-semibold ${trendColor}`}>{trendLabel}</span>
      </div>
      {hasAnyData ? (
        <div className="relative">
          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E63950" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#E63950" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaD} fill="url(#sparkGradient)" />
            <path d={pathD} stroke="#E63950" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2.5} fill="#E63950" stroke="white" strokeWidth={1.5} />
              </g>
            ))}
          </svg>
          <div className="flex justify-between mt-1 text-[10px] text-gray-500 tabular-nums">
            {weeks.map((w, i) => (
              <div key={i} className="text-center">
                <div>{w.label}</div>
                <div className={`font-semibold ${i === weeks.length - 1 ? 'text-wishes-secondary' : 'text-gray-400'}`}>
                  {w.rate}%
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 py-4 text-center">최근 4주 리드 데이터가 없습니다.</p>
      )}
    </div>
  );
}

// ━━━ 이탈 사유 분포 바 ━━━
function LossReasonBreakdown({ items, untagged, total }: {
  items: { key: string; label: string; count: number }[];
  untagged: number;
  total: number;
}) {
  const topReason = items[0];
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-xs font-bold text-wishes-primary">이탈 사유 분포</h4>
        <span className="text-[11px] text-gray-500">총 {total}건{untagged > 0 ? ` · 미분류 ${untagged}건` : ''}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-gray-400 py-2">이탈 리드의 사유가 아직 태깅되지 않았습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map(it => {
            const pct = Math.round((it.count / total) * 100);
            return (
              <div key={it.key} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-[11px] text-gray-600">{it.label}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${it.key === topReason?.key ? 'bg-wishes-secondary' : 'bg-gray-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[11px] font-semibold text-gray-700 tabular-nums">
                  {it.count}건 · {pct}%
                </span>
              </div>
            );
          })}
          {topReason && (
            <p className="text-[11px] text-gray-500 mt-2">
              가장 많은 이탈 사유는 <strong className="text-wishes-secondary">{topReason.label}</strong>입니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ━━━ 리드 소스 분석 (#37) ━━━
//   inRange contacts의 유입 경로(source)별 리드 수 + 전환률(closed_won/total) 표시.
//   "최고 전환률" 소스를 하이라이트해 어느 채널의 리드 품질이 가장 좋은지 즉시 파악.
function LeadSourceBreakdown({
  items,
  best,
  total,
  rangeDays,
}: {
  items: { key: string; label: string; emoji: string; total: number; won: number; active: number; rate: number }[];
  best: { key: string; label: string; rate: number; total: number; won: number } | null;
  total: number;
  rangeDays: number;
}) {
  const maxTotal = Math.max(...items.map(i => i.total), 1);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-xs font-bold text-wishes-primary">리드 유입 경로 분석</h4>
        <span className="text-[11px] text-gray-500">최근 {rangeDays}일 · 총 {total}건</span>
      </div>
      <div className="space-y-1.5">
        {items.map(it => {
          const widthPct = Math.round((it.total / maxTotal) * 100);
          const isBest = best?.key === it.key;
          return (
            <div key={it.key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 flex items-center gap-1 text-[11px] font-semibold text-gray-700">
                <span>{it.emoji}</span>
                <span className="truncate">{it.label}</span>
              </span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${isBest ? 'bg-emerald-500' : 'bg-wishes-primary/70'}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-[11px] font-semibold text-gray-700 tabular-nums">
                {it.total}건
                <span className={`ml-1 ${it.rate >= 30 ? 'text-emerald-600' : it.rate >= 10 ? 'text-amber-600' : 'text-gray-400'}`}>
                  · {it.rate}%
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {best ? (
        <p className="mt-2.5 text-[11px] text-gray-600 leading-relaxed">
          💡 가장 높은 전환률은{' '}
          <strong className="text-emerald-600">{best.label}</strong>({best.rate}%, {best.won}/{best.total})입니다.
          해당 경로에 CTA 노출을 늘리는 것을 추천합니다.
        </p>
      ) : (
        <p className="mt-2.5 text-[11px] text-gray-500">
          각 경로에서 최소 3건 이상의 리드와 계약 성사가 쌓이면 최고 전환률 추천이 활성화됩니다.
        </p>
      )}
    </div>
  );
}

// ━━━ 상단 요약 KPI 카드 ━━━
function SummaryCard({ label, value, suffix, color, subtle }: {
  label: string;
  value: number;
  suffix: string;
  color: string;
  subtle?: boolean;
}) {
  return (
    <div className={`px-3 py-3 rounded-xl border ${subtle ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
      <p className="text-[10px] font-semibold text-gray-500 tracking-wide uppercase">{label}</p>
      <p className={`text-xl font-extrabold mt-1 tabular-nums ${color}`}>
        {value.toLocaleString()}<span className="text-xs font-medium text-gray-400 ml-0.5">{suffix}</span>
      </p>
    </div>
  );
}
