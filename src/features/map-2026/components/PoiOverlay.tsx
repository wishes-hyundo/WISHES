// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PoiOverlay — 학세권/인근 시설 (3단계, 사용자 요청)
//
// L-naver-2026poi1 (2026-04-27): Kakao Places categorySearch 활용.
//   카테고리: 학교(SC4) / 병원(HP8) / 지하철(SW8) / 은행(BK9) / 마트(MT1) / 편의점(CS2)
//   각 카테고리별 색상 아이콘 마커 (25px). viewport 변경 시 debounce 후 자동 refetch.
//   level <= 5 (가까운 줌)에서만 활성 — 광역에서는 마커 너무 많이 뿌려짐.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useRef } from 'react';
import { useMap2026Store } from '../store';

interface KakaoCustomOverlay { setMap: (m: unknown) => void }
interface KakaoMapsNs {
  CustomOverlay: new (opts: Record<string, unknown>) => KakaoCustomOverlay;
  LatLng: new (lat: number, lng: number) => unknown;
  services?: {
    Places: new () => {
      categorySearch: (
        code: string,
        cb: (data: Array<{ id: string; place_name: string; x: string; y: string; category_name?: string }>, status: string) => void,
        opts: { useMapBounds?: boolean; bounds?: unknown; size?: number; page?: number }
      ) => void;
    };
    Status?: { OK: string };
  };
}
interface KakaoMapLike {
  getLevel?: () => number;
  getBounds?: () => unknown;
}

const POI_CATEGORIES = {
  school:    { code: 'SC4', label: '학교',    color: '#2563eb', emoji: '🏫' },
  hospital:  { code: 'HP8', label: '병원',    color: '#dc2626', emoji: '🏥' },
  subway:    { code: 'SW8', label: '지하철',  color: '#10b981', emoji: '🚇' },
  bank:      { code: 'BK9', label: '은행',    color: '#7c3aed', emoji: '🏦' },
  mart:      { code: 'MT1', label: '마트',    color: '#ea580c', emoji: '🛒' },
  cvs:       { code: 'CS2', label: '편의점',  color: '#6b7280', emoji: '🏪' },
} as const;

export type PoiCategoryKey = keyof typeof POI_CATEGORIES;
export const POI_CATEGORY_LIST = Object.entries(POI_CATEGORIES).map(([k, v]) => ({ key: k as PoiCategoryKey, ...v }));

function makePoiMarker(label: string, color: string, emoji: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:4px',
    'padding:3px 8px 3px 5px',
    'background:rgba(255,255,255,0.95)',
    `border:1.5px solid ${color}`,
    'border-radius:999px',
    'font-size:10.5px',
    'font-weight:600',
    'color:#1a1a1a',
    'white-space:nowrap',
    'letter-spacing:-0.2px',
    'box-shadow:0 2px 6px rgba(0,0,0,0.15)',
    'pointer-events:none',
    'user-select:none',
    'max-width:140px',
    'overflow:hidden',
    'text-overflow:ellipsis',
  ].join(';');
  const dot = document.createElement('span');
  dot.style.cssText = 'font-size:11px;line-height:1';
  dot.textContent = emoji;
  el.appendChild(dot);
  const text = document.createElement('span');
  text.textContent = label.length > 12 ? label.slice(0, 11) + '…' : label;
  el.appendChild(text);
  return el;
}

interface Props {
  map: unknown;
}

export default function PoiOverlay({ map }: Props) {
  const overlaysRef = useRef<Record<PoiCategoryKey, KakaoCustomOverlay[]>>({
    school: [], hospital: [], subway: [], bank: [], mart: [], cvs: [],
  });
  const poi = useMap2026Store((s) => s.poi);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const kakao = (window as unknown as { kakao?: { maps?: KakaoMapsNs } }).kakao;
    if (!kakao?.maps?.services?.Places) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    const cleanupCategory = (key: PoiCategoryKey) => {
      for (const ov of overlaysRef.current[key]) {
        try { ov.setMap(null); } catch { /*noop*/ }
      }
      overlaysRef.current[key] = [];
    };
    const cleanupAll = () => {
      (Object.keys(overlaysRef.current) as PoiCategoryKey[]).forEach(cleanupCategory);
    };

    const fetchCategory = (key: PoiCategoryKey) => {
      cleanupCategory(key);
      if (!poi[key]) return;
      const level = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;
      // level >= 6 (광역) — 너무 많은 마커 → skip
      if (level > 5) return;
      const bounds = typeof mapInst.getBounds === 'function' ? mapInst.getBounds() : null;
      if (!bounds || !maps.services?.Places) return;
      const cat = POI_CATEGORIES[key];
      try {
        const ps = new maps.services.Places();
        ps.categorySearch(
          cat.code,
          (data, status) => {
            if (status !== (maps.services?.Status?.OK ?? 'OK')) return;
            for (const item of data) {
              const lat = parseFloat(item.y);
              const lng = parseFloat(item.x);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
              const el = makePoiMarker(item.place_name, cat.color, cat.emoji);
              try {
                const ov = new maps.CustomOverlay({
                  position: new maps.LatLng(lat, lng),
                  content: el,
                  xAnchor: 0.5,
                  yAnchor: 0.5,
                  zIndex: 6,
                  clickable: false,
                });
                ov.setMap(map);
                overlaysRef.current[key].push(ov);
              } catch { /* SDK race — skip */ }
            }
          },
          { useMapBounds: true, size: 15 }
        );
      } catch (e) {
        console.warn('[poi] category search fail', key, e);
      }
    };

    const refetchAll = () => {
      (Object.keys(POI_CATEGORIES) as PoiCategoryKey[]).forEach(fetchCategory);
    };

    // viewport idle 시 debounce refetch
    const onIdle = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        refetchAll();
      }, 350);
    };

    // 초기 fetch
    refetchAll();
    // map idle listener
    const evNs = maps as unknown as { event?: { addListener: (t: unknown, type: string, cb: () => void) => void; removeListener?: (t: unknown, type: string, cb: () => void) => void } };
    try { evNs.event?.addListener(mapInst as unknown, 'idle', onIdle); } catch { /*noop*/ }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try { evNs.event?.removeListener?.(mapInst as unknown, 'idle', onIdle); } catch { /*noop*/ }
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, poi.school, poi.hospital, poi.subway, poi.bank, poi.mart, poi.cvs]);

  return null;
}
