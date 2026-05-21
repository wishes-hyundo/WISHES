'use client';

/**
 * SearchRegionLayer — /search 행정구역 폴리곤 + 개수 (P5 줌 1~3단계)
 *
 * 줌 단계별 표기 시스템의 광역~동 단계.
 *   1단계 시·도  — /api/geo/sido    폴리곤 + 시·도별 개수
 *   2단계 시·군·구 — /api/geo/sigungu 폴리곤 + 구별 개수
 *   3단계 읍·면·동 — /api/geo/dong    폴리곤 + 동별 개수
 *
 * 설계:
 *   · map-2026 store 비의존 — /search 전용 자체완결.
 *   · 행정구역 GeoJSON 폴리곤 + 5분위 초플레스(개수 밀도) fill.
 *   · 개수는 /api/map/clusters(서버 사전집계) 를 point-in-polygon 으로 구역 배분.
 *   · 구역 centroid 에 개수 버블(CustomOverlay). 버블/폴리곤 클릭 = 줌인.
 *   · /map 의 AdminRegionOverlay 는 손대지 않음.
 */

import { useEffect, useRef } from 'react';

export type RegionTier = 'sido' | 'sigungu' | 'dong';

const GEO_URL: Record<RegionTier, string> = {
  sido: '/api/geo/sido',
  sigungu: '/api/geo/sigungu',
  dong: '/api/geo/dong',
};

interface GeoFeature {
  type: 'Feature';
  properties: { name?: string; name_eng?: string; code?: string; [k: string]: unknown };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}
interface GeoCollection { type: 'FeatureCollection'; features: GeoFeature[] }

// ── GeoJSON 캐시 (모듈 레벨) ─────────────────────────────────
const geoCache: Partial<Record<RegionTier, GeoCollection>> = {};
const geoPending: Partial<Record<RegionTier, Promise<GeoCollection | null>>> = {};
async function loadGeo(tier: RegionTier): Promise<GeoCollection | null> {
  if (geoCache[tier]) return geoCache[tier]!;
  if (geoPending[tier]) return geoPending[tier]!;
  const p = fetch(GEO_URL[tier])
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) geoCache[tier] = j as GeoCollection; return geoCache[tier] ?? null; })
    .catch(() => null)
    .finally(() => { delete geoPending[tier]; });
  geoPending[tier] = p;
  return p;
}

// ── 기하 유틸 ────────────────────────────────────────────────
function outerRings(f: GeoFeature): number[][][] {
  if (f.geometry.type === 'Polygon') return [f.geometry.coordinates[0]];
  return f.geometry.coordinates.map((poly) => poly[0]);
}
function inRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
function featureContains(rings: number[][][], lng: number, lat: number): boolean {
  return rings.some((r) => inRing(lng, lat, r));
}
// 라벨 위치 — 가장 큰 ring 의 bbox 중심
function labelPoint(rings: number[][][]): { lat: number; lng: number } {
  let best = rings[0], bestLen = 0;
  for (const r of rings) if (r.length > bestLen) { bestLen = r.length; best = r; }
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of best) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

// ── 5분위 초플레스 색상 (개수 밀도) ──────────────────────────
const CHORO = ['#e4efe1', '#c1dbaf', '#8dbf80', '#56985e', '#2d6e42'];
function quantileClass(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const idx = sorted.findIndex((v) => v >= value);
  const rank = idx < 0 ? sorted.length - 1 : idx;
  return Math.min(4, Math.floor((rank / sorted.length) * 5));
}

function fmtCount(n: number): string {
  if (n >= 10000) {
    const v = (n / 10000).toFixed(1);
    return (v.endsWith('.0') ? v.slice(0, -2) : v) + '만';
  }
  return n.toLocaleString('ko-KR');
}
function shortName(name: string): string {
  return name
    .replace('특별자치시', '').replace('특별자치도', '')
    .replace('특별시', '').replace('광역시', '')
    .replace('도', '');
}

// ── 스타일 (주입 1회) ────────────────────────────────────────
const STYLE_ID = 'wishes-search-region-style';
const STYLE_CSS = `
.srl-bubble{
  display:flex;flex-direction:column;align-items:center;
  padding:5px 12px;border-radius:13px;cursor:pointer;
  background:rgba(255,255,255,0.96);
  box-shadow:0 2px 7px rgba(16,40,24,0.20),0 0 0 0.5px rgba(16,40,24,0.06);
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard',sans-serif;
  transition:transform .16s cubic-bezier(.16,1,.3,1);
}
.srl-bubble:hover{transform:scale(1.06);}
.srl-rname{font-size:11px;font-weight:500;color:#5a6b60;letter-spacing:-0.01em;line-height:1.2;}
.srl-rcount{font-size:14px;font-weight:700;color:#235b34;letter-spacing:-0.02em;line-height:1.25;}
`;
function injectStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLE_CSS;
  document.head.appendChild(el);
}

// ── Kakao 타입 (최소) ────────────────────────────────────────
interface KakaoLatLng { /* opaque */ }
interface KakaoPolygon { setMap: (m: unknown) => void }
interface KakaoOverlay { setMap: (m: unknown) => void }
interface KakaoMapsNs {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Polygon: new (opts: Record<string, unknown>) => KakaoPolygon;
  CustomOverlay: new (opts: Record<string, unknown>) => KakaoOverlay;
}
interface KakaoMapLike {
  getLevel?: () => number;
  setLevel?: (n: number, opts?: Record<string, unknown>) => void;
  panTo?: (latlng: unknown) => void;
}

export interface SearchRegionLayerProps {
  map: unknown;
  tier: RegionTier;
  /** 이 레이어를 그릴지 — 줌 단계 게이팅 결과 */
  active: boolean;
}

export function SearchRegionLayer({ map, tier, active }: SearchRegionLayerProps) {
  const polysRef = useRef<KakaoPolygon[]>([]);
  const overlaysRef = useRef<KakaoOverlay[]>([]);

  useEffect(() => { injectStyle(); }, []);

  useEffect(() => {
    if (!map) return;
    const win = window as unknown as { kakao?: { maps?: KakaoMapsNs } };
    const maps = win.kakao?.maps;
    if (!maps) return;

    let disposed = false;

    const clearAll = () => {
      for (const p of polysRef.current) { try { p.setMap(null); } catch { /* noop */ } }
      for (const o of overlaysRef.current) { try { o.setMap(null); } catch { /* noop */ } }
      polysRef.current = [];
      overlaysRef.current = [];
    };

    if (!active) { clearAll(); return () => { disposed = true; }; }

    (async () => {
      const geo = await loadGeo(tier);
      if (disposed || !geo || !active) return;

      // 개수 — 전국 클러스터를 point-in-polygon 으로 구역 배분
      const counts = new Map<number, number>();
      try {
        const qs = 'swLat=32.9&swLng=124.5&neLat=38.8&neLng=131.0&zoom=7';
        const res = await fetch(`/api/map/clusters?${qs}`);
        if (res.ok) {
          const json = await res.json();
          const clusters: Array<{ lat: number; lng: number; count: number }> =
            Array.isArray(json?.data) ? json.data : [];
          const ringsByIdx = geo.features.map(outerRings);
          for (const c of clusters) {
            for (let fi = 0; fi < ringsByIdx.length; fi++) {
              if (featureContains(ringsByIdx[fi], c.lng, c.lat)) {
                counts.set(fi, (counts.get(fi) ?? 0) + c.count);
                break;
              }
            }
          }
        }
      } catch { /* 개수 실패해도 폴리곤은 그림 */ }
      if (disposed || !active) return;

      const sortedCounts = [...counts.values()].sort((a, b) => a - b);
      clearAll();

      geo.features.forEach((f, fi) => {
        const rings = outerRings(f);
        const count = counts.get(fi) ?? 0;
        const cls = quantileClass(count, sortedCounts);

        for (const ring of rings) {
          const path = ring.map(([lng, lat]) => new maps.LatLng(lat, lng));
          const poly = new maps.Polygon({
            path,
            strokeWeight: 1.6,
            strokeColor: '#ffffff',
            strokeOpacity: 0.95,
            strokeStyle: 'solid',
            fillColor: CHORO[cls],
            fillOpacity: 0.46,
            zIndex: 1,
          });
          poly.setMap(map);
          polysRef.current.push(poly);
        }

        if (count > 0) {
          const lp = labelPoint(rings);
          const name = shortName(String(f.properties.name ?? ''));
          const el = document.createElement('div');
          el.className = 'srl-bubble';
          el.innerHTML =
            `<span class="srl-rname">${name}</span>` +
            `<span class="srl-rcount">${fmtCount(count)}</span>`;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const m = map as KakaoMapLike;
            if (m.setLevel && m.getLevel) {
              const ll = new maps.LatLng(lp.lat, lp.lng);
              const next = Math.max(1, (m.getLevel() ?? 10) - 3);
              try { m.setLevel(next, { anchor: ll, animate: true }); }
              catch { try { m.setLevel(next); } catch { /* noop */ } }
              try { m.panTo?.(ll); } catch { /* noop */ }
            }
          });
          const ov = new maps.CustomOverlay({
            position: new maps.LatLng(lp.lat, lp.lng),
            content: el,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 5,
          });
          ov.setMap(map);
          overlaysRef.current.push(ov);
        }
      });
    })();

    return () => {
      disposed = true;
      clearAll();
    };
  }, [map, tier, active]);

  return null;
}

export default SearchRegionLayer;
