// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AdminRegionOverlay — L-naver-true2 (2026-04-26 night, mouse-tracking)
// 사용자 피드백: 마우스 포인터 따라 폴리곤이 변경되어야 함.
//
// 핵심:
//   · 마우스 위치 기반 폴리곤 1개 표시 (mousemove 추적)
//   · 법정동 그룹화 (서초1동·서초2동·서초3동 → "서초동" 한 덩어리)
//   · 깔끔한 라벨 (이모지 없는 화이트 pill)
//   · 클릭 → fitBounds → 다음 단계 폴리곤 자동 등장
//
// 줌 레벨 매핑:
//   · level ≥ 10 : 시/도 (서울시 / 경기도 등)
//   · level 7~9  : 시/군/구 (관악구 / 수원시 등)
//   · level 4~6  : 읍/면/동 (법정동 단위, 그룹화)
//   · level ≤ 3  : 폴리곤 없음, HtmlMarkerOverlay 매물 마커
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

'use client';

import { useEffect, useRef } from 'react';
import RBush from 'rbush';
import simplify from '@turf/simplify';
import type { Feature as GjFeature, Polygon as GjPolygon, MultiPolygon as GjMP } from 'geojson';
import type { MapListing } from '@/features/map-2026/store';
import { useMap2026Store } from '@/features/map-2026/store';
import { kakaoFlyTo } from '@/features/map-2026/lib/cinematicMotion';
// L-naver-2026legalunion1: adminToLegalDong 제거 — 서버에서 union 으로 1 feature 생성.
// L-naver-precise2 (2026-04-26): @turf import 가 빌드 에러. 일단 union 제거.
//   정밀 GeoJSON (48 pts/feat) 자체로도 충분히 깔끔 → fill 만 stack 으로도 매끄러움.
// import { union as turfUnion, featureCollection as turfFC } from '@turf/turf';

const SIDO_GEOJSON_URL    = '/api/geo/sido';
const SIGUNGU_GEOJSON_URL = '/api/geo/sigungu';
const DONG_GEOJSON_URL    = '/api/geo/dong';

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

let sidoCache: GeoCollection | null = null;
let sigunguCache: GeoCollection | null = null;
let dongCache: GeoCollection | null = null;
let pendingSido: Promise<GeoCollection | null> | null = null;
let pendingSigungu: Promise<GeoCollection | null> | null = null;
let pendingDong: Promise<GeoCollection | null> | null = null;

// L-naver-2026skel2: loading state 추적용 inflight 카운터.
let loadInFlight = 0;
const loadingListeners = new Set<(loading: boolean) => void>();
function setLoadInFlight(delta: number) {
  loadInFlight += delta;
  const isLoading = loadInFlight > 0;
  loadingListeners.forEach((l) => l(isLoading));
}
function subscribeLoading(cb: (loading: boolean) => void): () => void {
  loadingListeners.add(cb);
  return () => loadingListeners.delete(cb);
}

async function loadSido(): Promise<GeoCollection | null> {
  if (sidoCache) return sidoCache;
  if (pendingSido) return pendingSido;
  setLoadInFlight(1);
  pendingSido = fetch(SIDO_GEOJSON_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { sidoCache = j as GeoCollection | null; return sidoCache; })
    .catch(() => null)
    .finally(() => { pendingSido = null; setLoadInFlight(-1); });
  return pendingSido;
}
async function loadSigungu(): Promise<GeoCollection | null> {
  if (sigunguCache) return sigunguCache;
  if (pendingSigungu) return pendingSigungu;
  setLoadInFlight(1);
  pendingSigungu = fetch(SIGUNGU_GEOJSON_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { sigunguCache = j as GeoCollection | null; return sigunguCache; })
    .catch(() => null)
    .finally(() => { pendingSigungu = null; setLoadInFlight(-1); });
  return pendingSigungu;
}
// L-naver-2026chunk1 (2026-04-26): 시군구별 dong chunk lazy-loading.
//   네이버처럼 viewport 의 시군구만 lazy-fetch.  33MB → 44KB/시군구.
//   sigCode (5 digits) 기반.  per-sigungu cache.
// L-naver-2026legalunion1 (2026-04-26): 법정동 endpoint 로 전환.
//   서버에서 turf.union 으로 같은 법정동의 행정동들 1개 polygon merge → 클라
//   에서는 1 feature = 1 법정동.  fillOpacity 누적/공백 문제 완전 제거.
const dongChunkCache = new Map<string, GeoCollection>();
const pendingChunks = new Map<string, Promise<GeoCollection | null>>();
async function loadDongChunk(sigCode: string): Promise<GeoCollection | null> {
  if (!/^\d{5}$/.test(sigCode)) return null;
  const cached = dongChunkCache.get(sigCode);
  if (cached) return cached;
  const pending = pendingChunks.get(sigCode);
  if (pending) return pending;
  setLoadInFlight(1);
  const promise = (async () => {
    try {
      const r = await fetch(`/api/geo/legaldong/sigungu/${sigCode}`);
      if (!r.ok) return null;
      const j = (await r.json()) as GeoCollection;
      dongChunkCache.set(sigCode, j);
      return j;
    } catch {
      return null;
    } finally {
      pendingChunks.delete(sigCode);
      setLoadInFlight(-1);
    }
  })();
  pendingChunks.set(sigCode, promise);
  return promise;
}

// L-naver-2026worker2 (2026-04-26): dong GeoJSON 은 Web Worker 에서 파싱
//   + bbox 사전계산.  ~34MB JSON.parse + 1000+ feature bbox 가 메인 스레드
//   막던 문제 해결.
async function loadDong(): Promise<GeoCollection | null> {
  if (dongCache) return dongCache;
  if (pendingDong) return pendingDong;
  setLoadInFlight(1);
  pendingDong = (async () => {
    try {
      const res = await fetch(DONG_GEOJSON_URL);
      if (!res.ok) return null;
      const json = await res.json();
      // Worker 사용 가능 시 메인 스레드 분리
      if (typeof Worker !== 'undefined') {
        try {
          const w = new Worker(new URL('../workers/geojsonProcessor.ts', import.meta.url), { type: 'module' });
          const out = await new Promise<{ features: GeoFeature[] } | null>((resolve) => {
            const timeout = setTimeout(() => { resolve(null); w.terminate(); }, 15000);
            w.onmessage = (e: MessageEvent<{ features: GeoFeature[] }>) => {
              clearTimeout(timeout);
              resolve(e.data);
              w.terminate();
            };
            w.onerror = () => { clearTimeout(timeout); resolve(null); w.terminate(); };
            w.postMessage({ type: 'process', json });
          });
          if (out?.features) {
            dongCache = { type: 'FeatureCollection', features: out.features };
            return dongCache;
          }
        } catch { /* fallback to main-thread parsing */ }
      }
      dongCache = json as GeoCollection;
      return dongCache;
    } catch {
      return null;
    } finally {
      pendingDong = null;
      setLoadInFlight(-1);
    }
  })();
  return pendingDong;
}

// L-naver-2026admin-only1: unionLegalDong 제거 (행정동 단위로 변경, 묶기 안 함)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-naver-2026rbush1: R-tree spatial index for O(log N) findFeatureAt.
//   매 mousemove 마다 250개 sigungu / 1000+ dong 순차 탐색하던 것을
//   bbox-based prefilter (O(log N)) 후 정확한 point-in-polygon 만 검사.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
type RBushItem = { minX: number; minY: number; maxX: number; maxY: number; idx: number };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-naver-2026simplify1: zoom-based GeoJSON simplification (Douglas-Peucker)
//   광역 (level >= 11): tolerance 0.005 → ~10pts/feat (10x 빠른 렌더)
//   시군구 (level 8~10): tolerance 0.001 → ~30pts/feat
//   동 (level 1~7): 풀 정밀 (사용자가 가까이 보는 단계)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const simplifyCache = new Map<string, GeoFeature>();
function simplifyFeature(feat: GeoFeature, tolerance: number, cacheKey: string): GeoFeature {
  if (tolerance <= 0) return feat;
  const cached = simplifyCache.get(cacheKey);
  if (cached) return cached;
  try {
    const gjFeat = feat as unknown as GjFeature<GjPolygon | GjMP>;
    const simplified = simplify(gjFeat, { tolerance, highQuality: false });
    const out = simplified as unknown as GeoFeature;
    simplifyCache.set(cacheKey, out);
    return out;
  } catch {
    return feat;
  }
}
function toleranceForLevel(level: number): number {
  // L-naver-2026simplify2 (2026-04-26): clickfix5 disable 후 클릭 정상 동작 확인.
  //   이제 setBounds atomic 처리로 click 자체가 polygon 기반이 아니라 lockedBbox
  //   기반 → simplification 이 hit-test 영향 없음. 50m tolerance 재활성.
  //   광역/시군구는 가벼운 단순화로 렌더 빠름. 동/마커는 풀 정밀 (가까운 줌).
  if (level >= 11) return 0.0005;    // 광역 — 50m simplification
  if (level >= 8) return 0.0002;     // 시군구 — 20m
  return 0;                           // 동/마커 — 풀 정밀
}

interface KakaoPolygon { setMap: (m: unknown) => void }
interface KakaoCustomOverlay { setMap: (m: unknown) => void }
interface KakaoLatLng { getLat: () => number; getLng: () => number }
interface KakaoMouseEvent { latLng: KakaoLatLng }
interface KakaoMapLike {
  getLevel?: () => number;
  getCenter?: () => KakaoLatLng;
  setBounds?: (b: unknown, t?: number, r?: number, bo?: number, l?: number) => void;
  setLevel?: (n: number, opts?: unknown) => void;
  setCenter?: (latlng: unknown) => void;
  panTo?: (latlng: unknown) => void;
  getNode?: () => HTMLElement;
  getBounds?: () => { getSouthWest: () => KakaoLatLng; getNorthEast: () => KakaoLatLng };
}
interface KakaoEventNs {
  addListener: (t: unknown, type: string, cb: (e?: KakaoMouseEvent) => void) => void;
  removeListener?: (t: unknown, type: string, cb: (e?: KakaoMouseEvent) => void) => void;
}
interface KakaoMapsNs {
  Polygon: new (opts: Record<string, unknown>) => KakaoPolygon;
  CustomOverlay: new (opts: Record<string, unknown>) => KakaoCustomOverlay;
  LatLng: new (lat: number, lng: number) => unknown;
  LatLngBounds: new (sw?: unknown, ne?: unknown) => { extend: (latlng: unknown) => void };
  event: KakaoEventNs;
}
interface KakaoNs { maps?: KakaoMapsNs }

const FILL = '#dc2626';
const FILL_OPACITY = 0.0;  // L-naver-clear1: polygon fill 안 보임 (마커 가독성 최우선)
const STROKE = '#dc2626';
const STROKE_OPACITY = 0;  // L-naver-noborder1 (2026-04-26): 모든 줌 폴리곤 경계선 제거
const STROKE_WEIGHT = 0;

function normalizeSidoName(raw: string | undefined | null): string {
  if (!raw) return '';
  const map: Record<string, string> = {
    Seoul: '서울특별시', Busan: '부산광역시', Daegu: '대구광역시', Incheon: '인천광역시',
    Gwangju: '광주광역시', Daejeon: '대전광역시', Ulsan: '울산광역시', Sejong: '세종특별자치시',
    Gyeonggi: '경기도', 'Gangwon-do': '강원도', Gangwon: '강원도',
    Chungbuk: '충청북도', 'Chungcheongbuk-do': '충청북도',
    Chungnam: '충청남도', 'Chungcheongnam-do': '충청남도',
    Jeonbuk: '전라북도', 'Jeollabuk-do': '전라북도',
    Jeonnam: '전라남도', 'Jeollanam-do': '전라남도',
    Gyeongbuk: '경상북도', 'Gyeongsangbuk-do': '경상북도',
    Gyeongnam: '경상남도', 'Gyeongsangnam-do': '경상남도',
    Jeju: '제주특별자치도',
  };
  if (map[raw]) return map[raw];
  return raw;
}
function shortSidoName(full: string): string {
  if (!full) return '';
  if (full.startsWith('서울')) return '서울시';
  if (full.startsWith('부산')) return '부산시';
  if (full.startsWith('대구')) return '대구시';
  if (full.startsWith('인천')) return '인천시';
  if (full.startsWith('광주')) return '광주시';
  if (full.startsWith('대전')) return '대전시';
  if (full.startsWith('울산')) return '울산시';
  if (full.startsWith('세종')) return '세종시';
  if (full.startsWith('경기')) return '경기도';
  if (full.startsWith('강원')) return '강원도';
  if (full.startsWith('충청북') || full.startsWith('충북')) return '충북';
  if (full.startsWith('충청남') || full.startsWith('충남')) return '충남';
  if (full.startsWith('전라북') || full.startsWith('전북')) return '전북';
  if (full.startsWith('전라남') || full.startsWith('전남')) return '전남';
  if (full.startsWith('경상북') || full.startsWith('경북')) return '경북';
  if (full.startsWith('경상남') || full.startsWith('경남')) return '경남';
  if (full.startsWith('제주')) return '제주';
  return full;
}

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
function pointInFeature(lat: number, lng: number, feat: GeoFeature): boolean {
  const geom = feat.geometry;
  const paths: number[][][][] = geom.type === 'Polygon'
    ? [geom.coordinates as number[][][]]
    : geom.type === 'MultiPolygon' ? (geom.coordinates as number[][][][]) : [];
  for (const poly of paths) {
    const outer = poly[0];
    if (!outer) continue;
    if (pointInRing(lng, lat, outer)) {
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(lng, lat, poly[h])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
  }
  return false;
}
// L-naver-2026rbush1: features 배열을 key 로 한 WeakMap 캐시.
//   Same array → same index.  array 가 새로 생성되면 자동으로 새 index 빌드.
const findFeatureCache = new WeakMap<GeoFeature[], { tree: RBush<RBushItem> }>();
function findFeatureAt(features: GeoFeature[], lat: number, lng: number): GeoFeature | null {
  if (!features.length) return null;
  let cached = findFeatureCache.get(features);
  if (!cached) {
    const tree = new RBush<RBushItem>();
    const items: RBushItem[] = [];
    features.forEach((f, idx) => {
      const b = computeFeatureBbox(f);
      if (!b) return;
      items.push({ minX: b.west, minY: b.south, maxX: b.east, maxY: b.north, idx });
    });
    tree.load(items);
    cached = { tree };
    findFeatureCache.set(features, cached);
  }
  // O(log N) bbox query → 후보들에 한해서만 정확한 point-in-polygon
  const candidates = cached.tree.search({ minX: lng, minY: lat, maxX: lng, maxY: lat });
  for (const c of candidates) {
    const f = features[c.idx];
    if (f && pointInFeature(lat, lng, f)) return f;
  }
  return null;
}

function computeFeatureBbox(feat: GeoFeature): { west: number; south: number; east: number; north: number } | null {
  const geom = feat.geometry;
  const paths: number[][][][] = geom.type === 'Polygon'
    ? [geom.coordinates as number[][][]]
    : geom.type === 'MultiPolygon' ? (geom.coordinates as number[][][][]) : [];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
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
function multiFeatureBbox(feats: GeoFeature[]): { west: number; south: number; east: number; north: number } | null {
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

// L-naver-tooltip2 (2026-04-26): centroid label 제거 — 마우스 커서 따라가는 툴팁으로 대체.
//   makeRegionLabel + multiFeatureCentroid 함수 사용처 없음 → 삭제.

interface Props {
  map: unknown;
  listings: MapListing[];
  // G-114 (2026-05-04): serverClusters prop 제거 — 본문에서 사용 안 함.
  onClickRegion?: (name: string) => void;
  // Wave 55 (사장님 명령 2026-05-04): kakaoLevel prop 으로 외부에서 cleanup 강제.
  kakaoLevel?: number;
}

export default function AdminRegionOverlay({ map, listings, onClickRegion, kakaoLevel }: Props) {
  const polygonsRef = useRef<KakaoPolygon[]>([]);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  // Wave 55: cleanup function 외부 노출
  const cleanupRef = useRef<() => void>(() => {});
  // L-naver-2026skel2: GeoJSON inflight → store 로 push (MapLoadingIndicator 표시용)
  const setGeoLoading = useMap2026Store((s) => s.setGeoLoading);
  useEffect(() => {
    return subscribeLoading(setGeoLoading);
  }, [setGeoLoading]);
  // L-naver-2026clean1: window global hack 제거. useRef 로 closure 간 state 공유.
  const zoomingFromClickRef = useRef<boolean>(false);
  // L-naver-2026listingscentroid1 (2026-04-27): 동 클릭 시 polygon 안 매물 centroid 사용.
  //   이유: Shoelace area centroid 는 폴리곤 면적 진짜 중심 (수학적 정확).
  //   그러나 신림동처럼 관악산 산악지대까지 polygon 에 포함되면 area centroid 가
  //   산쪽으로 치우침 → 사용자가 보고 싶은 도심부 (매물 밀집) 와 어긋남.
  //   해결: polygon 안 매물 (lat,lng) 평균을 1순위, area centroid 를 fallback.
  //   useEffect 가 [map, onClickRegion] 의존이라 listings 변경마다 reset 안 됨.
  //   ref 로 최신 listings 유지 → click handler 에서 즉시 접근.
  const listingsRef = useRef<MapListing[]>(listings);
  useEffect(() => { listingsRef.current = listings; }, [listings]);


  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const kakao = (window as unknown as { kakao?: KakaoNs }).kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    const cleanup = () => {
      // L-naver-2026hardcleanup1 (2026-04-27): polygon 잔상 박멸.
      //   기존 setMap(null) 만으로는 카카오 SDK 가 다음 paint frame 에서 DOM 제거 →
      //   사용자에게 한 frame (~16ms) 잔상 보임.  더 큰 문제: setLevel(animate)
      //   진행 중에는 SVG 가 매 frame redraw 되며 stale polygon 도 같이 그려져
      //   200~300ms 동안 빨간 잔상.
      //   해결: setMap(null) 직후 polygon 의 fillOpacity/strokeOpacity 도 0 으로
      //   강제 reset → 카카오 가 next frame 에서 paint 해도 보이지 않음.
      for (const p of polygonsRef.current) {
        try {
          const polyTyped = p as unknown as { setOptions?: (o: Record<string, unknown>) => void };
          polyTyped.setOptions?.({ fillOpacity: 0, strokeOpacity: 0 });
        } catch { /*noop*/ }
        try { p.setMap(null); } catch { /*noop*/ }
      }
      for (const o of overlaysRef.current) { try { o.setMap(null); } catch { /*noop*/ } }
      polygonsRef.current = [];
      overlaysRef.current = [];
      // 커서 리셋
      try {
        const node = typeof mapInst.getNode === 'function' ? mapInst.getNode() : undefined;
        if (node) node.style.cursor = '';
      } catch { /*noop*/ }
      // L-naver-tooltip2 (2026-04-26): 폴리곤 사라지면 툴팁도 사라짐.
      // L-naver-tooltipfix1 (2026-04-26): cleanup 시 tooltip element 도 즉시 숨김.
      currentTooltipText = '';
      tooltipEl.style.display = 'none';
    };
    // Wave 55: 외부 노출
    cleanupRef.current = cleanup;

    let currentKey = '';        // 현재 표시 중인 폴리곤 key (e.g., "서울특별시", "관악구", "서초동")
    let currentLevelMode: 'sido' | 'sigungu' | 'dong' | 'none' = 'none';
    let lastClickAt = 0;
    let currentTooltipText = '';

    // L-naver-tooltip1 (2026-04-26): 마우스 커서 따라가는 툴팁 (네이버 hover 스타일).
    //   centroid label 이 폴리곤 클릭 영역 가리는 문제 해결 + 시각적으로 깔끔.
    const tooltipEl = document.createElement('div');
    // L-naver-2026a11y1: ARIA live region — screen reader 에 region 이름 announce
    tooltipEl.setAttribute('role', 'status');
    tooltipEl.setAttribute('aria-live', 'polite');
    tooltipEl.setAttribute('aria-atomic', 'true');
    tooltipEl.style.cssText = [
      'position:fixed',
      // G-95 (2026-05-04): 초기 위치를 화면 밖으로. polygon hover 이 mousemove 전에 발생하면
      //   기본 top/left 0 이라 좌측 상단 W 로고 위에 "서울시 서초구" 가 stuck. off-screen 으로 시작.
      'top:-9999px',
      'left:-9999px',
      'pointer-events:none',
      'user-select:none',
      'padding:5px 10px',
      'background:rgba(255,255,255,0.97)',
      'border:1px solid rgba(0,0,0,0.08)',
      'border-radius:14px',
      'box-shadow:0 1px 4px rgba(0,0,0,0.12)',
      'font-size:12px',
      'font-weight:600',
      'color:#1a1a1a',
      'white-space:nowrap',
      'letter-spacing:-0.2px',
      'z-index:9999',
      'display:none',
      'transform:translate(12px,12px)',  // 커서 우하단 12px 떨어진 위치
    ].join(';');
    document.body.appendChild(tooltipEl);
    const updateTooltipPosition = (e: MouseEvent) => {
      if (currentTooltipText) {
        tooltipEl.textContent = currentTooltipText;
        tooltipEl.style.left = `${e.clientX}px`;
        tooltipEl.style.top = `${e.clientY}px`;
        tooltipEl.style.display = 'inline-block';
      } else {
        tooltipEl.style.display = 'none';
      }
    };
    document.addEventListener('mousemove', updateTooltipPosition);

    /** 단일/다중 features → 시각 영역 (라벨 + 옵션) */
    // L-naver-dual1 (2026-04-26): drawRegion 에 layer 옵션 추가 (backdrop vs foreground).
    //   네이버 패턴: dong 모드 = 시군구 backdrop (light, non-clickable) + dong foreground (dark, clickable).
    type LayerOpts = {
      fillOpacityOverride?: number;
      strokeOpacityOverride?: number;
      strokeWeightOverride?: number;
      clickable?: boolean;
      isBackdrop?: boolean;  // backdrop = tooltip 갱신 안 함, click 안 함
    };
    const drawRegion = (
      feats: GeoFeature[],
      labelText: string,
      mode: 'sido' | 'sigungu' | 'dong',
      opts: LayerOpts = {},
    ) => {
      // L-naver-2026simplify1: zoom 별 polygon 단순화로 렌더링 비용 감소
      const curLevel = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 8;
      const tolerance = toleranceForLevel(curLevel);
      const renderFeats: GeoFeature[] = tolerance > 0
        ? feats.map((f) => {
            const code = String((f.properties as { code?: string }).code ?? '');
            const name = String((f.properties as { name?: string }).name ?? '');
            const cacheKey = `${code || name}:${tolerance.toFixed(4)}`;
            return simplifyFeature(f, tolerance, cacheKey);
          })
        : feats;
      const fillOp = opts.fillOpacityOverride ?? FILL_OPACITY;
      const strokeOp = opts.strokeOpacityOverride ?? STROKE_OPACITY;
      const strokeW = opts.strokeWeightOverride ?? STROKE_WEIGHT;
      const clickable = opts.clickable ?? !opts.isBackdrop;
      // L-naver-click5 (2026-04-26 night): Naver 깊은 줌인 매칭 — z8 click → z13 (5 levels).
      //   sido(13+) → 10 (z10, sigungu detail) — 3-4 levels deep
      //   sigungu(7~12) → 7 (z13, dong polygon visible) — 0-5 levels deep
      //   dong(4~6) → 3 (z17, marker close-up) — 1-3 levels deep
      // L-naver-2026clickfix12 (2026-04-26): 사용자 피드백 "동 폴리곤 클릭하면 바로 동그라미 마커로".
      //   dong target 4 → 3 으로 변경 + clickfix11 의 +1 보정 제거.  이제 dong 클릭 = 마커 모드 직행.
      // L-naver-2026clickfix13 (2026-04-26): dong target 3 → 4 (사용자 피드백 한 단계 덜).
      //   dong 클릭 후 마커 모드 진입 시 너무 확대됐다는 피드백.  level 4 = 마커 + dong 폴리곤
      //   동시 표시 (네이버 z16 동일).
      const targetLevel = mode === 'sido' ? 10 : mode === 'sigungu' ? 7 : 4;

      // L-naver-2026clickfix4 (2026-04-26): bbox 를 onClick 등록 시점에 미리 계산해
      //   closure 에 immutable 하게 캡처.  나중에 feats 가 어떤 이유로 mutate/share
      //   되어도 click 시 panTo 좌표는 등록 당시 그대로.
      // L-naver-2026center2 (2026-04-27): MultiPolygon 가장 큰 piece + 진짜 면적-가중 centroid.
      //   기존 (center1): 단순 vertex 평균 → 산악지대(관악산 등) 포함된 동에서 산쪽 편향.
      //   개선 (center2):
      //     ① Shoelace formula 면적-가중 centroid 사용 (vertex 분포 무관, 면적 진짜 중심).
      //     ② closed ring 마지막 점이 첫 점과 같으니 length-1 만큼만 iterate.
      //     ③ MultiPolygon 의 piece 중 면적 최대 → 그 piece 의 area centroid.
      //   결과: 신림동 같은 산악 동에서도 도심부 (인구 밀집) 좌표 ≈ 진짜 area centroid.
      const lockedBbox = multiFeatureBbox(feats);
      const lockedCenter = (() => {
        let bestArea = -1;
        let bestCx = 0, bestCy = 0;
        for (const f of feats) {
          const geom = f.geometry;
          const polys = geom.type === 'Polygon'
            ? [geom.coordinates as number[][][]]
            : geom.type === 'MultiPolygon' ? (geom.coordinates as number[][][][]) : [];
          for (const poly of polys) {
            const ring = poly[0];
            if (!ring || ring.length < 4) continue;
            // L-naver-2026center2: Shoelace area-weighted centroid.
            //   Cx = (1/6A) * Σ (xi+xi+1)(xi*yi+1 - xi+1*yi)
            //   Cy = (1/6A) * Σ (yi+yi+1)(xi*yi+1 - xi+1*yi)
            //   A  = (1/2)  * Σ (xi*yi+1 - xi+1*yi)
            const n = ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1]
              ? ring.length - 1
              : ring.length;
            let signedArea = 0, cx = 0, cy = 0;
            for (let i = 0; i < n; i++) {
              const [xi, yi] = ring[i];
              const [xj, yj] = ring[(i + 1) % n];
              const cross = xi * yj - xj * yi;
              signedArea += cross;
              cx += (xi + xj) * cross;
              cy += (yi + yj) * cross;
            }
            const area = Math.abs(signedArea) / 2;
            if (area > 0 && area > bestArea) {
              bestArea = area;
              const factor = 1 / (3 * signedArea);
              bestCx = cx * factor;
              bestCy = cy * factor;
            }
          }
        }
        return bestArea > 0 ? { cy: bestCy, cx: bestCx } : null;
      })();
      const lockedLabelText = labelText;
      const lockedFeatNames = feats.map((f) => String((f.properties as { name?: string }).name ?? '?')).join(',');
      const lockedFeatCodes = feats.map((f) => String((f.properties as { code?: string }).code ?? '?')).join(',');

      const onClick = () => {
        // L-naver-clickfix2 + 2026clickfix4: pre-locked bbox 로 panTo + setLevel.
        lastClickAt = Date.now();
        zoomingFromClickRef.current = true;
        // L-naver-2026noresidual1 (2026-04-26): polygon 잔상 제거 fix.
        cleanup();
        currentKey = '';
        // L-naver-2026stuckfix1 (2026-04-26): zoomingFromClickRef stuck fallback.
        //   idle 이벤트가 어떤 이유로든 fire 안 되면 ref 가 영구 stuck → mousemove 영구 차단.
        //   1500ms 후 강제 reset (idle 이벤트가 빨리 fire 되면 onIdle 이 먼저 reset).
        setTimeout(() => { zoomingFromClickRef.current = false; }, 1500);
        const performZoom = () => {
          try {
            const curLv = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 0;
            // L-mapfix-2026-05-02 (사장님 명령 — "섬세하지 못하게 확대"):
            //   이전: targetLevel 까지 한 번에 점프 (sido z14→z10 = 4단계 점프).
            //   사용자가 "원하는 위치에 매물 찾아가기 힘들다" 피드백.
            //   해결: 한 번 클릭 = 최대 2 단계만 줌인 (네이버 부동산과 동일 패턴).
            //   더 가까이 가려면 사용자가 다시 클릭 → 점진적 진입.
            //   targetLevel 보다는 더 가까이 안 가도록 클램프.
            // L-polygon-zoom2 (사장님 명령 2026-05-02): STEP=4 — 한 방에 확실히 마커 zone.
            //   level 7 (z13, dong polygon 임계) → finalLv 3 (z17 마커 zone 안전 진입).
            //   targetLevel 보다는 더 가까이 안 가도록 클램프 유지.
            const STEP = 4;
            const finalLv = curLv > 0
              ? Math.max(targetLevel, curLv - STEP)
              : targetLevel;
            const bbox = lockedBbox;
            // L-naver-2026listingscentroid1 (2026-04-27): polygon 안 매물 centroid 1순위.
            //   동 클릭 시 사용자가 보고 싶은 곳 = 매물 밀집 지역 (도심부).
            //   feats 안에 매물 N개 있으면 그 lat/lng 평균 (자연스럽게 도심 중심).
            //   매물 5개 미만이면 area centroid (lockedCenter) → bbox 중심 순으로 fallback.
            //   이걸 하면 신림동 같은 산악 polygon 도 매물 분포 따라 도심 자동 이동.
            let listingsCx: number | null = null;
            let listingsCy: number | null = null;
            if (mode === 'dong' || mode === 'sigungu') {
              const cur = listingsRef.current;
              if (Array.isArray(cur) && cur.length > 0 && bbox) {
                let sumLat = 0, sumLng = 0, count = 0;
                for (const l of cur) {
                  if (l.lat == null || l.lng == null) continue;
                  // bbox 빠른 prefilter → 그 후 정확한 point-in-polygon
                  if (l.lat < bbox.south || l.lat > bbox.north) continue;
                  if (l.lng < bbox.west || l.lng > bbox.east) continue;
                  let inside = false;
                  for (const f of feats) {
                    if (pointInFeature(l.lat, l.lng, f)) { inside = true; break; }
                  }
                  if (inside) { sumLat += l.lat; sumLng += l.lng; count++; }
                }
                if (count >= 5) {
                  listingsCy = sumLat / count;
                  listingsCx = sumLng / count;
                }
              }
            }
            // 우선순위: ① listings centroid (≥5 매물) ② area centroid ③ bbox center
            const cy = listingsCy != null ? listingsCy
              : (lockedCenter ? lockedCenter.cy : (bbox ? (bbox.south + bbox.north) / 2 : null));
            const cx = listingsCx != null ? listingsCx
              : (lockedCenter ? lockedCenter.cx : (bbox ? (bbox.west + bbox.east) / 2 : null));
            // L-naver-2026clickdiag1: click handler 진단 — Sentry breadcrumb + dev console.
            //   사용자 reproduction (관악구 클릭 → 서초/일산) 디버깅 위해 어떤 polygon
            //   의 onClick 이 어떤 좌표로 panTo 했는지 추적.
            try {
              const Sentry = (window as unknown as { Sentry?: { addBreadcrumb?: (b: unknown) => void; startSpan?: (opts: unknown, cb: () => unknown) => unknown } }).Sentry;
              // L-naver-2026span1: Sentry custom span — click→zoom 측정 (UI perf 모니터링)
              if (Sentry?.startSpan) {
                try { Sentry.startSpan({ name: 'map.click.zoom', op: 'ui.click' }, () => undefined); } catch { /*noop*/ }
              }
              if (Sentry?.addBreadcrumb) {
                Sentry.addBreadcrumb({
                  category: 'map.click',
                  message: `${lockedLabelText} (${lockedFeatNames}) → (${cy?.toFixed(4)},${cx?.toFixed(4)}) lv ${curLv}→${finalLv}`,
                  level: 'info',
                  data: { lockedLabelText, mode, cy, cx, curLv, finalLv, lockedFeatNames, lockedFeatCodes },
                });
              }
              // L-naver-2026prodclean1: production console.log 제거.  Sentry breadcrumb
              //   (위쪽 addBreadcrumb 콜) 만 남겨서 issue tracking 은 유지.
            } catch { /*noop*/ }
            // L-naver-2026atomicbounds1 (2026-04-27): setBounds 단일 호출 atomic.
            //   기존 시도들의 실패:
            //     · setCenter+setLevel(animate:true): race → 위치 부정확.
            //     · setLevel(no animate)+panTo: 줌 즉시변경 후 위치 미끄러짐 → 사이드 빠짐.
            //     · panTo+setLevel(animate:true) 동시: race → 위치 못 찾음.
            //   해결: setBounds 한 번 호출 → SDK 가 zoom+center 동시 보간 → race 원천 차단.
            //   bounds 크기를 finalLv 의 viewport 와 일치시켜 zoom 결과 정확히 finalLv.
            // L-naver-2026flyto1 (2026-04-27): 자체 RAF cinematic flyTo.
            //   Kakao SDK 의 panTo+setLevel 동시 호출은 race / 시퀀셜은 끊김 → 자체 보간으로 해결.
            //   requestAnimationFrame + easeInOutCubic + 정수 level 단계 변화 → 구글맵 flyTo 수준.
            if (cy != null && cx != null
                && typeof mapInst.getCenter === 'function'
                && typeof mapInst.setCenter === 'function'
                && typeof mapInst.setLevel === 'function') {
              try {
                kakaoFlyTo(
                  mapInst as Parameters<typeof kakaoFlyTo>[0],
                  maps.LatLng,
                  cy, cx, finalLv,
                );
              } catch {
                // 폴백
                mapInst.setCenter(new maps.LatLng(cy, cx));
                mapInst.setLevel(finalLv, { animate: false });
              }
            } else if (typeof mapInst.setLevel === 'function') {
              mapInst.setLevel(finalLv, { animate: false });
            }
          } catch (err) {
            const Sentry = (window as unknown as { Sentry?: { captureException?: (e: unknown) => void } }).Sentry;
            if (Sentry?.captureException) Sentry.captureException(err);
          }
        };
        // L-naver-2026noVT1 (2026-04-27): View Transitions API 제거.
        //   사용자 피드백 "동 폴리곤 클릭 후 빨간 배경 잔상 딜레이".
        //   원인: docVt.startViewTransition() 의 native cross-fade 가 cleanup 직후
        //   사라진 polygon 의 DOM snapshot 을 200~300ms 동안 fade out → 빨간 잔상.
        //   해결: VT 우회, performZoom 즉시 실행 → cleanup 즉시 반영.
        performZoom();
        onClickRegion?.(lockedLabelText);
      };

      // pointer 커서 핸들러 (지도 컨테이너에 cursor 설정)
      // L-naver-sidoclick2: hover 시 해당 polygon 의 라벨로 tooltip 갱신.
      //   광역 모드에서 25개 sigungu 동시 표시 시 hover 따라가는 라벨이 필수.
      const mapNode = typeof mapInst.getNode === 'function' ? mapInst.getNode() : undefined;
      const onPolyMouseOver = () => {
        if (mapNode) mapNode.style.cursor = 'pointer';
        if (!opts.isBackdrop) {
          // G-107 (2026-05-04): 즉시 display 활성화 X — updateTooltipPosition 의 mousemove
          //   이벤트가 다음 frame 에 좌표 갱신하면서 자연스럽게 표시. 이전엔 마우스 좌표
          //   설정 전에 display=inline-block 하면서 (0,0) 또는 마지막 위치에 stuck.
          currentTooltipText = labelText;
          tooltipEl.textContent = labelText;
        }
      };
      const onPolyMouseOut = () => {
        if (mapNode) mapNode.style.cursor = '';
        // G-107: polygon 떠나면 tooltip 즉시 숨김. updateTooltipPosition 이 다음
        //   mousemove 에서 재평가.
        currentTooltipText = '';
        tooltipEl.style.display = 'none';
      };
      // 모든 feature 그리기
      // L-naver-poly1 (2026-04-26): 관악구 폴리곤이 남쪽 절반만 그려지는 버그 픽스.
      //   southkorea-maps 의 ring 이 CW (역방향) 인데 Kakao Polygon 렌더링 시
      //   비정상 fill 발생. signedArea > 0 → CW → reverse() 로 CCW 전환.
      const ensureCCW = (ring: number[][]): number[][] => {
        let area = 0;
        for (let i = 0; i < ring.length - 1; i++) {
          area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
        }
        return area > 0 ? [...ring].reverse() : ring;
      };
      // L-naver-2026hovergroup1 (2026-04-26): 같은 drawRegion 호출에서 만든 polygon 들을
      //   group 으로 묶어서 hover 시 모두 동시에 boost.  사용자 피드백:
      //   신림동 = 2 piece MultiPolygon → cursor 가 있는 piece 만 진해지고 다른 piece
      //   는 base opacity → 시각적 분리.  group all-or-none boost 으로 해결.
      const groupPolys: Array<{ setOptions?: (o: Record<string, unknown>) => void }> = [];
      const baseFill = fillOp;
      const hoverFill = Math.min(0.40, fillOp * 2.5 + 0.05);
      const setGroupFill = (op: number) => {
        for (const p of groupPolys) {
          try { p.setOptions?.({ fillOpacity: op }); } catch { /*noop*/ }
        }
      };
      for (const feat of renderFeats) {
        const geom = feat.geometry;
        const paths: number[][][][] = geom.type === 'Polygon'
          ? [geom.coordinates as number[][][]]
          : geom.type === 'MultiPolygon' ? (geom.coordinates as number[][][][]) : [];
        for (const polyCoords of paths) {
          const rawOuter = polyCoords[0];
          if (!rawOuter) continue;
          const outer = ensureCCW(rawOuter);
          const path = outer.map(([lng, lat]) => new maps.LatLng(lat, lng));
          try {
            const polygon = new maps.Polygon({
              path,
              strokeWeight: strokeW,
              strokeColor: STROKE,
              strokeOpacity: strokeOp,
              fillColor: FILL,
              fillOpacity: fillOp,
              clickable,
            });
            const polyTyped = polygon as unknown as { setOptions?: (o: Record<string, unknown>) => void };
            groupPolys.push(polyTyped);
            if (clickable) {
              // L-naver-2026hovergroup1: hover 시 group 의 모든 polygon 함께 boost.
              //   MultiPolygon piece 끼리 같이 진해짐 → 시각적 통일.
              const onPolyMouseOverGroup = () => {
                onPolyMouseOver();
                setGroupFill(hoverFill);
              };
              const onPolyMouseOutGroup = () => {
                onPolyMouseOut();
                setGroupFill(baseFill);
              };
              try { maps.event.addListener(polygon as unknown, 'click', onClick); } catch { /*noop*/ }
              try { maps.event.addListener(polygon as unknown, 'mouseover', onPolyMouseOverGroup); } catch { /*noop*/ }
              try { maps.event.addListener(polygon as unknown, 'mouseout', onPolyMouseOutGroup); } catch { /*noop*/ }
            }
            polygon.setMap(map);
            polygonsRef.current.push(polygon);
          } catch (e) { console.error('[AdminPoly] create fail', e); }
        }
      }
      // L-naver-tooltip1 (2026-04-26): 라벨을 폴리곤 centroid 가 아닌 마우스 커서 따라가는
      //   툴팁으로 변경.  centroid label 이 폴리곤 클릭 영역을 가려 클릭 무반응 문제 해결.
      //   사용자 요청 — 네이버처럼 hover 시 커서 옆에 심플하게 표시.
      // L-naver-dual1 (2026-04-26): backdrop 은 tooltip 갱신 안 함 (foreground 만 표시).
      // L-naver-tooltipfix1 (2026-04-26): currentTooltipText 변경 후 즉시 tooltip
      //   element textContent 도 강제 갱신.  기존 버그: 클릭+setLevel 직후 커서가
      //   정지하면 mousemove 안 터져서 tooltipEl 가 이전 라벨 ("관악구") 그대로
      //   고정되어 폴리곤은 새 sigungu (서초/하남) 인데 라벨만 관악구로 stuck.
      if (!opts.isBackdrop) {
        // G-107 (2026-05-04): setLabel 에서 직접 display 활성화 X — onPolyMouseOver 후
        //   다음 mousemove 에서만 tooltip 표시. 이전 위치 stuck 결함 방지.
        currentTooltipText = labelText;
        tooltipEl.textContent = labelText;
      }
    };

    /** 마우스 위치(또는 viewport 중심) 좌표를 받아 폴리곤 갱신 */
    const updateAt = async (lat: number, lng: number) => {
      const level = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;
      let mode: 'sido' | 'sigungu' | 'dong' | 'none' = 'none';
      // L-naver-zoom7 (2026-04-26): 사용자 라이브 비교 2회차 — 더 zoom-out 으로 sigungu 확장.
      //   네이버 z13 광역 = 관악구 전체 (sigungu).  WISHES level 6 (사용자 view) 도 sigungu 여야 함.
      //   sido: level >= 13 (z7-)
      //   sigungu: level 6~12 (z8~z14) — 광역 + 시군구 zoom 까지 sigungu polygon
      //   dong: level 4~5 (z15~z16) — 가까운 줌에서만 dong dual layer
      //   markers: level 1~3 (z17~z19)
      // L-naver-hier1 (2026-04-26): 4단계 hierarchy (사용자 요구).
      //   광역(z11+) = 시도, 시군구 줌(z8~10) = 시군구, 동 줌(z1~7) = 동만.
      // L-naver-2026nopolymarker1 (2026-04-26): 사용자 피드백 "동 폴리곤 클릭 이후
      //   폴리곤 배경 보기 안 좋다" — 마커 zoom (level <= 4) 에서는 polygon 안 그림.
      //   level 5~7 = dong polygon, level 1~4 = 마커만.
      // L-polygon-cutoff2 (사장님 명령 2026-05-02 — 한 번 더):
      //   기존: level >= 6 (z14 까지) dong → 사장님 z14에도 폴리곤 보임 신고.
      //   수정: level >= 7 (z13 까지) 만 dong → z14 부터 마커 zone.
      //   사장님 명시: "폴리곤은 z13까지만 하고 14부터는 동그라미 마커로 표시"
      if (level >= 11) mode = 'sido';
      else if (level >= 8) mode = 'sigungu';
      else if (level >= 7) mode = 'dong';
      // L-naver-cleanup1 (2026-04-26): mode 전환 즉시 unconditional cleanup.
      //   기존 버그: dong→sigungu 전환 시 sigData/feat null 로 early return 되면 이전
      //   dong polygon 잔류 → sigungu(0.15) + dong(0.15) 겹쳐 0.30 짙은 영역 (서울대 일대 보라색).
      //   fix: mode 가 변하면 어떤 분기로 가든 무조건 먼저 cleanup.
      if (currentLevelMode !== mode) {
        cleanup();
        currentKey = '';
        currentLevelMode = mode;
      }
      // L-naver-2026forcedcleanup1 (Wave 54, 사장님 명령 2026-05-04 7장 스크린샷):
      //   z16 (level 4) 진입 시 mode='none' 인데 polygon 잔존 (사장님 발견).
      //   원인: idle event timing race + zoomingFromClickRef 가드로 cleanup 누락.
      //   fix: mode='none' 인데 polygon 있으면 무조건 cleanup (currentLevelMode 무시).
      //   I-POLY-1 (z14+ 폴리곤 X) 강제 보장.
      if (mode === 'none') {
        if (polygonsRef.current.length > 0) cleanup();
        currentLevelMode = 'none';
        currentKey = '';
        return;
      }

      // 라벨 prefix 계산 (시도/구 이름)
      // L-naver-sidoclick2 (2026-04-26): 광역에서 sigungu 들을 직접 그리기 위해
      //   sido 모드에서도 sigData 미리 로드.
      const sidoData = await loadSido();
      const sigData = await loadSigungu();
      // L-naver-2026chunk1 (2026-04-26): dong 모드에서만 chunk 로드, cursor 의 sigungu 만.
      //   기존 33MB full → 시군구별 ~50KB chunk.  사용자 영향 큼 (모바일 데이터/속도).
      let dongData: GeoCollection | null = null;
      if (mode === 'dong' && sigData?.features) {
        const cursorSig = findFeatureAt(sigData.features, lat, lng);
        const cursorSigCode = cursorSig
          ? String((cursorSig.properties as { code?: string }).code ?? '').slice(0, 5)
          : '';
        if (cursorSigCode) {
          dongData = await loadDongChunk(cursorSigCode);
        }
      }

      let parentSido = '';
      let parentSig = '';
      if (sidoData?.features) {
        const sidoFeat = findFeatureAt(sidoData.features, lat, lng);
        if (sidoFeat) {
          parentSido = shortSidoName(normalizeSidoName(String((sidoFeat.properties as { name?: string }).name ?? '')));
        }
      }
      if (sigData?.features) {
        const sigFeat = findFeatureAt(sigData.features, lat, lng);
        if (sigFeat) {
          parentSig = String((sigFeat.properties as { name?: string }).name ?? '').trim();
        }
      }

      if (mode === 'sido') {
        // L-naver-2026hier1 (2026-04-26): 4단계 hierarchy 복원.
        //   광역 = sido 1개 (서울특별시), 시군구 = sigungu 1개 (관악구),
        //   동 = dong 1개 (신림동), 마커 = 그 이후.
        //   sidoclick2 의 25개 sigungu 동시 표시는 정확도 떨어져 사용자 피드백
        //   에 따라 원래대로 복귀.  clickfix6 으로 panTo 가 정확해진 지금은
        //   sido 클릭 → 시군구 mode 로 자연스럽게 진입 가능.
        if (!sidoData?.features) { cleanup(); currentKey = ''; return; }
        const sidoFeat = findFeatureAt(sidoData.features, lat, lng);
        if (!sidoFeat) { cleanup(); currentKey = ''; return; }
        const fullName = normalizeSidoName(String((sidoFeat.properties as { name?: string }).name ?? ''));
        const sidoShort = shortSidoName(fullName);
        const key = `sido:${fullName}`;
        if (key === currentKey && currentLevelMode === mode) return;
        cleanup();
        drawRegion([sidoFeat], sidoShort, 'sido', {
          fillOpacityOverride: 0.20,
          strokeOpacityOverride: 0,
          strokeWeightOverride: 0,
        });
        currentKey = key;
        currentLevelMode = mode;
      } else if (mode === 'sigungu') {
        // L-naver-multi5 (2026-04-26): 광역 vs 줌인 단계 한 단계 더 zoom-in 으로 미룸.
        //   네이버 z13 (광역뷰) ≈ 위시스 level 7~8.  level 7~12 = sigungu only.
        //   level 6 부터 multi-dong (줌인 후 동 표시).
        // L-naver-staleclear1 (2026-04-26): early return 시 이전 polygon 잔류 fix.
        //   기존 버그: 충청도/강원도 처럼 sigData 에 없는 지역으로 panTo 시
        //   findFeatureAt 가 null → 그냥 return 해서 이전 (예: 경기도 광주시)
        //   polygon 이 화면에 그대로 남음. fix: 항상 cleanup 후 return.
        if (!sigData?.features) { cleanup(); currentKey = ''; return; }
        const sigFeat = findFeatureAt(sigData.features, lat, lng);
        if (!sigFeat) { cleanup(); currentKey = ''; return; }
        const sigName = String((sigFeat.properties as { name?: string }).name ?? '').trim();
        const sigLabel = parentSido ? `${parentSido} ${sigName}` : sigName;

        // L-naver-hier1: sigungu 모드 = 마우스 위 시군구 1개만 (multi-dong path 우회).
        {
          const key = `sig-only:${parentSido}:${sigName}`;
          if (key === currentKey && currentLevelMode === mode) return;
          cleanup();
          drawRegion([sigFeat], sigLabel, 'sigungu', {
            fillOpacityOverride: 0.20,    // L-naver-hier5: 더 진하게 (기존 색상)
            strokeOpacityOverride: 0,
            strokeWeightOverride: 0,
          });
          currentKey = key;
          currentLevelMode = mode;
          return;
        }

      } else if (mode === 'dong') {
        // L-naver-2026legalunion1 (2026-04-26): 서버 union 으로 1 feature = 1 법정동.
        // L-naver-2026nobackdrop1 (2026-04-26): backdrop 제거.
        //   사용자 피드백: 신림동만 진하게 + 봉천동/남현동 backdrop(0.15) 깔리니
        //   "왜 신림동이 두 개로 나뉘냐" 시각적 혼란.
        //   union 으로 신림동 자체가 한 덩어리 → backdrop 역할 사라짐.
        //   네이버 스크린샷도 hover 한 법정동만 단일 색 → 동일 동작.
        if (!dongData?.features) { cleanup(); currentKey = ''; return; }
        const feat = findFeatureAt(dongData.features, lat, lng);
        if (!feat) { cleanup(); currentKey = ''; return; }
        // 법정동 endpoint 응답은 properties.name 이 이미 법정동명 (e.g. 신림동).
        const legalName = String((feat.properties as { name?: string }).name ?? '').trim();
        const key = `legaldong:${parentSido}:${parentSig}:${legalName}`;
        if (key === currentKey && currentLevelMode === mode) return;
        cleanup();
        const parts = [parentSido, parentSig, legalName].filter(Boolean);
        const isMarkerZoom = level <= 4;
        // foreground only: union 된 법정동 1 feature (진하게).  backdrop 제거.
        drawRegion([feat], parts.join(' '), 'dong', {
          fillOpacityOverride: isMarkerZoom ? 0.04 : 0.20,
          strokeOpacityOverride: 0,
          strokeWeightOverride: 0,
        });
        currentKey = key;
        currentLevelMode = mode;
      }
    };

    // 초기 렌더 (viewport 중심)
    const renderAtCenter = async () => {
      const center = typeof mapInst.getCenter === 'function' ? mapInst.getCenter() : null;
      if (!center) return;
      await updateAt(center.getLat(), center.getLng());
    };
    void renderAtCenter();

    // 마우스 이동 → 폴리곤 갱신 (모든 zoom 레벨)
    // L-naver-click4 (2026-04-26): 클릭 후 idle 이벤트 fire 전까지 mousemove 완전 차단.
    //   기존: 600ms timer 만 → 줌 애니메이션이 600ms 넘게 걸리거나 cursor 가
    //   stale lat/lng 으로 mousemove 발화 시 잘못된 polygon (예: 관악 클릭 후 서초동) 그려짐.
    //   해결: zoomingFromClick 플래그 → idle 이벤트로만 해제.
    // L-naver-2026clean1 + 2026raf1: useRef 로 zoomingFromClick 공유 + rAF throttle.
    //   매 mousemove (60Hz) updateAt 즉시 호출 대신 rAF 로 paint 타이밍 동기화.
    //   60fps 보장 + 같은 frame 안 다중 mousemove 는 마지막 좌표만 사용.
    let pendingMoveLat = 0;
    let pendingMoveLng = 0;
    let pendingFrame = 0;
    const flushMove = () => {
      pendingFrame = 0;
      if (zoomingFromClickRef.current) return;
      void updateAt(pendingMoveLat, pendingMoveLng);
    };
    const onMouseMove = (e?: KakaoMouseEvent) => {
      if (!e?.latLng) return;
      if (zoomingFromClickRef.current) return;  // 클릭 줌 진행 중 → idle 까지 대기
      if (Date.now() - lastClickAt < 600) return;  // backup timer
      pendingMoveLat = e.latLng.getLat();
      pendingMoveLng = e.latLng.getLng();
      if (pendingFrame === 0 && typeof window.requestAnimationFrame === 'function') {
        pendingFrame = window.requestAnimationFrame(flushMove);
      } else if (pendingFrame === 0) {
        flushMove();
      }
    };
    try { maps.event.addListener(mapInst as unknown, 'mousemove', onMouseMove); } catch { /*noop*/ }

    // zoom/idle 시에도 갱신 (viewport 중심 기준)
    // L-naver-2026zoomguard1 (2026-04-27): onZoom 에 zoomingFromClickRef 가드 추가.
    //   기존: 클릭 → setLevel({animate:true}) 진행 중 zoom_changed 이벤트 fire
    //   → renderAtCenter() 호출 → 중간 zoom level 기준 polygon 그려짐 → 잔상.
    //   해결: 클릭 줌 진행 중에는 onZoom skip. idle 도달 시점에만 renderAtCenter.
    const onIdle = () => { zoomingFromClickRef.current = false; void renderAtCenter(); };
    const onZoom = () => {
      if (zoomingFromClickRef.current) return;  // 클릭 줌 진행 중 → skip
      void renderAtCenter();
    };
    try { maps.event.addListener(mapInst as unknown, 'idle', onIdle); } catch { /*noop*/ }
    try { maps.event.addListener(mapInst as unknown, 'zoom_changed', onZoom); } catch { /*noop*/ }

    return () => {
      // L-naver-2026raf1: pending rAF 취소
      try {
        if (pendingFrame !== 0 && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(pendingFrame);
        }
      } catch { /*noop*/ }
      try {
        if (maps.event.removeListener) {
          maps.event.removeListener(mapInst as unknown, 'mousemove', onMouseMove);
          maps.event.removeListener(mapInst as unknown, 'idle', onIdle);
          maps.event.removeListener(mapInst as unknown, 'zoom_changed', onZoom);
        }
      } catch { /*noop*/ }
      try { document.removeEventListener('mousemove', updateTooltipPosition); } catch { /*noop*/ }
      try { tooltipEl.remove(); } catch { /*noop*/ }
      cleanup();
    };
  }, [map, onClickRegion]);

  // Wave 55 (사장님 명령 2026-05-04): kakaoLevel watch — level<=6 (z14+) 즉시 cleanup
  //   Wave 54 fix 가 updateAt 호출 안 되어 무효 → 이 effect 가 React state 변경 시 발화.
  //   I-POLY-1 강제: z14+ 폴리곤 0.
  useEffect(() => {
    if (typeof kakaoLevel !== 'number') return;
    if (kakaoLevel <= 6) cleanupRef.current();
  }, [kakaoLevel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = (typeof window.requestIdleCallback === 'function')
      ? window.requestIdleCallback(() => { void loadSigungu(); })
      : window.setTimeout(() => { void loadSigungu(); }, 2000);
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
