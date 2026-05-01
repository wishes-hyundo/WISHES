/**
 * /admin/violations — PR-R-1-Admin
 *
 * data.go.kr 자동 감지된 위반건축물 매물 검토 페이지.
 * 사장님 손 0번 — 자동 감지 + 한 번에 검토.
 *
 * 헌법 §"사용자 UI 부정적 표시 X":
 *   이 페이지는 admin 만, 사용자 UI 영향 0.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ViolationListing {
  id: number;
  address: string | null;
  building_name: string | null;
  building_purpose: string | null;
  type_normalized: string | null;
  status: string | null;
  approval_date: string | null;
  area_m2: number | null;
  violation_reason: string | null;
  building_register_fetched_at: string | null;
  building_register_source: string | null;
}

interface Stats {
  total_checked: number;
  total_violations: number;
  pending_fetch: number;
  violation_ratio: number;
}

export default function ViolationsPage() {
  const [listings, setListings] = useState<ViolationListing[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/violations?limit=200', {
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
    return () => {
      cancel = true;
    };
  }, []);

  const wrap: React.CSSProperties = {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '32px 24px',
    fontFamily: 'Pretendard, system-ui, sans-serif',
  };

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '20px 22px',
  };

  const statCard: React.CSSProperties = {
    ...card,
    flex: 1,
    minWidth: 160,
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        ⚠️ 위반건축물 검토
      </h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
        data.go.kr 건축물대장 자동 감지 — 사장님 검토용 (사용자 UI 영향 0)
      </p>

      {/* 통계 카드 */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <div style={statCard}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>총 검사 완료</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>
              {stats.total_checked.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>매물</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>위반건축물 감지</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>
              {stats.total_violations.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              ({stats.violation_ratio}%)
            </div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>검사 대기</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>
              {stats.pending_fetch.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>매물 (cron 자동 처리)</div>
          </div>
        </div>
      )}

      {/* 위반건축물 목록 */}
      <div style={card}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          위반건축물 매물 ({listings.length})
        </h2>

        {loading && <p style={{ color: '#6b7280' }}>불러오는 중...</p>}
        {error && (
          <div style={{ color: '#dc2626', padding: 12, background: '#fef2f2', borderRadius: 8 }}>
            오류: {error}
          </div>
        )}

        {!loading && !error && listings.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
            아직 위반건축물 감지된 매물 없음.
            <br />
            <span style={{ fontSize: 12 }}>
              매일 새벽 cron 이 자동 검사 — 새 위반건축물 발견되면 여기 표시됩니다.
            </span>
          </div>
        )}

        {!loading && listings.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>ID</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>주소</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>건물명</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>유형</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>위반 사유</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>사용승인일</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>감지일</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>상태</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left' }}>매물 보기</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{l.id}</td>
                    <td style={{ padding: '10px 8px' }}>{l.address || '—'}</td>
                    <td style={{ padding: '10px 8px' }}>{l.building_name || '—'}</td>
                    <td style={{ padding: '10px 8px' }}>{l.type_normalized || '—'}</td>
                    <td style={{ padding: '10px 8px', color: '#dc2626', fontWeight: 600 }}>
                      {l.violation_reason || '위반건축물'}
                    </td>
                    <td style={{ padding: '10px 8px' }}>{l.approval_date || '—'}</td>
                    <td style={{ padding: '10px 8px', color: '#6b7280' }}>
                      {formatDate(l.building_register_fetched_at)}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          background: l.status === '공개' ? '#dcfce7' : '#f3f4f6',
                          color: l.status === '공개' ? '#15803d' : '#6b7280',
                        }}
                      >
                        {l.status || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <Link
                        href={`/map?listing=${l.id}`}
                        target="_blank"
                        rel="noopener"
                        style={{
                          color: '#2563eb',
                          textDecoration: 'underline',
                          fontSize: 13,
                        }}
                      >
                        지도 보기 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af' }}>
        🤖 자동 감지 — V-World / data.go.kr 건축물대장 vlNoticeYn=Y 필드 기반.
        <br />
        매일 새벽 backfill-building-info cron 이 미검사 매물 50건/2시간 처리.
        <br />
        헌법 §사용자 UI 부정적 표시 X — 사용자 매물 카드에는 위반건축물 표시 0.
      </p>
    </div>
  );
}
