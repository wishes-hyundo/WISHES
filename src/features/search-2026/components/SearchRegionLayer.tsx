'use client';

/**
 * SearchRegionLayer — /search 행정구역 폴리곤 + 개수 (P5 줌 1~3단계)
 *
 *   1단계 시·도  — /api/geo/sido    (전체 GeoJSON)
 *   2단계 시·군·구 — /api/geo/sigungu (전체 GeoJSON)
 *   3단계 읍·면·동 — /api/geo/legaldong/sigungu/{code} (viewport 시군구만 청크 lazy-load)
 *
 * 설계:
 *   · map-2026 store 비의존 — /search 전용 자체완결.
 *   · 동 GeoJSON 통본은 34MB → viewport 에 걸친 시군구의 동 청크(~44KB)만 로드.
 *   · 폴리곤(구멍 포함) + 5분위 초플레스. polylabel 라벨배치 + 버블 겹침 제거.
 *   · 개수 = /api/map/clusters 를 point-in-polygon 으로 구역 배분.
 *   · /map 의 AdminRegionOverlay 는 손대지 않음.
 */

import { useEffect, useRef, useState } from 'react';

export type RegionTier = 'sido' | 'sigungu' | 'dong';

const COUNT_ZOOM: Record<RegionTier, number> = { sido: 7, sigungu: 9, dong: 12 };
const GEO_URL: Record<'sido' | 'sigungu', string> = {
  sido: '/api/geo/sido',
  sigungu: '/api/geo/sigungu',
};

interface GeoFeature {
  type: 'Feature';
  properties: { name?: string; name_eng?: string; code?: string; [k: string]: unknown };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}
interface GeoCollection { type: 'FeatureCollection'; features: GeoFeature[] }
export interface RegionBbox { west: number; south: number; east: number; north: number }

type Ring = number[][];
type Poly = Ring[];

// ── GeoJSON 캐시 ─────────────────────────────────────────────
const geoCache: Partial<Record<'sido' | 'sigungu', GeoCollection>> = {};
const geoPending: Partial<Record<'sido' | 'sigungu', Promise<GeoCollection | null>>> = {};
async function loadGeo(tier: 'sido' | 'sigungu'): Promise<GeoCollection | null> {
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

// 동 청크 — 시군구 code 별 lazy-load + 캐시
const dongChunkCache = new Map<string, GeoCollection>();
const dongChunkPending = new Map<string, Promise<GeoCollection | null>>();
async function loadDongChunk(code: string): Promise<GeoCollection | null> {
  if (!/^\d{5}$/.test(code)) return null;
  if (dongChunkCache.has(code)) return dongChunkCache.get(code)!;
  if (dongChunkPending.has(code)) return dongChunkPending.get(code)!;
  const p = fetch(`/api/geo/legaldong/sigungu/${code}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) dongChunkCache.set(code, j as GeoCollection); return (j as GeoCollection) ?? null; })
    .catch(() => null)
    .finally(() => { dongChunkPending.delete(code); });
  dongChunkPending.set(code, p);
  return p;
}

// ── 기하 ─────────────────────────────────────────────────────
function featurePolys(f: GeoFeature): Poly[] {
  if (f.geometry.type === 'Polygon') return [f.geometry.coordinates];
  return f.geometry.coordinates;
}
function featureBbox(f: GeoFeature): [number, number, number, number] {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const poly of featurePolys(f)) {
    for (const [x, y] of poly[0]) {
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
  }
  return [mnx, mny, mxx, mxy];
}
function bboxHit(b: [number, number, number, number], v: RegionBbox): boolean {
  return !(b[2] < v.west || b[0] > v.east || b[3] < v.south || b[1] > v.north);
}
function ringBboxArea(ring: Ring): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}
// 저비용 라벨점 — 가장 큰 ring 정점 평균(샘플링). 구·동은 대체로 볼록 → 충분.
function cheapCentroid(poly: Poly): { lat: number; lng: number } {
  let best = poly[0], bestLen = 0;
  for (const r of poly) if (r.length > bestLen) { bestLen = r.length; best = r; }
  const step = Math.max(1, Math.floor(best.length / 48));
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < best.length; i += step) { sx += best[i][0]; sy += best[i][1]; n++; }
  return { lng: sx / Math.max(1, n), lat: sy / Math.max(1, n) };
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

// polylabel — 폴리곤 내부에서 모든 변으로부터 가장 먼 점
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
  while (queue.length && guard < 14000) {
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
  position:relative;
  display:flex;align-items:center;gap:5px;
  padding:4px 10px 4px 4px;border-radius:999px;cursor:pointer;
  background:#ffffff;white-space:nowrap;
  box-shadow:0 3px 9px rgba(16,40,24,0.26),0 0 0 0.5px rgba(16,40,24,0.10);
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Pretendard',sans-serif;
  transition:transform .16s cubic-bezier(.16,1,.3,1);
}
.srl-bubble:hover{transform:scale(1.06);z-index:50;}
.srl-bubble::after{
  content:'';position:absolute;left:50%;bottom:-4px;
  width:8px;height:8px;background:#ffffff;
  transform:translateX(-50%) rotate(45deg);
}
.srl-rcount{
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(150deg,#3c8a54,#2c6e42);
  color:#fff;font-size:12px;font-weight:700;letter-spacing:-0.02em;
  border-radius:999px;padding:3px 8px;
}
.srl-rname{font-size:12px;font-weight:600;color:#2c3a31;letter-spacing:-0.01em;padding-right:3px;}
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
interface KakaoPolygon { setMap: (m: unknown) => void; setOptions?: (o: Record<string, unknown>) => void }
interface KakaoOverlay { setMap: (m: unknown) => void }
interface KakaoMapsNs {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Polygon: new (opts: Record<string, unknown>) => KakaoPolygon;
  CustomOverlay: new (opts: Record<string, unknown>) => KakaoOverlay;
  event: { addListener: (t: unknown, type: string, cb: (e?: { latLng?: unknown }) => void) => void };
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
  level: number;
  bbox: RegionBbox | null;
}

interface FeatureDatum {
  label: { lat: number; lng: number };
  count: number;
  name: string;
  polys: Poly[];
}

export function SearchRegionLayer({ map, tier, active, level, bbox }: SearchRegionLayerProps) {
  const bubblesRef = useRef<KakaoOverlay[]>([]);
  const highlightRef = useRef<KakaoPolygon[]>([]);
  const [fdata, setFdata] = useState<FeatureDatum[] | null>(null);

  useEffect(() => { injectStyle(); }, []);

  const loadKey = tier === 'dong' && bbox
    ? `d:${bbox.west.toFixed(1)},${bbox.south.toFixed(1)},${bbox.east.toFixed(1)},${bbox.north.toFixed(1)}`
    : tier;

  // ── Effect 1 — 버블용 구역 데이터(개수) ──────────────────────
  useEffect(() => {
    if (!map) return;
    const win = window as unknown as { kakao?: { maps?: KakaoMapsNs } };
    if (!win.kakao?.maps) return;

    let disposed = false;
    if (!active || (tier === 'dong' && !bbox)) {
      setFdata(null);
      return () => { disposed = true; };
    }

    (async () => {
      let features: GeoFeature[];
      if (tier === 'dong') {
        const sigGeo = await loadGeo('sigungu');
        if (disposed || !sigGeo || !active || !bbox) return;
        const codes: string[] = [];
        for (const f of sigGeo.features) {
          const code = String(f.properties.code ?? '');
          if (!/^\d{5}$/.test(code)) continue;
          if (bboxHit(featureBbox(f), bbox)) codes.push(code);
        }
        const chunks = await Promise.all(codes.slice(0, 16).map(loadDongChunk));
        if (disposed || !active) return;
        features = [];
        for (const ch of chunks) if (ch?.features) features.push(...ch.features);
      } else {
        const geo = await loadGeo(tier);
        if (disposed || !geo || !active) return;
        features = geo.features;
      }
      if (tier === 'dong' && bbox) {
        features = features.filter((f) => bboxHit(featureBbox(f), bbox));
      }
      if (disposed || !active || features.length === 0) { if (!disposed) setFdata([]); return; }

      const fbboxes = features.map(featureBbox);
      const fpolys = features.map(featurePolys);

      const counts = new Map<number, number>();
      try {
        const url = tier === 'dong' && bbox
          ? `/api/map/clusters?swLat=${bbox.south.toFixed(3)}&swLng=${bbox.west.toFixed(3)}&neLat=${bbox.north.toFixed(3)}&neLng=${bbox.east.toFixed(3)}&zoom=${COUNT_ZOOM.dong}`
          : `/api/map/clusters?swLat=32.9&swLng=124.5&neLat=38.8&neLng=131.0&zoom=${COUNT_ZOOM[tier]}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const clusters: Array<{ lat: number; lng: number; count: number }> =
            Array.isArray(json?.data) ? json.data : [];
          for (const c of clusters) {
            for (let fi = 0; fi < features.length; fi++) {
              const b = fbboxes[fi];
              if (c.lng < b[0] || c.lng > b[2] || c.lat < b[1] || c.lat > b[3]) continue;
              if (featureContains(fpolys[fi], c.lng, c.lat)) {
                counts.set(fi, (counts.get(fi) ?? 0) + c.count);
                break;
              }
            }
          }
        }
      } catch { /* 개수 실패 무시 */ }
      if (disposed || !active) return;

      const fds: FeatureDatum[] = [];
      features.forEach((f, fi) => {
        const count = counts.get(fi) ?? 0;
        if (count <= 0) return;
        const polys = fpolys[fi];
        let big = polys[0], bigArea = 0;
        for (const p of polys) {
          const a = ringBboxArea(p[0]);
          if (a > bigArea) { bigArea = a; big = p; }
        }
        const label = tier === 'sido' ? polylabel(big) : cheapCentroid(big);
        fds.push({ label, count, name: shortName(String(f.properties.name ?? '')), polys });
      });

      if (disposed) return;
      setFdata(fds);
    })();

    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, tier, active, loadKey]);

  // 지도 중심 키 — 강조 폴리곤 갱신 트리거
  const centerKey = bbox
    ? `${((bbox.south + bbox.north) / 2).toFixed(3)},${((bbox.west + bbox.east) / 2).toFixed(3)}`
    : '';

  // ── Effect 2 — 현재 구역 강조 폴리곤 ─────────────────────────
  //   네이버·피터팬 방식: 지도 중심이 속한 구역 1개를 깨끗하게 반투명 칠.
  //   강조용은 무조건 정부 시도/시군구 GeoJSON 사용 — 합쳐 만든 동 경계처럼
  //   깨지지 않음. 지도 이동하면 따라 갱신.
  useEffect(() => {
    if (!map) return;
    const win = window as unknown as { kakao?: { maps?: KakaoMapsNs } };
    const maps = win.kakao?.maps;
    if (!maps) return;

    let disposed = false;
    const clearH = () => {
      for (const p of highlightRef.current) { try { p.setMap(null); } catch { /* noop */ } }
      highlightRef.current = [];
    };
    clearH();
    if (!active || !bbox) return () => { disposed = true; clearH(); };

    const cLat = (bbox.south + bbox.north) / 2;
    const cLng = (bbox.west + bbox.east) / 2;
    (async () => {
      const geo = await loadGeo(tier === 'sido' ? 'sido' : 'sigungu');
      if (disposed || !geo || !active) return;
      const hit = geo.features.find((f) => featureContains(featurePolys(f), cLng, cLat));
      if (!hit || disposed) return;
      for (const poly of featurePolys(hit)) {
        const path = poly.map((ring) => ring.map(([lng, lat]) => new maps.LatLng(lat, lng)));
        const kp = new maps.Polygon({
          path,
          strokeWeight: 2.4,
          strokeColor: '#2f7a47',
          strokeOpacity: 0.9,
          strokeStyle: 'solid',
          fillColor: '#3f8a55',
          fillOpacity: 0.13,
          zIndex: 1,
        });
        kp.setMap(map);
        highlightRef.current.push(kp);
      }
    })();

    return () => { disposed = true; clearH(); };
  }, [map, tier, active, centerKey]);

  // ── Effect 3 — 개수 버블 (전 구역, 겹침 제거) ────────────────
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
    const cand = [...fdata].sort((a, b) => b.count - a.count);
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
        if (Math.abs(q.x - x) < 88 && Math.abs(q.y - y) < 30) { collide = true; break; }
      }
      if (collide) continue;
      placed.push({ x, y });

      const lp = d.label;
      const el = document.createElement('div');
      el.className = 'srl-bubble';
      el.innerHTML =
        `<span class="srl-rcount">${fmtCount(d.count)}</span>` +
        `<span class="srl-rname">${d.name}</span>`;
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
        yAnchor: 1.0,
        zIndex: 5,
      });
      ov.setMap(map);
      bubblesRef.current.push(ov);
    }

    return () => clearBubbles();
  }, [map, tier, active, fdata, level]);

  useEffect(() => {
    return () => {
      for (const p of highlightRef.current) { try { p.setMap(null); } catch { /* noop */ } }
      for (const o of bubblesRef.current) { try { o.setMap(null); } catch { /* noop */ } }
      highlightRef.current = [];
      bubblesRef.current = [];
    };
  }, []);

  return null;
}

export default SearchRegionLayer;