/**
 * /admin/automation-status — 사장님 read-only 자동화 통계 dashboard
 * 사장님 명령: 검토 페이지 X, 결과만 보여주기.
 * Server Component — 클릭 0, 자동 새로고침 (revalidate 60초)
 */

import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const revalidate = 60;
export const dynamic = 'force-dynamic';

interface AuditRow {
  action: string;
  ts: string;
  meta: Record<string, unknown> | null;
}

export default async function AutomationStatus() {
  const supabase = createServerClient();

  // 자동 enrich 진행률
  const { data: enrich } = await supabase.rpc('korean_data_enrich_audit');
  const { data: integrity } = await supabase.rpc('data_integrity_audit');
  const { data: aiCost } = await supabase.rpc('ai_cost_estimate_monthly');
  const { data: aiHallucination } = await supabase.rpc('ai_hallucination_detect');

  // 최근 24시간 자동 처리
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: audits } = await supabase
    .from('admin_audit_log')
    .select('action, ts, meta')
    .gte('ts', since)
    .like('action', 'auto_%')
    .order('ts', { ascending: false })
    .limit(50);

  const auditsByAction = (audits || []).reduce<Record<string, number>>((acc, a) => {
    acc[a.action] = (acc[a.action] || 0) + 1;
    return acc;
  }, {});

  // 매물 통계
  const { data: listingStats } = await supabase
    .from('listings')
    .select('status, trust_score, fingerprint, ai_generated_fields');
  
  type ListingMini = { status: string | null; trust_score: number | null; fingerprint: string | null; ai_generated_fields: string[] | null };
  const stats = (listingStats || []) as ListingMini[];
  const total = stats.length;
  const published = stats.filter((l) => l.status === '공개').length;
  const fingerprinted = stats.filter((l) => l.fingerprint != null).length;
  const aiTagged = stats.filter((l) => (l.ai_generated_fields?.length ?? 0) > 0).length;
  const trustScores = stats.filter((l) => l.trust_score != null).map((l) => l.trust_score as number);
  const avgTrust = trustScores.length > 0 ? Math.round(trustScores.reduce((s, n) => s + n, 0) / trustScores.length) : 0;
  const trustHigh = trustScores.filter((n) => n >= 80).length;
  const trustLow = trustScores.filter((n) => n < 40).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'GmarketSans, Pretendard, -apple-system, sans-serif' }}>
      <header style={{ background: 'linear-gradient(135deg, #2D5A27 0%, #1a3d18 100%)', color: '#fff', padding: '20px 32px' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>🤖 위시스 자동화 현황</h1>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
          사장님 read-only · 1분마다 자동 갱신 · {new Date().toISOString().slice(0, 19).replace('T', ' ')} KST
        </div>
      </header>

      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
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

        {/* 신뢰도 분포 */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>매물 신뢰도</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#666' }}>평균</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{avgTrust}/100</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #16a34a' }}>
              <div style={{ fontSize: 12, color: '#666' }}>우수 (≥80)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{trustHigh.toLocaleString()}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #d97706' }}>
              <div style={{ fontSize: 12, color: '#666' }}>개선 필요 (&lt;40)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706' }}>{trustLow.toLocaleString()}</div>
            </div>
          </div>
        </section>

        {/* 데이터 무결성 */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>데이터 무결성 (자동 점검)</h2>
          <pre style={{ background: '#fff', padding: 16, borderRadius: 8, fontSize: 12, overflow: 'auto', border: '1px solid #e5e7eb' }}>
            {JSON.stringify(integrity, null, 2)}
          </pre>
        </section>

        {/* 한국 17 데이터 enrich */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>한국 17 데이터 enrich 진행률</h2>
          <pre style={{ background: '#fff', padding: 16, borderRadius: 8, fontSize: 12, overflow: 'auto', border: '1px solid #e5e7eb' }}>
            {JSON.stringify(enrich, null, 2)}
          </pre>
        </section>

        {/* 24시간 자동 처리 */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>최근 24시간 자동 처리</h2>
          <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
            {Object.entries(auditsByAction).length === 0 ? (
              <div style={{ color: '#999' }}>최근 24시간 자동 처리 없음</div>
            ) : (
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '1px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: 8 }}>액션</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>건수</th>
                </tr></thead>
                <tbody>
                  {Object.entries(auditsByAction).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([action, n]) => (
                    <tr key={action}><td style={{ padding: 8 }}>{action}</td><td style={{ textAlign: 'right', padding: 8 }}>{n}건</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* AI 비용 */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>AI 비용 (이번 달)</h2>
          <pre style={{ background: '#fff', padding: 16, borderRadius: 8, fontSize: 12, overflow: 'auto', border: '1px solid #e5e7eb' }}>
            {JSON.stringify(aiCost, null, 2)}
          </pre>
        </section>

        {/* AI 환각 감지 */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#2D5A27' }}>AI 환각 자동 감지</h2>
          <pre style={{ background: '#fff', padding: 16, borderRadius: 8, fontSize: 12, overflow: 'auto', border: '1px solid #e5e7eb' }}>
            {JSON.stringify(aiHallucination, null, 2)}
          </pre>
        </section>

        <div style={{ textAlign: 'center', padding: 16, color: '#666', fontSize: 12 }}>
          이 페이지는 <strong>read-only</strong> · 사장님 클릭 0 · 모든 자동화는 cron 으로 자동 진행
        </div>
      </div>
    </div>
  );
}
