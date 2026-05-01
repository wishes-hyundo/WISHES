'use client';

/**
 * /admin/enrichment-progress — PR-R-Monitor
 * 12K 매물 자동 보강 진행 대시보드 (admin 만).
 * 헌법 §"자동화 우선" — 사장님 결과 한눈에, 클릭 0.
 */

import { useEffect, useState } from 'react';

interface EnrichmentRow {
  filled: number;
  ratio: number;
  violations?: number;
  source: string;
  cron: string;
}
interface Progress {
  total_public: number;
  enrichments: {
    building_register: EnrichmentRow;
    land_price: EnrichmentRow;
    house_price: EnrichmentRow;
    school: EnrichmentRow;
    subway: EnrichmentRow;
  };
}

const labels: Record<keyof Progress['enrichments'], { name: string; emoji: string }> = {
  building_register: { name: '건축물대장', emoji: '🏢' },
  land_price: { name: '공시지가', emoji: '💰' },
  house_price: { name: '개별주택가격', emoji: '🏠' },
  school: { name: '학교 거리', emoji: '🎓' },
  subway: { name: '지하철 거리', emoji: '🚇' },
};

function ProgressBar({ ratio }: { ratio: number }) {
  return (
    <div style={{ width: '100%', height: 12, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.min(ratio, 100)}%`,
          height: '100%',
          background: ratio >= 90 ? '#15803d' : ratio >= 50 ? '#2563eb' : '#f59e0b',
          transition: 'width 0.3s',
        }}
      />
    </div>
  );
}

export default function EnrichmentProgressPage() {
  const [data, setData] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/enrichment-progress', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!cancel) {
          setData(j);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancel) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => { cancel = true; };
  }, []);

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: 'Pretendard, system-ui, sans-serif' };
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 22px', marginBottom: 16 };

  if (loading) return <div style={wrap}><p style={{ color: '#6b7280' }}>불러오는 중...</p></div>;
  if (error) return <div style={wrap}><div style={{ color: '#dc2626' }}>오류: {error}</div></div>;
  if (!data) return null;

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>📊 자동 보강 진행 현황</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
        12K 매물 자동 보강 — cron 자동 처리 (사장님 손 0번).
      </p>

      <div style={{ ...card, background: '#eff6ff', borderColor: '#bfdbfe' }}>
        <div style={{ fontSize: 14, color: '#6b7280' }}>전체 공개 매물</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: '#1e40af' }}>
          {data.total_public.toLocaleString()}
        </div>
      </div>

      {(Object.keys(labels) as Array<keyof Progress['enrichments']>).map((key) => {
        const e = data.enrichments[key];
        const l = labels[key];
        return (
          <div key={key} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {l.emoji} {l.name}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: e.ratio >= 90 ? '#15803d' : e.ratio >= 50 ? '#2563eb' : '#f59e0b' }}>
                {e.ratio}%
              </div>
            </div>
            <ProgressBar ratio={e.ratio} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: '#6b7280' }}>
              <span>
                {e.filled.toLocaleString()} / {data.total_public.toLocaleString()} 매물
                {e.violations !== undefined && e.violations > 0 && (
                  <span style={{ marginLeft: 12, color: '#dc2626', fontWeight: 600 }}>
                    위반건축물 {e.violations}건
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {e.source} · {e.cron}
              </span>
            </div>
          </div>
        );
      })}

      <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
        🤖 cron 자동 처리 — data.go.kr / V-World / Kakao Local (모두 무료, 비용 0원).
        <br />
        한도 6% 사용 (data.go.kr 일 10K 한도, 여유 9.4K).
      </p>
    </div>
  );
}
