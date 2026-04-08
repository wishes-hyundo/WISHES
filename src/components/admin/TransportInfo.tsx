'use client';
/* ============================================================
   êµíµì ë³´ ì¹ì ì»´í¬ëí¸
   íì¼: src/components/admin/TransportInfo.tsx
   ì©ë: ê´ë¦¬ì ë§¤ë¬¼ê²ì ëª¨ë¬ ë´ êµíµì ë³´ íì
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

    const fetchNearby = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('wishes_token') || '';
        const res = await fetch(`/api/listings/${listingId}/nearby`, {
          headers: { authorization: token }
        });

        if (!res.ok) {
          throw new Error('êµíµì ë³´ë¥¼ ë¶ë¬ì¬ ì ììµëë¤.');
        }

        const data = await res.json();
        setStations(data.stations || data.nearby || []);
      } catch (err: any) {
        setError(err.message || 'êµíµì ë³´ ë¡ë ì¤í¨');
      } finally {
        setLoading(false);
      }
    };

    fetchNearby();
  }, [listingId]);

  // í¸ì ë³ ìì ë§¤í
  const lineColor: Record<string, string> = {
    '1í¸ì ': '#0052A4', '2í¸ì ': '#00A84D', '3í¸ì ': '#EF7C1C',
    '4í¸ì ': '#00A5DE', '5í¸ì ': '#996CAC', '6í¸ì ': '#CD7C2F',
    '7í¸ì ': '#747F00', '8í¸ì ': '#E6186C', '9í¸ì ': '#BDB092',
    'ì ë¶ë¹ì ': '#D31145', 'ê²½ìì¤ìì ': '#77C4A3', 'ìì¸ë¶ë¹ì ': '#FABE00',
    'ê³µí­ì² ë': '#0090D2', 'GTX-A': '#9A6292',
  };

  const getLineStyle = (line: string) => {
    const color = Object.entries(lineColor).find(([key]) => line.includes(key));
    return color
      ? { background: color[1] + '20', color: color[1], borderColor: color[1] }
      : { background: '#dbeafe', color: '#1e40af' };
  };

  return (
    <div className="ws-detail-section">
      <h3>ð êµíµì ë³´</h3>

      {loading ? (
        <div className="ws-loading-spinner">êµíµì ë³´ ë¡ë© ì¤...</div>
      ) : error ? (
        <div style={{
          padding: '16px', background: '#fef2f2', borderRadius: '8px',
          color: '#dc2626', fontSize: '13px', textAlign: 'center'
        }}>
          â ï¸ {error}
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              fetch(`/api/listings/${listingId}/nearby`, {
                headers: { authorization: localStorage.getItem('wishes_token') || '' }
              })
                .then(r => r.json())
                .then(d => setStations(d.stations || d.nearby || []))
                .catch(() => setError('ì¬ìë ì¤í¨'))
                .finally(() => setLoading(false));
            }}
            style={{
              marginLeft: '10px', padding: '4px 12px', background: '#dc2626',
              color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            ì¬ìë
          </button>
        </div>
      ) : stations.length === 0 ? (
        <div className="ws-price-no-data">
          ì£¼ë³ êµíµì ë³´ê° ììµëë¤.
        </div>
      ) : (
        <div className="ws-transport-section">
          {/* ì§íì²  */}
          {stations.filter(s => s.type === 'subway' || !s.type).map((station, idx) => (
            <div key={`subway-${idx}`} className="ws-transport-item">
              <span style={{ fontSize: '18px' }}>ð</span>
              <span className="station-name">{station.name}</span>
              <span
                className="station-line"
                style={getLineStyle(station.line)}
              >
                {station.line}
              </span>
              <span className="station-distance">
                {station.distance < 1000
                  ? `ëë³´ ${Math.round(station.distance / 80)}ë¶ (${station.distance}m)`
                  : `${(station.distance / 1000).toFixed(1)}km`
                }
              </span>
            </div>
          ))}

          {/* ë²ì¤ */}
          {stations.filter(s => s.type === 'bus').map((station, idx) => (
            <div key={`bus-${idx}`} className="ws-transport-item" style={{ background: '#f0fff4' }}>
              <span style={{ fontSize: '18px' }}>ð</span>
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
