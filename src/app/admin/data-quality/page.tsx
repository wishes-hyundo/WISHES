/**
 * /admin/data-quality (Tier 6, 2026-04-28)
 *
 * 사장님 데이터 품질 한 눈에 파악 + 일괄 보정 트리거.
 * 자동화 우선 정책: cron 이 자동 처리하지만, 사장님이 진행 상황 시각화 필요.
 */
'use client';

// G-27 fix (2026-05-03): adminFetch + useAdminSession 으로 인증 토큰 자동 첨부.

import { useEffect, useState } from 'react';
import { useAdminSession } from '@/lib/useAdminSession';
import { adminFetch } from '@/lib/adminFetch';

interface QualityStats {
  total: number;
  area_same: number;        // area_m2 == area_supply_m2 (의심)
  supply_null: number;       // area_supply_m2 NULL
  area_zero: number;         // area_m2 == 0
  area_extracted: number;    // building_unit_extracted_at NOT NULL
  registry_cached: number;   // building_registry_cache 적재된 건물 수
}

export default function DataQualityPage() {
  const [stats, setStats] = useState<QualityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { token } = useAdminSession('/admin/data-quality');

  useEffect(() => {
    if (!token) return;
    let cancel = false;
    (async () => {
      try {
        const res = await adminFetch('/api/admin/data-quality-stats', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!cancel) {
          setStats(j.stats);
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
  }, [token]);

  const wrap: React.CSSProperties = {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '40px 24px',
    fontFamily: 'Pretendard, system-ui, sans-serif',
  };

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5eee5',
    borderRadius: 12,
    padding: '20px 22px',
  };

  if (loading) {
    return <div style={wrap}><div style={{ color: '#888' }}>로딩 중...</div></div>;
  }
  if (error) {
    return <div style={wrap}><div style={{ color: '#a04' }}>에러: {error}</div></div>;
  }
  if (!stats) return null;

  const suspectPct = stats.total ? Math.round((stats.area_same / stats.total) * 100) : 0;
  const supplyNullPct = stats.total ? Math.round((stats.supply_null / stats.total) * 100) : 0;
  const extractedPct = stats.total ? Math.round((stats.area_extracted / stats.total) * 100) : 0;

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#2D5A27', margin: '0 0 8px' }}>
        📊 데이터 품질 대시보드
      </h1>
      <p style={{ color: '#666', margin: '0 0 24px', fontSize: 14 }}>
        매물 면적 / 호실 / 건축물대장 정합성. 자동 보정 cron 이 12시간 간격으로 점진 정리.
      </p>

      {/* 핵심 지표 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={card}>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>전체 매물</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>{stats.total.toLocaleString()}</div>
        </div>
        <div style={{ ...card, borderColor: suspectPct > 50 ? '#f0c0a0' : '#e5eee5' }}>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>⚠️ 면적 의심 (전용=공급)</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: suspectPct > 50 ? '#a04' : '#2D5A27' }}>
            {stats.area_same.toLocaleString()}
            <span style={{ fontSize: 14, color: '#999', marginLeft: 6 }}>({suspectPct}%)</span>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>cron 점진 보정 중</div>
        </div>
        <div style={card}>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>공급면적 미입력</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>
            {stats.supply_null.toLocaleString()}
            <span style={{ fontSize: 14, color: '#999', marginLeft: 6 }}>({supplyNullPct}%)</span>
          </div>
        </div>
        <div style={card}>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>전용면적 0</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: stats.area_zero > 0 ? '#a04' : '#2D5A27' }}>
            {stats.area_zero.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 자동화 진행 */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2D5A27', margin: '32px 0 12px' }}>
        🤖 자동화 진행
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={card}>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>호실 추출 완료</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>
              {stats.area_extracted.toLocaleString()}
            </span>
            <span style={{ fontSize: 12, color: '#888' }}>/ {stats.total.toLocaleString()} ({extractedPct}%)</span>
          </div>
          <div style={{ marginTop: 8, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${extractedPct}%`, background: '#2D5A27' }} />
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
            extract-building-units cron · 6h 간격 · Gemini 2.5 Flash
          </div>
        </div>
        <div style={card}>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>건축물대장 캐시</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>
            {stats.registry_cached.toLocaleString()} 건물
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
            building_registry_cache · 24h TTL · 같은 건물 매물 결과 공유
          </div>
        </div>
      </div>

      {/* 비용 */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2D5A27', margin: '32px 0 12px' }}>
        💰 비용 (월)
      </h2>
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, fontSize: 13 }}>
          <div>Gemini 2.5 Flash <strong style={{ color: '#2D5A27' }}>0원</strong></div>
          <div>data.go.kr <strong style={{ color: '#2D5A27' }}>0원</strong></div>
          <div>Supabase <strong style={{ color: '#888' }}>$25</strong> (이미)</div>
          <div>Vercel cron <strong style={{ color: '#2D5A27' }}>0원</strong></div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
          신규 추가 비용: <strong style={{ color: '#2D5A27' }}>0원</strong>
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#aaa', textAlign: 'right' }}>
        Tier 1 (DB constraint) + Tier 2 (auto-fix cron) 완료 · 다음: Tier 3 (Vision LLM) + Tier 4 (등록 UX)
      </div>
    </div>
  );
}
