/**
 * /admin/automation-status — 사장님 read-only 자동화 dashboard (강화)
 * SVG 차트 + cron 헬스 + 월별 추세 + 매물 변경 이력
 * 1분마다 자동 갱신, 의존성 0
 */

import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const revalidate = 60;
export const dynamic = 'force-dynamic';

interface CronHealthData {
  expected?: number;
  actively_running?: number;
  total_runs_24h?: number;
  last_runs?: Record<string, { runs: number; last: string }>;
}

interface TrendRow {
  month: string;
  created: number;
  updated: number;
  changes: number;
  avg_trust: number | null;
}

function MonthlyChart({ data }: { data: TrendRow[] }) {
  const W = 600, H = 200, P = 40;
  const max = Math.max(1, ...data.map(d => Math.max(d.created, d.updated, d.changes)));
  const xStep = (W - 2 * P) / Math.max(1, data.length - 1);
  const ySpan = H - 2 * P;
  const path = (key: keyof TrendRow, color: string) => {
    const points = data.map((d, i) => {
      const v = (d[key] as number) || 0;
      const x = P + i * xStep;
      const y = H - P - (v / max) * ySpan;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return <polyline points={points} fill="none" stroke={color} strokeWidth={2} />;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
      {/* 격자 */}
      {[0, 0.25, 0.5, 0.75, 1].map(r => (
        <line key={r} x1={P} y1={H - P - r * ySpan} x2={W - P} y2={H - P - r * ySpan} stroke="#f0f0f0" />
      ))}
      {/* 라인 */}
      {path('created', '#2D5A27')}
      {path('updated', '#7c3aed')}
      {path('changes', '#d97706')}
      {/* 월 라벨 */}
      {data.map((d, i) => (
        <text key={d.month} x={P + i * xStep} y={H - 15} fontSize="11" fill="#666" textAnchor="middle">{d.month.slice(5)}</text>
      ))}
      {/* 범례 */}
      <g transform={`translate(${P}, 16)`}>
        <circle cx={4} cy={4} r={4} fill="#2D5A27" /><text x={14} y={8} fontSize="11" fill="#222">생성</text>
        <circle cx={70} cy={4} r={4} fill="#7c3aed" /><text x={80} y={8} fontSize="11" fill="#222">수정</text>
        <circle cx={140} cy={4} r={4} fill="#d97706" /><text x={150} y={8} fontSize="11" fill="#222">변경 이력</text>
      </g>
    </svg>
  );
}

function TrustGauge({ avg, high, low, total }: { avg: number; high: number; low: number; total: number }) {
  const W = 400, H = 60;
  const highPct = total > 0 ? high / total : 0;
  const lowPct = total > 0 ? low / total : 0;
  const midPct = 1 - highPct - lowPct;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 400, height: 60 }}>
      <rect x={0} y={20} width={W * lowPct} height={20} fill="#d97706" />
      <rect x={W * lowPct} y={20} width={W * midPct} height={20} fill="#9ca3af" />
      <rect x={W * (lowPct + midPct)} y={20} width={W * highPct} height={20} fill="#16a34a" />
      <text x={4} y={14} fontSize="10" fill="#666">개선 {low}</text>
      <text x={W - 4} y={14} fontSize="10" fill="#666" textAnchor="end">우수 {high}</text>
      <text x={W / 2} y={56} fontSize="12" fill="#222" textAnchor="middle" fontWeight="700">평균 {avg}/100</text>
    </svg>
  );
}

export default async function AutomationStatus() {
  const supabase = createServerClient();

  // L-fix-stability (2026-04-28): Promise.all 일부 실패 시 dashboard crash 방지
  //   각 RPC try/catch wrap → 일부 실패해도 dashboard 정상 렌더 (사장님 매일 봄)
  const safeRpc = async (name: string, params?: any) => {
    try {
      return params ? await supabase.rpc(name, params) : await supabase.rpc(name);
    } catch (e) { console.warn('[automation-status] rpc fail:', name, e); return { data: null, error: e }; }
  };
  const safeFrom = async () => {
    try {
      return await supabase.from('listings').select('status, trust_score, fingerprint, ai_generated_fields');
    } catch (e) { console.warn('[automation-status] listings fail:', e); return { data: null, error: e }; }
  };
  const [enrich, integrity, aiCost, aiHallucination, cronHealth, trend, listingStats] = await Promise.all([
    safeRpc('korean_data_enrich_audit'),
    safeRpc('data_integrity_audit'),
    safeRpc('ai_cost_estimate_monthly'),
    safeRpc('ai_hallucination_detect'),
    safeRpc('cron_health_check'),
    safeRpc('listings_monthly_trend', { p_months: 6 }),
    safeFrom(),
  ]);

  type ListingMini = { status: string | null; trust_score: number | null; fingerprint: string | null; ai_generated_fields: string[] | null };
  const stats = (listingStats.data || []) as ListingMini[];
  const total = stats.length;
  const published = stats.filter((l) => l.status === '공개').length;
  const fingerprinted = stats.filter((l) => l.fingerprint != null).length;
  const aiTagged = stats.filter((l) => (l.ai_generated_fields?.length ?? 0) > 0).length;
  const trustScores = stats.filter((l) => l.trust_score != null).map((l) => l.trust_score as number);
  const avgTrust = trustScores.length > 0 ? Math.round(trustScores.reduce((s, n) => s + n, 0) / trustScores.length) : 0;
  const trustHigh = trustScores.filter((n) => n >= 80).length;
  const trustLow = trustScores.filter((n) => n < 40).length;

  const health = cronHealth.data as CronHealthData | null;
  const trendData = (trend.data as TrendRow[] | null) || [];

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'GmarketSans, Pretendard, -apple-system, sans-serif' }}>
      <header style={{ background: 'linear-gradient(135deg, #2D5A27 0%, #1a3d18 100%)', color: '#fff', padding: '20px 32px' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>🤖 위시스 자동화 현황</h1>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
          사장님 read-only · 1분마다 자동 갱신 · {new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST
        </div>
      </header>

      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200, margin: '0 auto' }}>
        {/* 핵심 KPI */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>핵심 지표</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              ['전체 매물', total.toLocaleString(), '#374151'],
              ['공개', published.toLocaleString(), '#16a34a'],
              ['fingerprint', `${Math.round(100 * fingerprinted / Math.max(total, 1))}%`, '#2D5A27'],
              ['AI 라벨', aiTagged.toLocaleString(), '#7c3aed'],
            ].map(([label, val, color]) => (
              <div key={String(label)} style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: String(color) }}>{val}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 신뢰도 게이지 */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>매물 신뢰도 분포</h2>
          <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
            <TrustGauge avg={avgTrust} high={trustHigh} low={trustLow} total={trustScores.length} />
          </div>
        </section>

        {/* 월별 추세 차트 */}
        {trendData.length > 0 && (
          <section>
            <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>매물 월별 추세 (최근 6개월)</h2>
            <MonthlyChart data={trendData} />
          </section>
        )}

        {/* cron 헬스 */}
        {health && (
          <section>
            <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>cron 가동 상태 (24시간)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
              <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 12, color: '#666' }}>등록 cron</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{health.expected ?? 0}</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #16a34a' }}>
                <div style={{ fontSize: 12, color: '#666' }}>실행 중</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{health.actively_running ?? 0}</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #2D5A27' }}>
                <div style={{ fontSize: 12, color: '#666' }}>총 실행 (24h)</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#2D5A27' }}>{(health.total_runs_24h ?? 0).toLocaleString()}건</div>
              </div>
            </div>
          </section>
        )}

        {/* 데이터 무결성 */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>데이터 무결성</h2>
          <pre style={{ background: '#fff', padding: 16, borderRadius: 8, fontSize: 11, overflow: 'auto', border: '1px solid #e5e7eb', maxHeight: 200 }}>
            {JSON.stringify(integrity.data, null, 2)}
          </pre>
        </section>

        {/* 한국 17 데이터 enrich */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>한국 17 데이터 enrich</h2>
          <pre style={{ background: '#fff', padding: 16, borderRadius: 8, fontSize: 11, overflow: 'auto', border: '1px solid #e5e7eb', maxHeight: 200 }}>
            {JSON.stringify(enrich.data, null, 2)}
          </pre>
        </section>

        {/* AI 비용 + 환각 */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 8, color: '#2D5A27' }}>AI 비용 (이번 달)</h3>
            <pre style={{ background: '#fff', padding: 12, borderRadius: 8, fontSize: 10, overflow: 'auto', border: '1px solid #e5e7eb', maxHeight: 200 }}>
              {JSON.stringify(aiCost.data, null, 2)}
            </pre>
          </div>
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 8, color: '#2D5A27' }}>AI 환각 자동 감지</h3>
            <pre style={{ background: '#fff', padding: 12, borderRadius: 8, fontSize: 10, overflow: 'auto', border: '1px solid #e5e7eb', maxHeight: 200 }}>
              {JSON.stringify(aiHallucination.data, null, 2)}
            </pre>
          </div>
        </section>

        <div style={{ textAlign: 'center', padding: 16, color: '#666', fontSize: 12 }}>
          read-only · 사장님 클릭 0 · cron 16개 자동
        </div>
      </div>
    </div>
  );
}
