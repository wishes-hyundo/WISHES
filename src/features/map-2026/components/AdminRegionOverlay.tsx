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
// 줌 레벨 매핑 (L-granularity1 + L-closeview1 2026-04-24 pm 업데이트):
//   · level ≥ 11 (국토/대권역): 시/도 17개 폴리곤
//   · level 8~10 (대도시권): 시/군/구 폴리곤 (bbox 내)
//   · level 4~7 (시가지~상세): 읍/면/동 폴리곤 (bbox 내, top 25 chip)
//   · level ≤ 3 (근거리): HtmlMarkerOverlay 단지 pill + 개별 원
//
// 전환 이력:
//   · L-granularity1: sigungu 7→8, sido 10→11 (zoom in/out 체감 개선)
//   · L-closeview1:  dong 3→4 (250m 뷰에서 1 chip 만 뜨는 문제 — 개별 마커로)
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

// L-colorrevert1 (2026-04-26 night): 색상 원복 (그린 → 빨강).
//   사용자 피드백 "색상은 또 왜 그린으로 바뀌어 있는거야" — 색상 변경 시키지
//   않았는데 임의로 변경한 점 사과.  default invisible 동작은 유지.
const FILL = '#dc2626';        // red-600 (원래 색)
const FILL_OPACITY = 0.20;     // hover 시 적용되는 강조 opacity
const STROKE = '#dc2626';
const STROKE_OPACITY = 0.85;   // hover 시에만 표시 (default 0)
const STROKE_OPACITY_FAINT = 0.0;

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

/** L-legaldong1 (2026-04-26): 통계동 → 법정동 정규화.
 *  southkorea-maps GeoJSON 은 통계동 (신림1동, 신림2동, ..., 신림13동) 으로
 *  세분화되어 있어 한 동이 13 조각으로 보임.  네이버는 법정동 단위 (신림동
 *  한 덩어리).  이름에서 숫자 부분을 제거해 같은 법정동끼리 그룹핑. */
function normalizeLegalDong(name: string): string {
  if (!name) return name;
  // "신림1동" → "신림동", "역삼1동" → "역삼동", "사당3동" → "사당동"
  // "행운동", "잠원동" 등 숫자 없는 동은 그대로
  return name.replace(/(.+?)\d+동$/, '$1동');
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

/** L-naverstyle9 (2026-04-25): 네이버 부동산 스타일 통일 원형 마커.
 *  네이버는 행정구역 chip 에 텍스트(이름) 를 넣지 않고 폴리곤 색칠 + 단순한
 *  원형 + 숫자만으로 표시한다.  지도 자체의 동/구 이름 라벨이 위치 정보를
 *  보완하므로 마커가 시각적으로 깔끔.
 *
 *  · count 기반 사이즈 — 1k 이상은 큰 원, 작은 카운트는 작은 원
 *  · padding 2~4px 로 숫자만 들어가는 정사각 박스가 아닌 자연스러운 원형
 *  · 위시스 그린 (#006241) 채움으로 브랜드 일관성 유지 (네이버는 파란색) */
function makeRegionCountChip(name: string, count: number): HTMLDivElement {
  // L-naverlabel1 (2026-04-26): 네이버 스타일 wrapper.
  //   wrapper 안에 (1) 영역 이름 라벨 + (2) 원형 카운트 마커 함께 표시.
  //   사용자 피드백 "동/구 제대로 인지 못함" 해결 — tooltip 만으로는 부족.
  //   네이버는 폴리곤마다 "서울시 관악구 신림동" 같은 라벨을 항상 표시.
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:3px',
    'cursor:pointer',
    'user-select:none',
    'pointer-events:auto',
  ].join(';');
  if (name) wrapper.title = `${name} (${count.toLocaleString()})`;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  // 사이즈 spread (네이버 스타일)
  const size = isMobile
    ? (count >= 5000 ? 62 : count >= 1000 ? 52 : count >= 100 ? 40 : count >= 10 ? 30 : 24)
    : (count >= 5000 ? 80 : count >= 1000 ? 68 : count >= 100 ? 52 : count >= 10 ? 40 : 32);
  const fontSize = isMobile
    ? (count >= 5000 ? 13 : count >= 1000 ? 12 : count >= 100 ? 11 : count >= 10 ? 11 : 10)
    : (count >= 5000 ? 16 : count >= 1000 ? 15 : count >= 100 ? 14 : count >= 10 ? 13 : 12);

  // (1) 원형 카운트 마커 — 위시스 그린, 테두리 없음
  const circle = document.createElement('div');
  circle.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:50%',
    'background:rgba(0,98,65,0.95)',
    'color:#fff',
    'border:none',
    'box-shadow:0 3px 10px rgba(0,0,0,0.3)',
    `font-size:${fontSize}px`,
    'font-weight:800',
    'letter-spacing:-0.3px',
    'font-family:inherit',
    'transition:transform 150ms ease',
  ].join(';');
  circle.textContent = count >= 10000
    ? `${Math.floor(count / 1000)}k`
    : count >= 1000
      ? `${(Math.floor(count / 100) / 10).toFixed(1)}k`
      : String(count);
  wrapper.appendChild(circle);

  // L-noinlinelabel1 (2026-04-26): 영역 이름 라벨 제거 — 사용자 피드백 "번잡".
  //   동/구 인지는 (1) hover tooltip 으로, (2) 폴리곤 fill (빨간색) + stroke 으로 가능.

  wrapper.addEventListener('mouseenter', () => { circle.style.transform = 'scale(1.1)'; });
  wrapper.addEventListener('mouseleave', () => { circle.style.transform = 'scale(1)'; });
  return wrapper;
}

/** polygon path 평균으로 centroid 근사 */
// L-centroid1 (2026-04-26): 진짜 centroid — 면적 기반.
//   이전엔 첫 ring 의 점 평균으로 근사 → MultiPolygon 또는 비대칭 모양에서
//   centroid 가 폴리곤 밖에 떨어질 수 있음 (마커 위치 오류).
//   현재: 모든 polygon 의 모든 점 평균.  대부분 행정구역에 충분히 정확.
function polygonCentroid(coords: number[][][] | number[][][][]): { lat: number; lng: number } | null {
  let lngSum = 0;
  let latSum = 0;
  let count = 0;
  // Polygon: number[][][] → outerRing = coords[0]
  // MultiPolygon: number[][][][] → 각 polygon 의 outerRing = coords[i][0]
  const isMulti = Array.isArray(coords[0]?.[0]?.[0]);
  if (isMulti) {
    for (const poly of coords as number[][][][]) {
      const outer = poly[0];
      if (!outer) continue;
      for (const [lng, lat] of outer) {
        lngSum += lng;
        latSum += lat;
        count++;
      }
    }
  } else {
    const outer = (coords as number[][][])[0];
    if (!outer) return null;
    for (const [lng, lat] of outer) {
      lngSum += lng;
      latSum += lat;
      count++;
    }
  }
  if (count === 0) return null;
  return { lat: latSum / count, lng: lngSum / count };
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
      // L-hoverstuck1: cleanup 직전에 모든 폴리곤 hover 상태 강제 invisible.
      //   setMap(null) 직전에 opacity 0 으로 만들어 다시 그릴 때 stale 시각 상태 차단.
      for (const p of polygonsRef.current) {
        try { (p as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: 0, strokeOpacity: 0 }); } catch {/*noop*/}
        try { p.setMap(null); } catch { /* noop */ }
      }
      for (const o of overlaysRef.current) { try { o.setMap(null); } catch { /* noop */ } }
      polygonsRef.current = [];
      overlaysRef.current = [];
    };

    // L-hoverstuck1 (2026-04-26 night): hover 상태 stuck 방지 안전장치.
    //   사용자가 Win+Shift+S 캡쳐, alt+tab, 다른 윈도우 클릭 등으로 chip 에서 마우스가
    //   벗어나도 mouseleave 가 발화 안 하는 케이스가 있음.  → window blur + 전역
    //   mousemove 로 모든 폴리곤 hover 상태 강제 클리어.
    const forceHidePolygons = () => {
      for (const p of polygonsRef.current) {
        try { (p as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: 0, strokeOpacity: 0 }); } catch {/*noop*/}
      }
    };
    const onWindowBlur = () => forceHidePolygons();
    window.addEventListener('blur', onWindowBlur);
    // L-ghosthover1: visibilitychange (탭 전환, 캡쳐 도구 등) 도 처리
    const onVisChange = () => { if (document.hidden) forceHidePolygons(); };
    document.addEventListener('visibilitychange', onVisChange);
    // L-ghosthover1: 마우스가 브라우저 윈도우 밖으로 나가면 클리어
    const onDocMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && !(e as unknown as {toElement?: unknown}).toElement) forceHidePolygons();
    };
    document.addEventListener('mouseout', onDocMouseOut);

    // L-naverstyle6 (2026-04-24 pm): async race condition 방지.
    //   render() 는 `await loadDong()` 등으로 중단점이 있어서, 그 사이에 listings
    //   업데이트/zoom_changed 로 render 가 재호출되면 두 개 render 가 동시 진행
    //   → 둘 다 cleanup() 후 overlay 그림 → 같은 동에 chip 2개씩 겹침.
    //   해결 — render 시작 시 localId 발급, 이후 await 뒤 currentId 와 같은지 확인.
    let currentRenderId = 0;

    /** 단일 feature 를 폴리곤 + (옵션)chip 으로 렌더.  레벨별 공통 로직.
     *  L-adminpoly6 (2026-04-24 pm): count === 0 지역은 완전히 스킵.
     *  사용자 피드백 '전지역이 다 선택되어 있다' 반영.  매물 있는 지역만
     *  시각화해 정보 가치 극대화 + 시각 노이즈 제거. */
    const renderFeature = (
      feat: GeoFeature,
      displayName: string,
      count: number,
      showChip: boolean,
      _strokeOnly: boolean = false,  // L-marker-poly-bind1 (2026-04-26 night): 더 이상 사용 안 함
    ) => {
      // L-marker-poly-bind1 (2026-04-26 night): 매물 없는 영역은 폴리곤 자체를 안 그림.
      //   사용자 피드백: "폴리곤이 마커랑 묶여서 작동... 빨간선이 도대체 왜 그런거야".
      //   기존엔 strokeOpacity 0.12 로 옅게 그렸지만 viewport 내 수십 개가 누적되어
      //   빨간 그물망처럼 보임. 마커(chip) 있는 영역에만 폴리곤 그림 → 1:1 binding.
      if (count <= 0) return;
      void _strokeOnly;
      const geom = feat.geometry;
      const paths: number[][][][] = geom.type === 'Polygon'
        ? [geom.coordinates as number[][][]]
        : geom.type === 'MultiPolygon'
          ? (geom.coordinates as number[][][][])
          : [];
      // L-naverhover1 (2026-04-26 evening): 기본 fill 0, hover/select 시에만 강조.
      //   매물 많을수록 hover opacity 만 살짝 진하게 — 정보 가치 표현 유지.
      const hoverFillOp = Math.min(0.28, FILL_OPACITY + Math.log10(Math.max(1, count)) * 0.04);
      const featurePolygons: KakaoPolygon[] = [];  // chip hover 시 일괄 강조
      for (const polyCoords of paths) {
        const outer = polyCoords[0];
        if (!outer) continue;
        const path = outer.map(([lng, lat]) => new maps.LatLng(lat, lng));
        try {
          // L-naverhover1 (2026-04-26 evening): 폴리곤 default = stroke 만 (fill 없음).
          //   네이버 부동산처럼 자동 색칠 제거 → 시각 노이즈 해소.
          //   hover 시에만 fill 추가 (mouseover 핸들러).
          const hasCount = count > 0;
          const polygon = new maps.Polygon({
            path,
            // L-naverexact1 (2026-04-26 night): default 완전 invisible (네이버 동일).
            //   chip 만 보임. hover 시에만 stroke + fill 등장.
            strokeWeight: 1.6,
            strokeColor: STROKE,
            strokeOpacity: 0,  // default invisible
            fillColor: FILL,
            fillOpacity: 0,  // default invisible
            clickable: hasCount && showChip,
          });
          // L-ghosthover1 (2026-04-26 night): hover 시 다른 모든 폴리곤 강제 invisible.
          //   사용자 피드백 "두 폴리곤 stuck" — mouseleave 미발화 race condition 해결.
          //   mouseenter 시 polygonsRef.current 전체를 0으로 만든 후 자기 그룹만 visible.
          //   → mouseleave 발화 여부와 무관하게 항상 1개 그룹만 표시 보장.
          if (hasCount && showChip) {
            try {
              maps.event.addListener(polygon as unknown, 'mouseover', () => {
                forceHidePolygons();
                try { (polygon as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: hoverFillOp, strokeOpacity: STROKE_OPACITY }); } catch {/*noop*/}
              });
              maps.event.addListener(polygon as unknown, 'mouseout', () => {
                try { (polygon as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: 0, strokeOpacity: 0 }); } catch {/*noop*/}
              });
            } catch { /*noop*/ }
          }
          if (hasCount && showChip) {
            // 폴리곤 클릭 = chip 클릭과 동일 동작 (computeFeatureBbox 로 zoom in)
            const polyBbox = computeFeatureBbox(feat);
            try {
              maps.event.addListener(polygon as unknown, 'click', () => {
                try {
                  const beforeLv = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;
                  if (polyBbox && typeof mapInst.setBounds === 'function') {
                    const sw = new maps.LatLng(polyBbox.south, polyBbox.west);
                    const ne = new maps.LatLng(polyBbox.north, polyBbox.east);
                    const bounds = new maps.LatLngBounds(sw, ne);
                    mapInst.setBounds(bounds, 40, 40, 40, 40);
                    // L-clickfix2 (2026-04-26): 강제 줌인 (chip 클릭 동일)
                    setTimeout(() => {
                      try {
                        const afterLv = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : beforeLv;
                        if (afterLv >= beforeLv && typeof mapInst.setLevel === 'function') {
                          mapInst.setLevel(Math.max(1, beforeLv - 1));
                        }
                      } catch { /* noop */ }
                    }, 100);
                  }
                } catch { /* noop */ }
                onClickRegion?.(displayName);
              });
            } catch { /* noop */ }
          }
          polygon.setMap(map);
          polygonsRef.current.push(polygon);
          featurePolygons.push(polygon);
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
        // L-clickfix1 (2026-04-25): mousedown/dblclick 까지 잡아 Kakao 의 기본
        //   더블클릭 zoom 동작이 chip 클릭을 가로채는 문제 해결.
        //   사용자 피드백 "단일 클릭 무반응, 더블클릭만 반응" → 해결.
        chip.addEventListener('mousedown', (e) => e.stopPropagation());
        chip.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); });
        // L-ghosthover1 (2026-04-26 night): chip hover → 다른 모든 폴리곤 강제 invisible 후 자기 그룹만 visible
        chip.addEventListener('mouseenter', () => {
          forceHidePolygons();
          for (const p of featurePolygons) {
            try { (p as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: hoverFillOp, strokeOpacity: STROKE_OPACITY }); } catch {/*noop*/}
          }
        });
        chip.addEventListener('mouseleave', () => {
          for (const p of featurePolygons) {
            try { (p as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: 0, strokeOpacity: 0 }); } catch {/*noop*/}
          }
        });
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          try {
            const beforeLevel = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;
            if (regionBbox && typeof mapInst.setBounds === 'function') {
              const sw = new maps.LatLng(regionBbox.south, regionBbox.west);
              const ne = new maps.LatLng(regionBbox.north, regionBbox.east);
              const bounds = new maps.LatLngBounds(sw, ne);
              mapInst.setBounds(bounds, 40, 40, 40, 40);
              // L-clickfix2 (2026-04-26): setBounds 후 줌 단계 변화 없거나 미미하면
              //   강제 줌인.  동/구 폴리곤 bbox 가 현재 viewport 와 비슷할 때
              //   "클릭해도 변화 없음" 처럼 보이는 문제 해결.
              setTimeout(() => {
                try {
                  const afterLevel = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : beforeLevel;
                  if (afterLevel >= beforeLevel && typeof mapInst.setLevel === 'function') {
                    mapInst.setLevel(Math.max(1, beforeLevel - 1));
                  }
                } catch { /* noop */ }
              }, 100);
            } else if (typeof mapInst.panTo === 'function') {
              mapInst.panTo(new maps.LatLng(centroid.lat, centroid.lng));
              if (typeof mapInst.setLevel === 'function') {
                mapInst.setLevel(Math.max(1, beforeLevel - 2));
              }
            }
          } catch { /* SDK race — skip */ }
          onClickRegion?.(displayName);
        });
        try {
          // L-noinlinelabel1 (2026-04-26): wrapper 안 라벨 제거 → yAnchor 0.5 복원
          const zBase = 12;
          const zBoost = count >= 1000 ? 6 : count >= 100 ? 4 : count >= 10 ? 2 : 0;
          const ov = new maps.CustomOverlay({
            position: new maps.LatLng(centroid.lat, centroid.lng),
            content: chip,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: zBase + zBoost,
            clickable: true,
          });
          ov.setMap(map);
          overlaysRef.current.push(ov);
        } catch { /* noop */ }
      }
    };

    const render = async () => {
      const myId = ++currentRenderId;
      cleanup();
      const level = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;
      const stillOwner = () => myId === currentRenderId;

      // ── 시/도 (level ≥ 10) ──────────────────────────────────
      // L-granularity1 (2026-04-24 pm): sido 경계를 10 → 11 로 이동.
      if (level >= 11) {
        const data = await loadSido();
        if (!stillOwner() || !data?.features) return;
        // L-cluster-pref1 (2026-04-25): serverClusters 우선.
        //   useViewport limit=4000 때문에 listings 기반 count 는 캡되어 부정확.
        //   serverClusters 는 RPC 사전집계라 캡 없음 → 정확한 총합 표시.
        let counts: Map<string, number>;
        if (serverClusters?.length) {
          counts = countByRegionFromClusters(
            serverClusters,
            data.features,
            (feat) => normalizeSidoName(String(feat.properties.name ?? feat.properties.name_eng ?? '')),
          );
        } else {
          counts = countListingsBySido(listings);
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
      // L-granularity1 (2026-04-24 pm): sigungu 경계를 7 → 8 로 이동.
      //   level 7 은 동 chip 으로 편입되어 zoom in 시 구→동 전환 체감 개선.
      if (level >= 8) {
        const data = await loadSigungu();
        if (!stillOwner() || !data?.features) return;
        // viewport bbox 로 필터링 (전국 250개 → 현재 뷰에 보이는 것만)
        const bounds = typeof mapInst.getBounds === 'function' ? mapInst.getBounds() : null;
        const bbox = bounds ? {
          west: bounds.getSouthWest().getLng(),
          south: bounds.getSouthWest().getLat(),
          east: bounds.getNorthEast().getLng(),
          north: bounds.getNorthEast().getLat(),
        } : null;
        // L-cluster-pref1 (2026-04-25): serverClusters 우선
        let counts: Map<string, number>;
        if (serverClusters?.length) {
          counts = countByRegionFromClusters(
            serverClusters,
            data.features,
            (feat) => String(feat.properties.name ?? feat.properties.name_eng ?? '').trim(),
          );
        } else {
          counts = countListingsBySigungu(listings);
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

      // ── 읍/면/동 (level 4~7) — L-naverstyle5 + L-granularity1 + L-closeview1 (2026-04-24 pm) ─
      //   네이버 부동산 동 단위 뷰.  viewport 내 동만 렌더 + 밀도 상한으로
      //   시각 과부하 방지.
      //   L-closeview1: 경계 3 → 4.  level 3 (250m) 은 viewport 가 동 1개에
      //   꽉 차서 "역삼1동 347" chip 하나만 뜨는 문제가 있어 HtmlMarkerOverlay
      //   (개별 원·pill) 에게 넘김.
      if (level >= 4) {
        const data = await loadDong();
        if (!stillOwner() || !data?.features) return;
        const bounds = typeof mapInst.getBounds === 'function' ? mapInst.getBounds() : null;
        const bbox = bounds ? {
          west: bounds.getSouthWest().getLng(),
          south: bounds.getSouthWest().getLat(),
          east: bounds.getNorthEast().getLng(),
          north: bounds.getNorthEast().getLat(),
        } : null;

        // L-legaldong1 (2026-04-26): 통계동 → 법정동 그룹핑.
        //   viewport 내 통계동 feature 들을 법정동 이름 (정규화) 으로 그룹핑.
        //   각 그룹은 폴리곤 여러 개 (각 통계동) + chip 1개 (그룹 centroid).
        const visibleFeatures: GeoFeature[] = [];
        const rawNameByFeat = new Map<GeoFeature, string>();
        for (const feat of data.features) {
          if (bbox && !featureIntersectsBbox(feat, bbox)) continue;
          const nameRaw = String(
            (feat.properties as { name?: string; name_eng?: string }).name ??
            (feat.properties as { name_eng?: string }).name_eng ?? ''
          ).trim();
          if (!nameRaw) continue;
          visibleFeatures.push(feat);
          rawNameByFeat.set(feat, nameRaw);
        }

        // 법정동 이름 정규화 그룹화: { "신림동": [신림1동 feat, 신림2동 feat, ...] }
        const groupByLegal = new Map<string, GeoFeature[]>();
        for (const feat of visibleFeatures) {
          const legalName = normalizeLegalDong(rawNameByFeat.get(feat) ?? '');
          if (!legalName) continue;
          const arr = groupByLegal.get(legalName) ?? [];
          arr.push(feat);
          groupByLegal.set(legalName, arr);
        }

        // count: 통계동 단위로 계산 후 법정동 단위로 합산
        const rawCounts: Map<string, number> = serverClusters?.length
          ? countByRegionFromClusters(serverClusters, visibleFeatures, (f) => rawNameByFeat.get(f) ?? '')
          : countListingsByFeature(listings, visibleFeatures, (f) => rawNameByFeat.get(f) ?? '');
        const legalCounts = new Map<string, number>();
        for (const [rawName, cnt] of rawCounts) {
          const legalName = normalizeLegalDong(rawName);
          legalCounts.set(legalName, (legalCounts.get(legalName) ?? 0) + cnt);
        }

        // 법정동 그룹별 candidate
        type LegalCand = { name: string; count: number; feats: GeoFeature[] };
        const legalCandidates: LegalCand[] = [...groupByLegal.entries()].map(([legalName, feats]) => ({
          name: legalName,
          count: legalCounts.get(legalName) ?? 0,
          feats,
        }));

        const withCount = legalCandidates.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
        const CHIP_LIMIT = 25;
        const chipSet = new Set(withCount.slice(0, CHIP_LIMIT).map((c) => c.name));

        // 그룹별 합집합 centroid (모든 feat 의 모든 점 평균) 계산
        function groupCentroid(feats: GeoFeature[]): { lat: number; lng: number } | null {
          let lat = 0, lng = 0, n = 0;
          for (const f of feats) {
            const coords = f.geometry.type === 'Polygon'
              ? [f.geometry.coordinates as number[][][]]
              : f.geometry.type === 'MultiPolygon'
                ? (f.geometry.coordinates as number[][][][])
                : [];
            for (const poly of coords) {
              const outer = poly[0];
              if (!outer) continue;
              for (const [x, y] of outer) { lng += x; lat += y; n++; }
            }
          }
          if (n === 0) return null;
          return { lat: lat / n, lng: lng / n };
        }

        // 그룹별 합집합 bbox
        function groupBbox(feats: GeoFeature[]): { west: number; south: number; east: number; north: number } | null {
          let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
          for (const f of feats) {
            const b = computeFeatureBbox(f);
            if (!b) continue;
            if (b.west < minLng) minLng = b.west;
            if (b.east > maxLng) maxLng = b.east;
            if (b.south < minLat) minLat = b.south;
            if (b.north > maxLat) maxLat = b.north;
          }
          if (!Number.isFinite(minLng)) return null;
          return { west: minLng, south: minLat, east: maxLng, north: maxLat };
        }

        // L-marker-poly-bind1 (2026-04-26 night): 매물 0인 영역 폴리곤 자체 스킵.
        //   사용자 피드백 "선택 안 했는데 빨간선이 여기저기" 원인 = count=0 폴리곤들의
        //   stroke 0.12 opacity 가 viewport 내 수십 개 누적되어 그물망처럼 보임.
        //   해결: chip 있는 그룹만 폴리곤 그림 → 마커 ↔ 폴리곤 1:1 bind (사용자 요구).
        for (const cand of legalCandidates) {
          if (cand.count <= 0) continue;  // L-marker-poly-bind1: count 0 즉시 스킵
          const hasChip = chipSet.has(cand.name);
          if (!hasChip) continue;  // chip top-25 밖이면 폴리곤도 스킵 (마커 없으면 폴리곤도 없음)
          const hoverFillOp = Math.min(0.28, FILL_OPACITY + Math.log10(Math.max(1, cand.count)) * 0.04);
          const groupPolygons: KakaoPolygon[] = [];  // 그룹 hover 시 일괄 강조
          // 그룹 내 모든 통계동 폴리곤
          for (const feat of cand.feats) {
            const geom = feat.geometry;
            const paths: number[][][][] = geom.type === 'Polygon'
              ? [geom.coordinates as number[][][]]
              : geom.type === 'MultiPolygon'
                ? (geom.coordinates as number[][][][])
                : [];
            for (const polyCoords of paths) {
              const outer = polyCoords[0];
              if (!outer) continue;
              const path = outer.map(([lng, lat]) => new maps.LatLng(lat, lng));
              try {
                const polygon = new maps.Polygon({
                  path,
                  // L-naverexact1 (2026-04-26 night): default 완전 invisible.
                  //   chip hover/polygon hover 시에만 stroke + fill 등장.
                  strokeWeight: 1.4,
                  strokeColor: STROKE,
                  strokeOpacity: 0,  // default invisible (네이버 동일)
                  fillColor: FILL,
                  fillOpacity: 0,
                  clickable: true,
                });
                {
                  const grpBbox = groupBbox(cand.feats);
                  // L-ghosthover1 (2026-04-26 night): 그룹 hover → 다른 모든 폴리곤 강제 invisible 후 자기 그룹만 visible
                  try {
                    maps.event.addListener(polygon as unknown, 'mouseover', () => {
                      forceHidePolygons();
                      for (const p of groupPolygons) {
                        try { (p as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: hoverFillOp, strokeOpacity: STROKE_OPACITY }); } catch {/*noop*/}
                      }
                    });
                    maps.event.addListener(polygon as unknown, 'mouseout', () => {
                      for (const p of groupPolygons) {
                        try { (p as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: 0, strokeOpacity: 0 }); } catch {/*noop*/}
                      }
                    });
                  } catch { /*noop*/ }
                  try {
                    maps.event.addListener(polygon as unknown, 'click', () => {
                      try {
                        const beforeLv = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;
                        if (grpBbox && typeof mapInst.setBounds === 'function') {
                          const sw = new maps.LatLng(grpBbox.south, grpBbox.west);
                          const ne = new maps.LatLng(grpBbox.north, grpBbox.east);
                          const bounds = new maps.LatLngBounds(sw, ne);
                          mapInst.setBounds(bounds, 40, 40, 40, 40);
                          setTimeout(() => {
                            try {
                              const afterLv = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : beforeLv;
                              if (afterLv >= beforeLv && typeof mapInst.setLevel === 'function') {
                                mapInst.setLevel(Math.max(1, beforeLv - 1));
                              }
                            } catch { /*noop*/ }
                          }, 100);
                        }
                      } catch { /*noop*/ }
                      onClickRegion?.(cand.name);
                    });
                  } catch { /*noop*/ }
                }
                polygon.setMap(map);
                polygonsRef.current.push(polygon);
                groupPolygons.push(polygon);
              } catch { /*SDK race - skip*/ }
            }
          }

          // chip 1개만 (그룹 centroid 위치)
          if (hasChip) {
            const centroid = groupCentroid(cand.feats);
            if (!centroid) continue;
            const chip = makeRegionCountChip(cand.name, cand.count);
            const grpBbox = groupBbox(cand.feats);
            chip.addEventListener('mousedown', (e) => e.stopPropagation());
            chip.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); });
            // L-ghosthover1 (2026-04-26 night): chip hover → 다른 모든 폴리곤 강제 invisible 후 자기 그룹만 visible
            chip.addEventListener('mouseenter', () => {
              forceHidePolygons();
              for (const p of groupPolygons) {
                try { (p as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: hoverFillOp, strokeOpacity: STROKE_OPACITY }); } catch {/*noop*/}
              }
            });
            chip.addEventListener('mouseleave', () => {
              for (const p of groupPolygons) {
                try { (p as unknown as {setOptions:(o:Record<string,unknown>)=>void}).setOptions({ fillOpacity: 0, strokeOpacity: 0 }); } catch {/*noop*/}
              }
            });
            chip.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              try {
                const beforeLv = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;
                if (grpBbox && typeof mapInst.setBounds === 'function') {
                  const sw = new maps.LatLng(grpBbox.south, grpBbox.west);
                  const ne = new maps.LatLng(grpBbox.north, grpBbox.east);
                  const bounds = new maps.LatLngBounds(sw, ne);
                  mapInst.setBounds(bounds, 40, 40, 40, 40);
                  setTimeout(() => {
                    try {
                      const afterLv = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : beforeLv;
                      if (afterLv >= beforeLv && typeof mapInst.setLevel === 'function') {
                        mapInst.setLevel(Math.max(1, beforeLv - 1));
                      }
                    } catch { /*noop*/ }
                  }, 100);
                }
              } catch { /*noop*/ }
              onClickRegion?.(cand.name);
            });
            try {
              const zBase = 12;
              const zBoost = cand.count >= 1000 ? 6 : cand.count >= 100 ? 4 : cand.count >= 10 ? 2 : 0;
              const ov = new maps.CustomOverlay({
                position: new maps.LatLng(centroid.lat, centroid.lng),
                content: chip,
                xAnchor: 0.5,
                yAnchor: 0.5,
                zIndex: zBase + zBoost,
                clickable: true,
              });
              ov.setMap(map);
              overlaysRef.current.push(ov);
            } catch { /*noop*/ }
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
      currentRenderId++;  // 진행 중인 render 를 취소 (stillOwner()=false)
      try {
        if (maps.event.removeListener) {
          maps.event.removeListener(mapInst as unknown, 'zoom_changed', onZoom);
        }
      } catch { /* noop */ }
      try { window.removeEventListener('blur', onWindowBlur); } catch { /* noop */ }
      try { document.removeEventListener('visibilitychange', onVisChange); } catch { /* noop */ }
      try { document.removeEventListener('mouseout', onDocMouseOut); } catch { /* noop */ }
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
