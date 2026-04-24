// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AdminRegionOverlay — L-adminpoly1 (2026-04-24 pm)
// 행정구역 폴리곤 하이라이트 (시/도 · 구 · 동).
//
// 네이버 벤치마크: 축소 뷰에서 특정 행정구역을 색으로 칠해 경계를 시각화.
// 개별 매물을 점으로 찍으면 주소 정확 위치가 노출돼 경쟁사 매물 뺏기·직거래
// 리스크가 있다는 사용자 피드백 반영.
//
// 데이터 소스:
//   https://github.com/southkorea/southkorea-maps
//     · kostat/2018/skorea-provinces-2018-geo.json  (시/도 17개)
//     · kostat/2018/skorea-municipalities-2018-geo.json  (시/군/구 ~250개)
//   SGIS(국가통계청) 데이터 기반.  GitHub raw CDN 이 CORS 허용 → 브라우저
//   fetch 로 lazy-load.  모듈 레벨 in-memory cache 로 반복 fetch 차단.
//
// 줌 레벨 매핑:
//   · level ≥ 10 (국토 뷰): 시/도 17개 폴리곤
//   · level 7~9 (대도시권): 시/군/구 폴리곤 (bbox 내) ← L-adminpoly4 구현
//   · level ≤ 6: 폴리곤 숨김 (HtmlMarkerOverlay 의 카운트 원이 충분)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect, useRef } from 'react';
import type { MapListing } from '@/features/map-2026/store';

const SIDO_GEOJSON_URL =
  '/api/geo/sido';
const SIGUNGU_GEOJSON_URL =
  '/api/geo/sigungu';
// L-naverstyle1 (2026-04-24 pm): 읍/면/동 경계 (simplified ~1.7MB)
const DONG_GEOJSON_URL =
  '/api/geo/dong';

interface GeoFeature {
  type: 'Feature';
  properties: { name?: string; name_eng?: string; code?: string; [k: string]: unknown };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}
interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

// 모듈 레벨 캐시 — /map 진입 → 마커 오버레이 → 줌아웃 반복에도 fetch 1회만.
let sidoCache: GeoCollection | null = null;
let sigunguCache: GeoCollection | null = null;
let dongCache: GeoCollection | null = null;
let pendingSido: Promise<GeoCollection | null> | null = null;
let pendingSigungu: Promise<GeoCollection | null> | null = null;
let pendingDong: Promise<GeoCollection | null> | null = null;

async function loadSido(): Promise<GeoCollection | null> {
  if (sidoCache) return sidoCache;
  if (pendingSido) return pendingSido;
  pendingSido = fetch(SIDO_GEOJSON_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { sidoCache = j as GeoCollection | null; return sidoCache; })
    .catch(() => null)
    .finally(() => { pendingSido = null; });
  return pendingSido;
}
async function loadSigungu(): Promise<GeoCollection | null> {
  if (sigunguCache) return sigunguCache;
  if (pendingSigungu) return pendingSigungu;
  pendingSigungu = fetch(SIGUNGU_GEOJSON_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { sigunguCache = j as GeoCollection | null; return sigunguCache; })
    .catch(() => null)
    .finally(() => { pendingSigungu = null; });
  return pendingSigungu;
}
async function loadDong(): Promise<GeoCollection | null> {
  if (dongCache) return dongCache;
  if (pendingDong) return pendingDong;
  pendingDong = fetch(DONG_GEOJSON_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { dongCache = j as GeoCollection | null; return dongCache; })
    .catch(() => null)
    .finally(() => { pendingDong = null; });
  return pendingDong;
}

// ── Kakao SDK 타입 최소 ────────────────────────────────────────────
interface KakaoPolygon { setMap: (m: unknown) => void }
interface KakaoCustomOverlay { setMap: (m: unknown) => void }
interface KakaoBounds {
  getSouthWest: () => { getLat: () => number; getLng: () => number };
  getNorthEast: () => { getLat: () => number; getLng: () => number };
}
interface KakaoMapLike {
  getLevel?: () => number;
  getBounds?: () => KakaoBounds;
  setBounds?: (b: unknown, t?: number, r?: number, bo?: number, l?: number) => void;
  panTo?: (pos: unknown) => void;
  setLevel?: (n: number, opts?: unknown) => void;
}
interface KakaoEventNs {
  addListener: (t: unknown, type: string, cb: () => void) => void;
  removeListener?: (t: unknown, type: string, cb: () => void) => void;
}
interface KakaoLatLngBoundsLike {
  extend: (latlng: unknown) => void;
}
interface KakaoMapsNs {
  Polygon: new (opts: Record<string, unknown>) => KakaoPolygon;
  CustomOverlay: new (opts: Record<string, unknown>) => KakaoCustomOverlay;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new (sw?: unknown, ne?: unknown) => KakaoLatLngBoundsLike;
  event: KakaoEventNs;
}
interface KakaoNs { maps?: KakaoMapsNs }

// 컬러 — 스타벅스 그린 유지 (마커와 동일 톤)
const FILL = '#006241';
const FILL_OPACITY = 0.08;
const STROKE = '#006241';
// L-adminpoly6: stroke 조금 더 투명하게 (0.6 → 0.35).  지도 내용 가독성 우선.
const STROKE_OPACITY = 0.35;

// feature name → sido 짧은 이름 매핑 (southkorea-maps 는 name 에 영문/한글 혼재)
function normalizeSidoName(raw: string | undefined | null): string {
  if (!raw) return '';
  // 영문 name 예: "Seoul"/"Gyeonggi"/"Jeju" → 한글 환산
  const map: Record<string, string> = {
    Seoul: '서울', Busan: '부산', Daegu: '대구', Incheon: '인천',
    Gwangju: '광주', Daejeon: '대전', Ulsan: '울산', Sejong: '세종',
    Gyeonggi: '경기', 'Gangwon-do': '강원', Gangwon: '강원',
    Chungbuk: '충북', 'Chungcheongbuk-do': '충북',
    Chungnam: '충남', 'Chungcheongnam-do': '충남',
    Jeonbuk: '전북', 'Jeollabuk-do': '전북',
    Jeonnam: '전남', 'Jeollanam-do': '전남',
    Gyeongbuk: '경북', 'Gyeongsangbuk-do': '경북',
    Gyeongnam: '경남', 'Gyeongsangnam-do': '경남',
    Jeju: '제주',
  };
  if (map[raw]) return map[raw];
  // 한글 full: "서울특별시" 등 → 짧은 이름으로
  if (raw.startsWith('서울')) return '서울';
  if (raw.startsWith('부산')) return '부산';
  if (raw.startsWith('대구')) return '대구';
  if (raw.startsWith('인천')) return '인천';
  if (raw.startsWith('광주')) return '광주';
  if (raw.startsWith('대전')) return '대전';
  if (raw.startsWith('울산')) return '울산';
  if (raw.startsWith('세종')) return '세종';
  if (raw.startsWith('경기')) return '경기';
  if (raw.startsWith('강원')) return '강원';
  if (raw.startsWith('충청북') || raw.startsWith('충북')) return '충북';
  if (raw.startsWith('충청남') || raw.startsWith('충남')) return '충남';
  if (raw.startsWith('전라북') || raw.startsWith('전북')) return '전북';
  if (raw.startsWith('전라남') || raw.startsWith('전남')) return '전남';
  if (raw.startsWith('경상북') || raw.startsWith('경북')) return '경북';
  if (raw.startsWith('경상남') || raw.startsWith('경남')) return '경남';
  if (raw.startsWith('제주')) return '제주';
  return raw;
}

/** listings 를 시/도 이름별 count 로 집계 */
function countListingsBySido(listings: MapListing[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of listings) {
    // title 에 "서울 관악구..." 형태로 마스킹된 주소가 들어있음 (로그인 시 full address)
    const src = (l as { address?: string | null }).address || l.title || '';
    const first = src.trim().split(/\s+/)[0] || '';
    const key = normalizeSidoName(first);
    if (!key) continue;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** address 에서 시/군/구 키 추출.
 *  "서울 관악구 신림동..." → "관악구"
 *  "경기 수원시 장안구 조원동..." → "수원시 장안구"
 *  "경기 시흥시 정왕동..." → "시흥시"
 *  "경기 가평군 가평읍..." → "가평군" */
function parseGu(src: string | null | undefined): string | null {
  if (!src) return null;
  const parts = String(src).trim().split(/\s+/);
  if (parts.length === 0) return null;
  // 첫 토큰은 시/도 (스킵).  그 다음 시·군·구 탐색.
  for (let i = 1; i < parts.length; i++) {
    const t = parts[i];
    if (/[시군]$/.test(t)) {
      const next = parts[i + 1];
      if (next && /구$/.test(next)) return `${t} ${next}`;  // 수원시 장안구
      return t;  // 시흥시, 가평군
    }
    if (/구$/.test(t)) return t;  // 강남구, 관악구 (광역시 직할)
  }
  return null;
}

/** address 에서 읍/면/동 이름 추출.
 *  "서울 관악구 신림동 1536-8 ..." → "신림동"
 *  "경기 수원시 장안구 조원동 ..." → "조원동"
 *  "강원 홍천군 서면 ..." → "서면"
 *  dong 컬럼이 있으면 그것 우선, 없으면 address 에서 정규식 추출. */
function parseDongName(src: string | null | undefined, dongField: string | null | undefined): string | null {
  if (dongField && dongField.trim()) {
    const d = dongField.trim();
    if (/[동읍면]$/.test(d)) return d;
  }
  if (!src) return null;
  const parts = String(src).trim().split(/\s+/);
  for (const t of parts) {
    // "동", "읍", "면" 으로 끝나는 토큰 (단, 시/도 명칭 "강원도" 같은 건 배제)
    if (/^[가-힣]{2,5}[동읍면]$/.test(t) && !/[도시군구]$/.test(t)) return t;
  }
  return null;
}

/** listings 를 읍/면/동 이름별 count 로 집계 */
function countListingsByDong(listings: MapListing[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of listings) {
    const src = (l as { address?: string | null }).address || l.title || '';
    const key = parseDongName(src, l.dong);
    if (!key) continue;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** listings 를 시/군/구 이름별 count 로 집계 */
function countListingsBySigungu(listings: MapListing[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of listings) {
    const src = (l as { address?: string | null }).address || l.title || '';
    const key = parseGu(src);
    if (!key) continue;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** Ray-casting point-in-polygon (GeoJSON [lng,lat] 순서). */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** feature (Polygon|MultiPolygon) 안에 (lat, lng) 가 있는지 */
function pointInFeature(lat: number, lng: number, feat: GeoFeature): boolean {
  const geom = feat.geometry;
  const paths: number[][][][] = geom.type === 'Polygon'
    ? [geom.coordinates as number[][][]]
    : geom.type === 'MultiPolygon'
      ? (geom.coordinates as number[][][][])
      : [];
  for (const poly of paths) {
    const outer = poly[0];
    if (!outer) continue;
    if (pointInRing(lng, lat, outer)) {
      // holes 체크 (있다면 inside=false)
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(lng, lat, poly[h])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

/** L-adminfit2 (2026-04-24 pm): listings 가 빈 배열이어도 서버 클러스터로 count 계산.
 *  서버 사전집계(H3) 는 항상 응답하므로 최대 축소 뷰에서도 폴리곤 그릴 수 있음. */
function countByRegionFromClusters(
  clusters: { lat: number; lng: number; count: number }[] | undefined,
  features: GeoFeature[],
  keyFn: (feat: GeoFeature) => string,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!clusters?.length) return out;
  for (const c of clusters) {
    for (const feat of features) {
      if (pointInFeature(c.lat, c.lng, feat)) {
        const key = keyFn(feat);
        if (key) out.set(key, (out.get(key) ?? 0) + c.count);
        break;
      }
    }
  }
  return out;
}

/** L-naverstyle1 (2026-04-24 pm): listings 를 polygon-contains 로 feature 에 배정.
 *  dong 단위에서는 법정동(서초동) vs 통계동(서초1동/2동) 이름 차이로 name-match 가
 *  실패하므로 lat/lng 기반이 더 정확.  feature 가 수천 개지만 viewport bbox 로
 *  사전 필터하므로 루프 비용은 수십×수천 수준.  폴리곤 내부 판정 O(n) per ring. */
function countListingsByFeature(
  listings: MapListing[],
  features: GeoFeature[],
  keyFn: (feat: GeoFeature) => string,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!listings.length || !features.length) return out;
  for (const l of listings) {
    for (const feat of features) {
      if (pointInFeature(l.lat, l.lng, feat)) {
        const key = keyFn(feat);
        if (key) out.set(key, (out.get(key) ?? 0) + 1);
        break;
      }
    }
  }
  return out;
}

/** GeoJSON feature → 전체 geometry 의 bounding box.
 *  MultiPolygon 이어도 모든 ring 을 순회해 정확한 외접 bbox 산출. */
function computeFeatureBbox(
  feat: GeoFeature,
): { west: number; south: number; east: number; north: number } | null {
  const geom = feat.geometry;
  const paths: number[][][][] = geom.type === 'Polygon'
    ? [geom.coordinates as number[][][]]
    : geom.type === 'MultiPolygon'
      ? (geom.coordinates as number[][][][])
      : [];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const poly of paths) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return { west: minLng, south: minLat, east: maxLng, north: maxLat };
}

/** GeoJSON feature 의 bbox 가 viewport bbox 와 교차하는지 */
function featureIntersectsBbox(
  feat: GeoFeature,
  bbox: { west: number; south: number; east: number; north: number },
): boolean {
  const geom = feat.geometry;
  const paths: number[][][][] = geom.type === 'Polygon'
    ? [geom.coordinates as number[][][]]
    : geom.type === 'MultiPolygon'
      ? (geom.coordinates as number[][][][])
      : [];
  for (const poly of paths) {
    const ring = poly[0];
    if (!ring) continue;
    // 외접 bbox 빠르게 계산
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    // 교차 판정 (AABB intersect)
    if (maxLng >= bbox.west && minLng <= bbox.east &&
        maxLat >= bbox.south && minLat <= bbox.north) {
      return true;
    }
  }
  return false;
}

/** 시/도 카운트 chip — 폴리곤 centroid 위에 뜨는 라벨 */
function makeRegionCountChip(name: string, count: number): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'background:#ffffff',
    'border-radius:999px',
    'padding:6px 5px 6px 12px',
    'font-size:12px',
    'font-weight:700',
    'color:#1a1a1a',
    `border:1.5px solid ${STROKE}`,
    'box-shadow:0 2px 6px rgba(0,0,0,0.15)',
    'white-space:nowrap',
    'cursor:pointer',
    'user-select:none',
    'font-family:inherit',
    'pointer-events:auto',
    'letter-spacing:-0.2px',
  ].join(';');

  const label = document.createElement('span');
  label.textContent = name;
  el.appendChild(label);

  const badge = document.createElement('span');
  badge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'background:rgba(0,98,65,0.88)',
    'color:#fff',
    'border-radius:999px',
    'padding:2px 8px',
    'font-size:11px',
    'font-weight:700',
    'margin-left:8px',
    'min-width:24px',
  ].join(';');
  badge.textContent = count >= 10000
    ? `${Math.floor(count / 1000)}k`
    : count >= 1000
      ? `${(Math.floor(count / 100) / 10).toFixed(1)}k`
      : String(count);
  el.appendChild(badge);
  return el;
}

/** polygon path 평균으로 centroid 근사 */
function polygonCentroid(coords: number[][][] | number[][][][]): { lat: number; lng: number } | null {
  // MultiPolygon 이면 첫 polygon 의 첫 ring 으로 근사
  const firstRing: number[][] = Array.isArray(coords[0]?.[0]?.[0])
    ? (coords as number[][][][])[0][0]
    : (coords as number[][][])[0];
  if (!firstRing || firstRing.length === 0) return null;
  let lngSum = 0;
  let latSum = 0;
  for (const [lng, lat] of firstRing) {
    lngSum += lng;
    latSum += lat;
  }
  return { lat: latSum / firstRing.length, lng: lngSum / firstRing.length };
}

interface Props {
  map: unknown;
  listings: MapListing[];
  /** L-adminfit2 (2026-04-24 pm): 서버 사전집계 클러스터 (H3).  listings 가 빈
   *  bbox(>2°) 에서도 sido/sigungu count 를 정확히 계산할 수 있도록 prop 으로 받음. */
  serverClusters?: { lat: number; lng: number; count: number }[];
  onClickRegion?: (name: string) => void;
}

export default function AdminRegionOverlay({ map, listings, serverClusters, onClickRegion }: Props) {
  const polygonsRef = useRef<KakaoPolygon[]>([]);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);

  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const kakao = (window as unknown as { kakao?: KakaoNs }).kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    const cleanup = () => {
      for (const p of polygonsRef.current) { try { p.setMap(null); } catch { /* noop */ } }
      for (const o of overlaysRef.current) { try { o.setMap(null); } catch { /* noop */ } }
      polygonsRef.current = [];
      overlaysRef.current = [];
    };

    /** 단일 feature 를 폴리곤 + (옵션)chip 으로 렌더.  레벨별 공통 로직.
     *  L-adminpoly6 (2026-04-24 pm): count === 0 지역은 완전히 스킵.
     *  사용자 피드백 '전지역이 다 선택되어 있다' 반영.  매물 있는 지역만
     *  시각화해 정보 가치 극대화 + 시각 노이즈 제거. */
    const renderFeature = (
      feat: GeoFeature,
      displayName: string,
      count: number,
      showChip: boolean,
      strokeOnly: boolean = false,
    ) => {
      // L-adminpoly7: strokeOnly 면 count=0 도 렌더 (구 경계 시각화 목적).
      //   fill 모드(sido)는 count>0 만 스킵 유지.
      if (!strokeOnly && count <= 0) return;
      const geom = feat.geometry;
      const paths: number[][][][] = geom.type === 'Polygon'
        ? [geom.coordinates as number[][][]]
        : geom.type === 'MultiPolygon'
          ? (geom.coordinates as number[][][][])
          : [];
      // L-adminpoly6: count > 0 만 렌더되므로 일관된 강조 opacity.
      //   매물 많을수록 조금 더 진하게 (최대 0.25).
      const fillOp = Math.min(0.25, FILL_OPACITY + Math.log10(Math.max(1, count)) * 0.04);
      for (const polyCoords of paths) {
        const outer = polyCoords[0];
        if (!outer) continue;
        const path = outer.map(([lng, lat]) => new maps.LatLng(lat, lng));
        try {
          const polygon = new maps.Polygon({
            path,
            strokeWeight: strokeOnly ? 1.2 : 1.0,
            strokeColor: STROKE,
            strokeOpacity: strokeOnly ? 0.5 : STROKE_OPACITY,
            fillColor: FILL,
            // L-adminpoly7 (2026-04-24 pm): sigungu 레벨은 fill 제거 — stroke only.
            //   매물 많은 지역에 fill 이 크게 깔리면 시각 과부하 + 클릭 타겟 식별 방해.
            fillOpacity: strokeOnly ? 0 : fillOp,
            clickable: false,
          });
          polygon.setMap(map);
          polygonsRef.current.push(polygon);
        } catch { /* SDK race — skip */ }
      }
      if (showChip && count > 0) {
        const centroid = polygonCentroid(
          geom.type === 'Polygon' ? (geom.coordinates as number[][][]) : (geom.coordinates as number[][][][])
        );
        if (!centroid) return;
        const chip = makeRegionCountChip(displayName, count);
        // L-adminfit1 (2026-04-24 pm): chip 클릭 = 해당 지역 경계에 fitBounds.
        //   이전엔 onClickRegion 콜백이 MapClient 에서 제공되지 않아 클릭해도 반응 없었다
        //   ('폴리곤 기능이 제대로 작동을 안한다' 사용자 피드백의 실제 원인).
        //   이제 내부에서 map.setBounds 를 직접 호출 → 해당 시/도·시/군/구 영역으로
        //   자동 줌인. useViewport 가 좁아진 bbox 로 /api/listings/map 재호출 →
        //   사이드바도 해당 지역 매물만 자동 필터.
        const regionBbox = computeFeatureBbox(feat);
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          try {
            if (regionBbox && typeof mapInst.setBounds === 'function') {
              const sw = new maps.LatLng(regionBbox.south, regionBbox.west);
              const ne = new maps.LatLng(regionBbox.north, regionBbox.east);
              const bounds = new maps.LatLngBounds(sw, ne);
              mapInst.setBounds(bounds, 40, 40, 40, 40);
            } else if (typeof mapInst.panTo === 'function') {
              mapInst.panTo(new maps.LatLng(centroid.lat, centroid.lng));
              if (typeof mapInst.setLevel === 'function') {
                const cur = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 10;
                mapInst.setLevel(Math.max(4, cur - 3));
              }
            }
          } catch { /* SDK race — skip */ }
          onClickRegion?.(displayName);
        });
        try {
          const ov = new maps.CustomOverlay({
            position: new maps.LatLng(centroid.lat, centroid.lng),
            content: chip,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 12,
            clickable: true,
          });
          ov.setMap(map);
          overlaysRef.current.push(ov);
        } catch { /* noop */ }
      }
    };

    const render = async () => {
      cleanup();
      const level = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;

      // ── 시/도 (level ≥ 10) ──────────────────────────────────
      if (level >= 10) {
        const data = await loadSido();
        if (!data?.features) return;
        // L-adminfit2: listings 가 비었으면(>2° viewport) serverClusters 로 fallback
        let counts = countListingsBySido(listings);
        if (counts.size === 0 && serverClusters?.length) {
          counts = countByRegionFromClusters(
            serverClusters,
            data.features,
            (feat) => normalizeSidoName(String(feat.properties.name ?? feat.properties.name_eng ?? '')),
          );
        }
        for (const feat of data.features) {
          const nameRaw = String(
            (feat.properties as { name?: string; name_eng?: string }).name ??
            (feat.properties as { name_eng?: string }).name_eng ?? ''
          );
          const sidoName = normalizeSidoName(nameRaw);
          renderFeature(feat, sidoName, counts.get(sidoName) ?? 0, true);  // sido chip 표시
        }
        return;
      }

      // ── 시/군/구 (level 7~9) — L-adminpoly4 (2026-04-24 pm) ───
      if (level >= 7) {
        const data = await loadSigungu();
        if (!data?.features) return;
        // viewport bbox 로 필터링 (전국 250개 → 현재 뷰에 보이는 것만)
        const bounds = typeof mapInst.getBounds === 'function' ? mapInst.getBounds() : null;
        const bbox = bounds ? {
          west: bounds.getSouthWest().getLng(),
          south: bounds.getSouthWest().getLat(),
          east: bounds.getNorthEast().getLng(),
          north: bounds.getNorthEast().getLat(),
        } : null;
        let counts = countListingsBySigungu(listings);
        if (counts.size === 0 && serverClusters?.length) {
          counts = countByRegionFromClusters(
            serverClusters,
            data.features,
            (feat) => String(feat.properties.name ?? feat.properties.name_eng ?? '').trim(),
          );
        }
        for (const feat of data.features) {
          if (bbox && !featureIntersectsBbox(feat, bbox)) continue;
          // feature.name 은 보통 "강남구" 또는 "수원시 장안구" 형태
          const nameRaw = String(
            (feat.properties as { name?: string; name_eng?: string }).name ??
            (feat.properties as { name_eng?: string }).name_eng ?? ''
          ).trim();
          if (!nameRaw) continue;
          // southkorea-maps 는 'Gangnam-gu' 같은 영문도 있을 수 있음 — 한글만 처리
          // L-adminfit1 (2026-04-24 pm): sigungu 에도 chip 표시 (count > 0 만).
          //   chip 클릭 = 해당 구/시 영역으로 fitBounds → 자동 줌인 → 사이드바 필터.
          //   이전엔 sigungu 는 stroke 만 + chip 없어 레벨 7~9 에서 클릭 타겟이 없었다.
          renderFeature(feat, nameRaw, counts.get(nameRaw) ?? 0, true, true);
        }
        return;
      }

      // ── 읍/면/동 (level 4~6) — L-naverstyle1 (2026-04-24 pm) ─────────
      //   네이버 부동산 동 단위 뷰에 해당.  viewport 내 동만 렌더 + 밀도 상한으로
      //   시각 과부하 방지.
      if (level >= 4) {
        const data = await loadDong();
        if (!data?.features) return;
        const bounds = typeof mapInst.getBounds === 'function' ? mapInst.getBounds() : null;
        const bbox = bounds ? {
          west: bounds.getSouthWest().getLng(),
          south: bounds.getSouthWest().getLat(),
          east: bounds.getNorthEast().getLng(),
          north: bounds.getNorthEast().getLat(),
        } : null;

        // L-naverstyle1 fix: viewport 내 feature 만 후보로 만든 뒤 그 위에서
        //   listings 를 polygon-contains 로 count.  통계동(서초1동/2동) 이름이
        //   listings dong 필드(서초동) 와 안 맞아도 lat/lng 기반이라 정확.
        type Cand = { feat: GeoFeature; name: string; count: number };
        const visibleFeatures: GeoFeature[] = [];
        const nameByFeat = new Map<GeoFeature, string>();
        for (const feat of data.features) {
          if (bbox && !featureIntersectsBbox(feat, bbox)) continue;
          const nameRaw = String(
            (feat.properties as { name?: string; name_eng?: string }).name ??
            (feat.properties as { name_eng?: string }).name_eng ?? ''
          ).trim();
          if (!nameRaw) continue;
          visibleFeatures.push(feat);
          nameByFeat.set(feat, nameRaw);
        }

        let counts = countListingsByFeature(
          listings,
          visibleFeatures,
          (feat) => nameByFeat.get(feat) ?? '',
        );
        if (counts.size === 0 && serverClusters?.length) {
          counts = countByRegionFromClusters(
            serverClusters,
            visibleFeatures,
            (feat) => nameByFeat.get(feat) ?? '',
          );
        }

        const candidates: Cand[] = visibleFeatures.map((feat) => ({
          feat,
          name: nameByFeat.get(feat) ?? '',
          count: counts.get(nameByFeat.get(feat) ?? '') ?? 0,
        }));

        // count > 0 은 모두 렌더.  count=0 은 stroke 만 (경계 context 유지)
        // top 25 까지는 chip 표시, 초과분은 stroke only (밀집 뷰 대비).
        const withCount = candidates.filter((c) => c.count > 0)
          .sort((a, b) => b.count - a.count);
        const CHIP_LIMIT = 25;
        const chipSet = new Set(withCount.slice(0, CHIP_LIMIT).map((c) => c.name));

        for (const { feat, name, count } of candidates) {
          if (chipSet.has(name)) {
            renderFeature(feat, name, count, true, true);
          } else {
            // count 초과분 또는 count=0 은 stroke 만
            renderFeature(feat, name, count, false, true);
          }
        }
        return;
      }

      // level ≤ 3: 폴리곤 숨김 (HtmlMarkerOverlay 의 단지 pill + 개별 매물)
    };

    void render();

    const onZoom = () => { void render(); };
    try { maps.event.addListener(mapInst as unknown, 'zoom_changed', onZoom); } catch { /* noop */ }

    return () => {
      try {
        if (maps.event.removeListener) {
          maps.event.removeListener(mapInst as unknown, 'zoom_changed', onZoom);
        }
      } catch { /* noop */ }
      cleanup();
    };
  }, [map, listings, serverClusters, onClickRegion]);

  // sigungu + dong 캐시 warm-up (다음 줌인 때 즉시 사용 가능)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = (typeof window.requestIdleCallback === 'function')
      ? window.requestIdleCallback(() => { void loadSigungu(); void loadDong(); })
      : window.setTimeout(() => { void loadSigungu(); void loadDong(); }, 2000);
    return () => {
      if (typeof window.requestIdleCallback === 'function' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(id as number);
      } else {
        clearTimeout(id as number);
      }
    };
  }, []);

  return null;
}
