'use client';
/* ============================================================
   교통정보 섹션 컴포넌트
   파일: src/components/admin/TransportInfo.tsx
   용도: 관리자 매물검색 모달 내 교통정보 표시
   API:  GET /api/listings/{id}/nearby
   ============================================================ */

import { useState, useEffect } from 'react';

interface NearbyStation {
  name: string;
  line: string;
  distance: number;
  type: 'subway' | 'bus';
}

interface TransportInfoProps {
  listingId: string;
  address?: string;
}

export default function TransportInfo({ listingId, address }: TransportInfoProps) {
  const [stations, setStations] = useState<NearbyStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listingId) return;

    // L-leak2: unmount/listingId 변경 시 in-flight fetch 취소.
    const ac = new AbortController();

    const fetchNearby = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('wishes_token') || '';
        const res = await fetch(`/api/listings/${listingId}/nearby`, {
          headers: { authorization: token },
          signal: ac.signal,
        });

        if (ac.signal.aborted) return;

        if (!res.ok) {
          throw new Error('교통정보를 불러올 수 없습니다.');
        }

        const data = await res.json();
        if (ac.signal.aborted) return;
        setStations(data.stations || data.nearby || []);
      } catch (err: any) {
        if (ac.signal.aborted || err?.name === 'AbortError') return;
        setError(err.message || '교통정보 로드 실패');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      
      }
    };

    fetchNearby();
    return () => ac.abort();
  }, [listingId]);

  // 호선별 색상 매핑
  const lineColor: Record<string, string> = {
    '1호선': '#0052A4', '2호선': '#00A84D', '3호선': '#EF7C1C',
    '4호선': '#00A5DE', '5호선': '#996CAC', '6호선': '#CD7C2F',
    '7호선': '#747F00', '8호선': '#E6186C', '9호선': '#BDB092',
    '신분당선': '#D31145', '경의중앙선': '#77C4A3', '수인분당선': '#FABE00',
    '공항철도': '#0090D2', 'GTX-A': '#9A6292',
  };

  const getLineStyle = (line: string) => {
    const color = Object.entries(lineColor).find(([key]) => line.includes(key));
    return color
      ? { background: color[1] + '20', color: color[1], borderColor: color[1] }
      : { background: '#dbeafe', color: '#1e40af' };
  };

  return (
    <div className="ws-detail-section">
      <h3>🚇 교통정보</h3>

      {loading ? (
        <div className="ws-loading-spinner">교통정보 로딩 중...</div>
      ) : error ? (
        <div style={{
          padding: '16px', background: '#fef2f2', borderRadius: '8px',
          color: '#dc2626', fontSize: '13px', textAlign: 'center'
        }}>
          ⚠️ {error}
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              fetch(`/api/listings/${listingId}/nearby`, {
                headers: { authorization: localStorage.getItem('wishes_token') || '' }
              })
                .then(r => r.json())
                .then(d => setStations(d.stations || d.nearby || []))
                .catch(() => setError('재시도 실패'))
                .finally(() => setLoading(false));
            }}
            style={{
              marginLeft: '10px', padding: '4px 12px', background: '#dc2626',
              color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            재시도
          </button>
        </div>
      ) : stations.length === 0 ? (
        <div className="ws-price-no-data">
          주변 교통정보가 없습니다.
        </div>
      ) : (
        <div className="ws-transport-section">
          {/* 지하철 */}
          {stations.filter(s => s.type === 'subway' || !s.type).map((station, idx) => (
            <div key={`subway-${idx}`} className="ws-transport-item">
              <span style={{ fontSize: '18px' }}>🚉</span>
              <span className="station-name">{station.name}</span>
              <span
                className="station-line"
                style={getLineStyle(station.line)}
              >
                {station.line}
              </span>
              <span className="station-distance">
                {station.distance < 1000
                  ? `도보 ${Math.round(station.distance / 80)}분 (${station.distance}m)`
                  : `${(station.distance / 1000).toFixed(1)}km`
                }
              </span>
            </div>
          ))}

          {/* 버스 */}
          {stations.filter(s => s.type === 'bus').map((station, idx) => (
            <div key={`bus-${idx}`} className="ws-transport-item" style={{ background: '#f0fff4' }}>
              <span style={{ fontSize: '18px' }}>🚌</span>
              <span className="station-name">{station.name}</span>
              <span className="station-line" style={{ background: '#dcfce7', color: '#15803d' }}>
                {station.line}
              </span>
              <span className="station-distance">
                {station.distance}m
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
