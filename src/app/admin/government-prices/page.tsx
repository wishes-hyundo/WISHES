'use client';

/**
 * /admin/government-prices — PR-R-2-Admin
 * 공시지가 + 개별주택가격 자동 보강 결과 (admin 만, 사용자 UI 영향 0).
 * "AI 시세 추정 X" — 정부 공식 평가액만 표시 (참고용).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

// G-29 fix (2026-05-03): adminFetch + useAdminSession 으로 인증 토큰 자동 첨부.
// 직전 결함: fetch('/api/admin/government-prices', credentials:'include') → HTTP 401.
import { useAdminSession } from '@/lib/useAdminSession';
import { adminFetch } from '@/lib/adminFetch';

interface PriceRow {
  id: number;
  address: string | null;
  type_normalized: string | null;
  area_m2: number | null;
  land_price_per_m2: number | null;
  land_price_year: number | null;
  house_price_total: number | null;
  house_price_year: number | null;
  land_price_fetched_at: string | null;
  house_price_fetched_at: string | null;
}

interface Stats {
  land_price_filled: number;
  house_price_filled: number;
  land_price_pending: number;
}

const fmtKRW = (n: number | null) => (n != null ? n.toLocaleString() + '원' : '—');
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function GovernmentPricesPage() {
  const [listings, setListings] = useState<PriceRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { token } = useAdminSession('/admin/government-prices');

  useEffect(() => {
    if (!token) return;
    let cancel = false;
    (async () => {
      try {
        const res = await adminFetch('/api/admin/government-prices?limit=200', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!cancel) {
          setListings(j.listings || []);
          setStats(j.stats || null);
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

  const wrap: React.CSSProperties = { maxWidth: 1200, margin: '0 auto', padding: '32px 24px', fontFamily: 'Pretendard, system-ui, sans-serif' };
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 22px' };
  const stat: React.CSSProperties = { ...card, flex: 1, minWidth: 160 };

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>💰 정부 공시 가격 (참고용)</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
        data.go.kr 자동 보강 — 공시지가 / 개별주택가격. AI 시세 추정 X (정부 평가액만, admin 참고용).
      </p>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <div style={stat}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>공시지가 보강</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#15803d' }}>{stats.land_price_filled.toLocaleString()}</div>
          </div>
          <div style={stat}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>주택가격 보강</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#15803d' }}>{stats.house_price_filled.toLocaleString()}</div>
          </div>
          <div style={stat}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>대기 중</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>{stats.land_price_pending.toLocaleString()}</div>
          </div>
        </div>
      )}

      <div style={card}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>공시 가격 매물 ({listings.length})</h2>
        {loading && <p style={{ color: '#6b7280' }}>불러오는 중...</p>}
        {error && <div style={{ color: '#dc2626' }}>오류: {error}</div>}
        {!loading && !error && listings.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
            아직 보강된 매물 없음 (cron 자동 처리 중)
          </div>
        )}
        {!loading && listings.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>ID</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>주소</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>유형</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>면적</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>공시지가/㎡</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>주택가격</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>보강일</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>매물</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{l.id}</td>
                    <td style={{ padding: '10px 8px' }}>{l.address || '—'}</td>
                    <td style={{ padding: '10px 8px' }}>{l.type_normalized || '—'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{l.area_m2 ? `${l.area_m2}㎡` : '—'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      {fmtKRW(l.land_price_per_m2)}
                      {l.land_price_year && <div style={{ fontSize: 10, color: '#9ca3af' }}>({l.land_price_year})</div>}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      {fmtKRW(l.house_price_total)}
                      {l.house_price_year && <div style={{ fontSize: 10, color: '#9ca3af' }}>({l.house_price_year})</div>}
                    </td>
                    <td style={{ padding: '10px 8px', color: '#6b7280' }}>{fmtDate(l.land_price_fetched_at || l.house_price_fetched_at)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <Link href={`/map?listing=${l.id}`} target="_blank" rel="noopener" style={{ color: '#2563eb', textDecoration: 'underline', fontSize: 13 }}>지도 →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af' }}>
        🤖 자동 보강 — V-World 공시지가 + 개별주택가격. 매일 04:00 / 04:30 cron 100건 처리.
        <br />
        헌법 §AI 시세 추정 X — 정부 공식 평가액만, 시세 추정 X.
      </p>
    </div>
  );
}
