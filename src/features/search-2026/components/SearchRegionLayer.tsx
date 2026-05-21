'use client';

/**
 * SearchRegionLayer — /search 행정구역 폴리곤 + 개수 (P5 줌 1~3단계)
 *
 * 줌 단계별 표기 시스템의 광역~동 단계.
 *   1단계 시·도  — /api/geo/sido
 *   2단계 시·군·구 — /api/geo/sigungu
 *   3단계 읍·면·동 — /api/geo/dong
 *
 * 설계:
 *   · map-2026 store 비의존 — /search 전용 자체완결.
 *   · 행정구역 GeoJSON 폴리곤(구멍 포함) + 5분위 초플레스 fill.
 *   · 개수 = /api/map/clusters 를 point-in-polygon 으로 구역 배분.
 *   · 라벨 위치 = polylabel(pole of inaccessibility) — 항상 폴리곤 내부, 겹침 없음.
 *   · /map 의 AdminRegionOverlay 는 손대지 않음.
 */

import { useEffect, useRef, useState } from 'react';

export type RegionTier = 'sido' | 'sigungu' | 'dong';

const COUNT_ZOOM: Record<RegionTier, number> = { sido: 7, sigungu: 9, dong: 11 };

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

// 한 폴리곤 = ring 배열 (ring[0]=외곽, 나머지=구멍). 좌표는 [lng,lat].
type Ring = number[][];
type Poly = Ring[];

// ── GeoJSON 캐시 ─────────────────────────────────────────────
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

// ── 기하 ─────────────────────────────────────────────────────
function featurePolys(f: GeoFeature): Poly[] {
  if (f.geometry.type === 'Polygon') return [f.geometry.coordinates];
  return f.geometry.coordinates;
}
function ringBboxArea(ring: Ring): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
function featureContains(polys: Poly[], lng: number, lat: number): boolean {
  for (const poly of polys) {
    if (!inRing(lng, lat, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (inRing(lng, lat, poly[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

// polylabel — 폴리곤 내부에서 모든 변으로부터 가장 먼 점 (라벨 최적 위치)
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  let dx = bx - ax, dy = by - ay;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    if (t > 1) { ax = bx; ay = by; } else if (t > 0) { ax += dx * t; ay += dy * t; }
  }
  dx = px - ax; dy = py - ay;
  return dx * dx + dy * dy;
}
function signedDist(x: number, y: number, poly: Poly): number {
  let inside = false, minD2 = Infinity;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if (((a[1] > y) !== (b[1] > y)) &&
          (x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])) inside = !inside;
      const d2 = segDist2(x, y, a[0], a[1], b[0], b[1]);
      if (d2 < minD2) minD2 = d2;
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minD2);
}
function polylabel(poly: Poly): { lat: number; lng: number } {
  const outer = poly[0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const w = maxX - minX, h = maxY - minY;
  const cell = Math.min(w, h);
  if (cell === 0) return { lng: minX, lat: minY };
  const half = cell / 2;
  const mk = (cx: number, cy: number, hh: number) => {
    const d = signedDist(cx, cy, poly);
    return { cx, cy, h: hh, d, max: d + hh * Math.SQRT2 };
  };
  const queue: ReturnType<typeof mk>[] = [];
  for (let x = minX; x < maxX; x += cell) {
    for (let y = minY; y < maxY; y += cell) queue.push(mk(x + half, y + half, half));
  }
  let best = mk((minX + maxX) / 2, (minY + maxY) / 2, 0);
  const precision = cell / 60;
  let guard = 0;
  while (queue.length && guard < 12000) {
    guard++;
    queue.sort((a, b) => a.max - b.max);
    const c = queue.pop()!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const hh = c.h / 2;
    queue.push(mk(c.cx - hh, c.cy - hh, hh), mk(c.cx + hh, c.cy - hh, hh),
               mk(c.cx - hh, c.cy + hh, hh), mk(c.cx + hh, c.cy + hh, hh));
  }
  return { lat: best.cy, lng: best.cx };
}

// ── 5분위 초플레스 ───────────────────────────────────────────
const CHORO = ['#e4efe1', '#c1dbaf', '#8dbf80', '#56985e', '#2d6e42'];
// 0 = 매물 없음(연함), 1~4 = 비영(非零) 구역 순위 분위
function choroClass(count: number, nonzeroSorted: number[]): number {
  if (count <= 0 || nonzeroSorted.length === 0) return 0;
  const rank = nonzeroSorted.findIndex((v) => v >= count);
  const r = rank < 0 ? nonzeroSorted.length - 1 : rank;
  return Math.min(4, 1 + Math.floor((r / Math.max(1, nonzeroSorted.length)) * 4));
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
    .replace('특별시', '').replace('광역시', '').replace(/도$/, '');
}

// ── 스타일 ───────────────────────────────────────────────────
const STYLE_ID = 'wishes-search-region-style';
const STYLE_CSS = `
.srl-bubble{
  display:flex;flex-direction:column;align-items:center;
  padding:5px 13px;border-radius:14px;cursor:pointer;
  background:rgba(255,255,255,0.97);
  box-shadow:0 3px 10px rgba(16,40,24,0.24),0 0 0 0.5px rgba(16,40,24,0.07);
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard',sans-serif;
  transition:transform .16s cubic-bezier(.16,1,.3,1);
}
.srl-bubble:hover{transform:scale(1.07);}
.srl-rname{font-size:11px;font-weight:500;color:#5a6b60;letter-spacing:-0.01em;line-height:1.2;}
.srl-rcount{font-size:14.5px;font-weight:700;color:#235b34;letter-spacing:-0.02em;line-height:1.25;}
`;
function injectStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLE_CSS;
  document.head.appendChild(el);
}

// ── Kakao 타입 ───────────────────────────────────────────────
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
  active: boolean;
  /** 현재 카카오 줌 레벨 — 버블 겹침 재배치 트리거 */
  level: number;
}

interface FeatureDatum {
  label: { lat: number; lng: number };
  count: number;
  name: string;
}

export function SearchRegionLayer({ map, tier, active, level }: SearchRegionLayerProps) {
  const polysRef = useRef<KakaoPolygon[]>([]);
  const bubblesRef = useRef<KakaoOverlay[]>([]);
  const [fdata, setFdata] = useState<FeatureDatum[] | null>(null);

  useEffect(() => { injectStyle(); }, []);

  // ── Effect 1 — 폴리곤 그리기 + 구역 데이터 산출 (tier/active 변경 시) ──
  useEffect(() => {
    if (!map) return;
    const win = window as unknown as { kakao?: { maps?: KakaoMapsNs } };
    const maps = win.kakao?.maps;
    if (!maps) return;

    let disposed = false;
    const clearPolys = () => {
      for (const p of polysRef.current) { try { p.setMap(null); } catch { /* noop */ } }
      polysRef.current = [];
    };

    if (!active) { clearPolys(); setFdata(null); return () => { disposed = true; }; }

    (async () => {
      const geo = await loadGeo(tier);
      if (disposed || !geo || !active) return;

      const counts = new Map<number, number>();
      try {
        const res = await fetch('/api/map/clusters?swLat=32.9&swLng=124.5&neLat=38.8&neLng=131.0&zoom=' + COUNT_ZOOM[tier]);
        if (res.ok) {
          const json = await res.json();
          const clusters: Array<{ lat: number; lng: number; count: number }> =
            Array.isArray(json?.data) ? json.data : [];
          const polysByIdx = geo.features.map(featurePolys);
          for (const c of clusters) {
            for (let fi = 0; fi < polysByIdx.length; fi++) {
              if (featureContains(polysByIdx[fi], c.lng, c.lat)) {
                counts.set(fi, (counts.get(fi) ?? 0) + c.count);
                break;
              }
            }
          }
        }
      } catch { /* 개수 실패해도 폴리곤은 그림 */ }
      if (disposed || !active) return;

      const nonzero = [...counts.values()].filter((v) => v > 0).sort((a, b) => a - b);
      clearPolys();
      const fds: FeatureDatum[] = [];

      geo.features.forEach((f, fi) => {
        const polys = featurePolys(f);
        const count = counts.get(fi) ?? 0;
        const cls = choroClass(count, nonzero);

        for (const poly of polys) {
          const path = poly.map((ring) => ring.map(([lng, lat]) => new maps.LatLng(lat, lng)));
          const kp = new maps.Polygon({
            path,
            strokeWeight: 1.5,
            strokeColor: '#3f6b4c',
            strokeOpacity: 0.55,
            strokeStyle: 'solid',
            fillColor: CHORO[cls],
            fillOpacity: count > 0 ? 0.52 : 0.16,
            zIndex: 1,
          });
          kp.setMap(map);
          polysRef.current.push(kp);
        }

        let big = polys[0], bigArea = 0;
        for (const p of polys) {
          const a = ringBboxArea(p[0]);
          if (a > bigArea) { bigArea = a; big = p; }
        }
        fds.push({
          label: polylabel(big),
          count,
          name: shortName(String(f.properties.name ?? '')),
        });
      });

      if (disposed) return;
      setFdata(fds);
    })();

    return () => { disposed = true; clearPolys(); };
  }, [map, tier, active]);

  // ── Effect 2 — 개수 버블 (겹침 제거, 줌 변경 시 재배치) ──────────
  useEffect(() => {
    if (!map) return;
    const win = window as unknown as { kakao?: { maps?: KakaoMapsNs } };
    const maps = win.kakao?.maps;
    if (!maps) return;

    const clearBubbles = () => {
      for (const o of bubblesRef.current) { try { o.setMap(null); } catch { /* noop */ } }
      bubblesRef.current = [];
    };
    clearBubbles();
    if (!active || !fdata) return () => clearBubbles();

    const proj = (map as { getProjection?: () => { pointFromCoords: (c: unknown) => { x: number; y: number } } })
      .getProjection?.();

    // 개수 큰 구역 우선 — 겹치면 작은 쪽 생략
    const cand = fdata.filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
    const placed: Array<{ x: number; y: number }> = [];

    for (const d of cand) {
      let x: number, y: number;
      if (proj) {
        const p = proj.pointFromCoords(new maps.LatLng(d.label.lat, d.label.lng) as unknown);
        x = p.x; y = p.y;
      } else {
        x = d.label.lng * 100000; y = -d.label.lat * 100000;
      }
      let collide = false;
      for (const q of placed) {
        if (Math.abs(q.x - x) < 66 && Math.abs(q.y - y) < 42) { collide = true; break; }
      }
      if (collide) continue;
      placed.push({ x, y });

      const el = document.createElement('div');
      el.className = 'srl-bubble';
      el.innerHTML =
        `<span class="srl-rname">${d.name}</span>` +
        `<span class="srl-rcount">${fmtCount(d.count)}</span>`;
      const lp = d.label;
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
      bubblesRef.current.push(ov);
    }

    return () => clearBubbles();
  }, [map, tier, active, fdata, level]);

  // 언마운트 정리
  useEffect(() => {
    return () => {
      for (const p of polysRef.current) { try { p.setMap(null); } catch { /* noop */ } }
      for (const o of bubblesRef.current) { try { o.setMap(null); } catch { /* noop */ } }
      polysRef.current = [];
      bubblesRef.current = [];
    };
  }, []);

  return null;
}

export default SearchRegionLayer;
