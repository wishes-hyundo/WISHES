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
import type { MapListing } from '@/features/map-2026/store';

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

interface KakaoPolygon { setMap: (m: unknown) => void }
interface KakaoCustomOverlay { setMap: (m: unknown) => void }
interface KakaoLatLng { getLat: () => number; getLng: () => number }
interface KakaoMouseEvent { latLng: KakaoLatLng }
interface KakaoMapLike {
  getLevel?: () => number;
  getCenter?: () => KakaoLatLng;
  setBounds?: (b: unknown, t?: number, r?: number, bo?: number, l?: number) => void;
  setLevel?: (n: number, opts?: unknown) => void;
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
const FILL_OPACITY = 0.15;
const STROKE = '#dc2626';
const STROKE_OPACITY = 0.7;
const STROKE_WEIGHT = 2;

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

/** 통계동 → 법정동 (서초3동 → 서초동) */
function normalizeLegalDong(name: string): string {
  if (!name) return name;
  return name.replace(/(.+?)\d+동$/, '$1동');
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
function findFeatureAt(features: GeoFeature[], lat: number, lng: number): GeoFeature | null {
  for (const f of features) {
    if (pointInFeature(lat, lng, f)) return f;
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

function multiFeatureCentroid(feats: GeoFeature[]): { lat: number; lng: number } | null {
  let lng = 0, lat = 0, n = 0;
  for (const f of feats) {
    const geom = f.geometry;
    const paths: number[][][][] = geom.type === 'Polygon'
      ? [geom.coordinates as number[][][]]
      : geom.type === 'MultiPolygon' ? (geom.coordinates as number[][][][]) : [];
    for (const poly of paths) {
      const outer = poly[0];
      if (!outer) continue;
      for (const [x, y] of outer) { lng += x; lat += y; n++; }
    }
  }
  if (n === 0) return null;
  return { lat: lat / n, lng: lng / n };
}

/** 깔끔한 라벨 — 화이트 pill, 이모지 없음, 작은 폰트 */
function makeRegionLabel(text: string): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'display:inline-block',
    'padding:5px 10px',
    'background:rgba(255,255,255,0.97)',
    'border:1px solid rgba(0,0,0,0.08)',
    'border-radius:14px',
    'box-shadow:0 1px 4px rgba(0,0,0,0.12)',
    'font-size:12px',
    'font-weight:600',
    'color:#1a1a1a',
    'white-space:nowrap',
    'pointer-events:none',
    'user-select:none',
    'letter-spacing:-0.2px',
    'font-family:inherit',
  ].join(';');
  wrapper.textContent = text;
  return wrapper;
}

interface Props {
  map: unknown;
  listings: MapListing[];
  serverClusters?: { lat: number; lng: number; count: number }[];
  onClickRegion?: (name: string) => void;
}

export default function AdminRegionOverlay({ map, onClickRegion }: Props) {
  const polygonsRef = useRef<KakaoPolygon[]>([]);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);

  useEffect(() => {
    if (!map || typeof window === 'undefined') return;
    const kakao = (window as unknown as { kakao?: KakaoNs }).kakao;
    if (!kakao?.maps) return;
    const maps = kakao.maps;
    const mapInst = map as KakaoMapLike;

    const cleanup = () => {
      for (const p of polygonsRef.current) { try { p.setMap(null); } catch { /*noop*/ } }
      for (const o of overlaysRef.current) { try { o.setMap(null); } catch { /*noop*/ } }
      polygonsRef.current = [];
      overlaysRef.current = [];
    };

    let currentKey = '';        // 현재 표시 중인 폴리곤 key (e.g., "서울특별시", "관악구", "서초동")
    let currentLevelMode: 'sido' | 'sigungu' | 'dong' | 'none' = 'none';
    let lastClickAt = 0;

    /** 단일/다중 features → 1 시각 영역 (라벨 1개) */
    const drawRegion = (feats: GeoFeature[], labelText: string, mode: 'sido' | 'sigungu' | 'dong') => {
      const bbox = multiFeatureBbox(feats);
      const onClick = () => {
        lastClickAt = Date.now();
        try {
          if (bbox && typeof mapInst.setBounds === 'function') {
            const sw = new maps.LatLng(bbox.south, bbox.west);
            const ne = new maps.LatLng(bbox.north, bbox.east);
            const bounds = new maps.LatLngBounds(sw, ne);
            mapInst.setBounds(bounds, 40, 40, 40, 40);
            // 모드별 명시적 줌 레벨 강제 — 클릭 시 항상 다음 단계로 진입 보장
            //   sido(10+) 클릭 → 8 (sigungu 폴리곤 보임)
            //   sigungu(7~9) 클릭 → 5 (dong 폴리곤 보임)
            //   dong(4~6) 클릭 → 2 (HtmlMarkerOverlay 매물 마커 보임)
            setTimeout(() => {
              try {
                if (typeof mapInst.setLevel !== 'function') return;
                if (mode === 'sido') mapInst.setLevel(8);
                else if (mode === 'sigungu') mapInst.setLevel(5);
                else if (mode === 'dong') mapInst.setLevel(2);
              } catch { /*noop*/ }
            }, 120);
          }
        } catch { /*noop*/ }
        onClickRegion?.(labelText);
      };
      // 모든 feature 그리기
      for (const feat of feats) {
        const geom = feat.geometry;
        const paths: number[][][][] = geom.type === 'Polygon'
          ? [geom.coordinates as number[][][]]
          : geom.type === 'MultiPolygon' ? (geom.coordinates as number[][][][]) : [];
        for (const polyCoords of paths) {
          const outer = polyCoords[0];
          if (!outer) continue;
          const path = outer.map(([lng, lat]) => new maps.LatLng(lat, lng));
          try {
            const polygon = new maps.Polygon({
              path,
              strokeWeight: STROKE_WEIGHT,
              strokeColor: STROKE,
              strokeOpacity: STROKE_OPACITY,
              fillColor: FILL,
              fillOpacity: FILL_OPACITY,
              clickable: true,
            });
            try { maps.event.addListener(polygon as unknown, 'click', onClick); } catch { /*noop*/ }
            polygon.setMap(map);
            polygonsRef.current.push(polygon);
          } catch { /*noop*/ }
        }
      }
      // 라벨 1개 (그룹 centroid)
      const centroid = multiFeatureCentroid(feats);
      if (centroid && labelText) {
        try {
          const label = makeRegionLabel(labelText);
          const overlay = new maps.CustomOverlay({
            position: new maps.LatLng(centroid.lat, centroid.lng),
            content: label,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 50,
            clickable: false,
          });
          overlay.setMap(map);
          overlaysRef.current.push(overlay);
        } catch { /*noop*/ }
      }
    };

    /** 마우스 위치(또는 viewport 중심) 좌표를 받아 폴리곤 갱신 */
    const updateAt = async (lat: number, lng: number) => {
      const level = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;
      let mode: 'sido' | 'sigungu' | 'dong' | 'none' = 'none';
      if (level >= 10) mode = 'sido';
      else if (level >= 7) mode = 'sigungu';
      else if (level >= 4) mode = 'dong';
      // level <= 3: 마커만, 폴리곤 클리어
      if (mode === 'none') {
        if (currentKey !== '' || currentLevelMode !== 'none') {
          cleanup();
          currentKey = '';
          currentLevelMode = 'none';
        }
        return;
      }

      // 라벨 prefix 계산 (시도/구 이름)
      const sidoData = await loadSido();
      const sigData = mode !== 'sido' ? await loadSigungu() : null;
      const dongData = mode === 'dong' ? await loadDong() : null;

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
        if (!sidoData?.features) return;
        const feat = findFeatureAt(sidoData.features, lat, lng);
        if (!feat) return;
        const fullName = normalizeSidoName(String((feat.properties as { name?: string }).name ?? ''));
        const key = `sido:${fullName}`;
        if (key === currentKey && currentLevelMode === mode) return;
        cleanup();
        drawRegion([feat], shortSidoName(fullName), 'sido');
        currentKey = key;
        currentLevelMode = mode;
      } else if (mode === 'sigungu') {
        if (!sigData?.features) return;
        const feat = findFeatureAt(sigData.features, lat, lng);
        if (!feat) return;
        const sigName = String((feat.properties as { name?: string }).name ?? '').trim();
        const key = `sig:${parentSido}:${sigName}`;
        if (key === currentKey && currentLevelMode === mode) return;
        cleanup();
        const labelText = parentSido ? `${parentSido} ${sigName}` : sigName;
        drawRegion([feat], labelText, 'sigungu');
        currentKey = key;
        currentLevelMode = mode;
      } else if (mode === 'dong') {
        // L-naver-true3 (2026-04-26 night): 동 zoom 에서 viewport 내 모든 법정동
        //   폴리곤 동시 표시 — 사용자가 동을 "선택" 할 수 있게.
        //   네이버 동일 — 구 안의 동들이 모두 보임 → 클릭하여 선택.
        if (!dongData?.features) return;
        // viewport bbox 가져오기
        const bounds = (mapInst as KakaoMapLike & { getBounds?: () => { getSouthWest:() => KakaoLatLng; getNorthEast:() => KakaoLatLng } }).getBounds?.();
        if (!bounds) return;
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const vbbox = {
          west: sw.getLng(), south: sw.getLat(),
          east: ne.getLng(), north: ne.getLat(),
        };
        // viewport 내 동들 필터
        const visibleFeats = dongData.features.filter((f) => {
          const fb = computeFeatureBbox(f);
          if (!fb) return false;
          return !(fb.east < vbbox.west || fb.west > vbbox.east ||
                   fb.north < vbbox.south || fb.south > vbbox.north);
        });
        // 법정동별 그룹핑
        const groups = new Map<string, GeoFeature[]>();
        for (const f of visibleFeats) {
          const rawName = String((f.properties as { name?: string }).name ?? '').trim();
          const legalName = normalizeLegalDong(rawName);
          if (!legalName) continue;
          if (!groups.has(legalName)) groups.set(legalName, []);
          groups.get(legalName)!.push(f);
        }
        // 그룹 단위 키 (전체 viewport 의 동 집합)
        const allLegalNames = Array.from(groups.keys()).sort().join(',');
        const key = `dong-multi:${allLegalNames}`;
        if (key === currentKey && currentLevelMode === mode) return;
        cleanup();
        for (const [legalName, feats] of groups) {
          // 각 동의 부모 시/구 이름 다시 계산 (동의 centroid 기준)
          const c = multiFeatureCentroid(feats);
          if (!c) continue;
          let parSido = '', parSig = '';
          if (sidoData?.features) {
            const sf = findFeatureAt(sidoData.features, c.lat, c.lng);
            if (sf) parSido = shortSidoName(normalizeSidoName(String((sf.properties as { name?: string }).name ?? '')));
          }
          if (sigData?.features) {
            const sf = findFeatureAt(sigData.features, c.lat, c.lng);
            if (sf) parSig = String((sf.properties as { name?: string }).name ?? '').trim();
          }
          const parts = [parSido, parSig, legalName].filter(Boolean);
          drawRegion(feats, parts.join(' '), 'dong');
        }
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

    // 마우스 이동 → 폴리곤 갱신 (sido/sigungu 단계만 — dong 단계는 viewport 전체 표시)
    const onMouseMove = (e?: KakaoMouseEvent) => {
      if (!e?.latLng) return;
      if (Date.now() - lastClickAt < 250) return;
      // dong 모드에서는 mousemove 무시 (viewport 전체 동 표시)
      const lv = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 5;
      if (lv >= 4 && lv <= 6) return;  // dong zoom range
      void updateAt(e.latLng.getLat(), e.latLng.getLng());
    };
    try { maps.event.addListener(mapInst as unknown, 'mousemove', onMouseMove); } catch { /*noop*/ }

    // zoom/idle 시에도 갱신 (viewport 중심 기준)
    const onIdle = () => { void renderAtCenter(); };
    const onZoom = () => { void renderAtCenter(); };
    try { maps.event.addListener(mapInst as unknown, 'idle', onIdle); } catch { /*noop*/ }
    try { maps.event.addListener(mapInst as unknown, 'zoom_changed', onZoom); } catch { /*noop*/ }

    return () => {
      try {
        if (maps.event.removeListener) {
          maps.event.removeListener(mapInst as unknown, 'mousemove', onMouseMove);
          maps.event.removeListener(mapInst as unknown, 'idle', onIdle);
          maps.event.removeListener(mapInst as unknown, 'zoom_changed', onZoom);
        }
      } catch { /*noop*/ }
      cleanup();
    };
  }, [map, onClickRegion]);

  // sigungu + dong 캐시 warm-up
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
