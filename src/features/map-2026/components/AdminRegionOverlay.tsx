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
import { adminToLegalDong } from '@/features/map-2026/lib/legalDongMap';
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

// L-naver-precise2 (2026-04-26): turf union 임시 비활성. null 반환해 caller 가
//   feats 전체를 stack 으로 그림 (정밀 데이터로도 충분히 깔끔).
function unionLegalDong(_sigCode: string, _legalName: string, _feats: GeoFeature[]): GeoFeature | null {
  return null;
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

// L-naver-tooltip2 (2026-04-26): centroid label 제거 — 마우스 커서 따라가는 툴팁으로 대체.
//   makeRegionLabel + multiFeatureCentroid 함수 사용처 없음 → 삭제.

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
      // 커서 리셋
      try {
        const node = typeof mapInst.getNode === 'function' ? mapInst.getNode() : undefined;
        if (node) node.style.cursor = '';
      } catch { /*noop*/ }
      // L-naver-tooltip2 (2026-04-26): 폴리곤 사라지면 툴팁도 사라짐.
      currentTooltipText = '';
    };

    let currentKey = '';        // 현재 표시 중인 폴리곤 key (e.g., "서울특별시", "관악구", "서초동")
    let currentLevelMode: 'sido' | 'sigungu' | 'dong' | 'none' = 'none';
    let lastClickAt = 0;
    let currentTooltipText = '';

    // L-naver-tooltip1 (2026-04-26): 마우스 커서 따라가는 툴팁 (네이버 hover 스타일).
    //   centroid label 이 폴리곤 클릭 영역 가리는 문제 해결 + 시각적으로 깔끔.
    const tooltipEl = document.createElement('div');
    tooltipEl.style.cssText = [
      'position:fixed',
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
      const fillOp = opts.fillOpacityOverride ?? FILL_OPACITY;
      const strokeOp = opts.strokeOpacityOverride ?? STROKE_OPACITY;
      const strokeW = opts.strokeWeightOverride ?? STROKE_WEIGHT;
      const clickable = opts.clickable ?? !opts.isBackdrop;
      // L-naver-click5 (2026-04-26 night): Naver 깊은 줌인 매칭 — z8 click → z13 (5 levels).
      //   sido(13+) → 9 (z11, sigungu detail) — 4-5 levels deep
      //   sigungu(7~12) → 6 (z14, dong polygon visible) — 2-6 levels deep
      //   dong(4~6) → 3 (z17, marker close-up) — 1-3 levels deep
      const targetLevel = mode === 'sido' ? 10 : mode === 'sigungu' ? 7 : 4;  // L-naver-clickzoom1: 한 단계 zoom-out (사용자 피드백 — 너무 zoom-in 됐었음)

      const onClick = () => {
        // L-naver-smooth4 (2026-04-26): panTo + setLevel({animate: true}) 정상 옵션.
        //   (이전 {animate:{duration:400}} 은 Kakao API 비표준 → 동작 unstable.)
        lastClickAt = Date.now();
        try {
          const bbox = multiFeatureBbox(feats);
          const curLv = typeof mapInst.getLevel === 'function' ? mapInst.getLevel() : 0;
          const finalLv = (curLv > 0 && curLv <= targetLevel) ? Math.max(1, targetLevel - 1) : targetLevel;
          // 진단 log — 클릭된 region 의 정확한 label + bbox 출력
          console.log('[click]', { label: labelText, mode, curLv, finalLv, bbox });
          if (bbox) {
            const cy = (bbox.south + bbox.north) / 2;
            const cx = (bbox.west + bbox.east) / 2;
            if (typeof mapInst.panTo === 'function') {
              mapInst.panTo(new maps.LatLng(cy, cx));
            }
          }
          if (typeof mapInst.setLevel === 'function') {
            mapInst.setLevel(finalLv, { animate: true });
          }
        } catch (e) { console.error('[click] error:', e); }
        onClickRegion?.(labelText);
      };

      // pointer 커서 핸들러 (지도 컨테이너에 cursor 설정)
      const mapNode = typeof mapInst.getNode === 'function' ? mapInst.getNode() : undefined;
      const onPolyMouseOver = () => {
        if (mapNode) mapNode.style.cursor = 'pointer';
      };
      const onPolyMouseOut = () => {
        if (mapNode) mapNode.style.cursor = '';
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
      for (const feat of feats) {
        const geom = feat.geometry;
        const paths: number[][][][] = geom.type === 'Polygon'
          ? [geom.coordinates as number[][][]]
          : geom.type === 'MultiPolygon' ? (geom.coordinates as number[][][][]) : [];
        for (const polyCoords of paths) {
          const rawOuter = polyCoords[0];
          if (!rawOuter) continue;
          const outer = ensureCCW(rawOuter);
          const path = outer.map(([lng, lat]) => new maps.LatLng(lat, lng));
          // L-naver-poly1: 진단 로그 — 실제 kakao 에 들어간 path 길이 + 처음/끝 점 확인.
          console.log('[AdminPoly]', mode, labelText, 'pts=', path.length,
            'first=', rawOuter[0], 'last=', rawOuter[rawOuter.length - 1]);
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
            if (clickable) {
              try { maps.event.addListener(polygon as unknown, 'click', onClick); } catch { /*noop*/ }
              try { maps.event.addListener(polygon as unknown, 'mouseover', onPolyMouseOver); } catch { /*noop*/ }
              try { maps.event.addListener(polygon as unknown, 'mouseout', onPolyMouseOut); } catch { /*noop*/ }
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
      if (!opts.isBackdrop) currentTooltipText = labelText;
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
      if (level >= 11) mode = 'sido';
      else if (level >= 8) mode = 'sigungu';
      else if (level >= 1) mode = 'dong';
      // L-naver-cleanup1 (2026-04-26): mode 전환 즉시 unconditional cleanup.
      //   기존 버그: dong→sigungu 전환 시 sigData/feat null 로 early return 되면 이전
      //   dong polygon 잔류 → sigungu(0.15) + dong(0.15) 겹쳐 0.30 짙은 영역 (서울대 일대 보라색).
      //   fix: mode 가 변하면 어떤 분기로 가든 무조건 먼저 cleanup.
      if (currentLevelMode !== mode) {
        cleanup();
        currentKey = '';
        currentLevelMode = mode;
      }
      // level ≤ 4: 마커만, 폴리곤 클리어 (cleanup 은 위에서 이미 처리됨)
      if (mode === 'none') return;

      // 라벨 prefix 계산 (시도/구 이름)
      const sidoData = await loadSido();
      const sigData = mode !== 'sido' ? await loadSigungu() : null;
      // L-naver-multi2 (2026-04-26): sigungu 모드도 dongData 필요 (multi-dong 렌더).
      //   기존 'dong' 모드에서만 로드 → 새 multi-dong sigungu 에서 legalGroups 비어 클릭 안 됨.
      const dongData = (mode === 'dong' || mode === 'sigungu') ? await loadDong() : null;

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
        drawRegion([feat], shortSidoName(fullName), 'sido', {
          fillOpacityOverride: 0.20,    // L-naver-hier5: 더 진하게 (기존 색상)
          strokeOpacityOverride: 0,
          strokeWeightOverride: 0,
        });
        currentKey = key;
        currentLevelMode = mode;
      } else if (mode === 'sigungu') {
        // L-naver-multi5 (2026-04-26): 광역 vs 줌인 단계 한 단계 더 zoom-in 으로 미룸.
        //   네이버 z13 (광역뷰) ≈ 위시스 level 7~8.  level 7~12 = sigungu only.
        //   level 6 부터 multi-dong (줌인 후 동 표시).
        if (!sigData?.features) return;
        const sigFeat = findFeatureAt(sigData.features, lat, lng);
        if (!sigFeat) return;
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
        // L-naver-dual1 (2026-04-26): 네이버 동 모드 = 시군구 backdrop + 동 foreground 2-layer.
        //   사용자 스크린샷: 네이버는 관악구 폴리곤이 light-pink 으로 항상 표시 + 마우스 가르킨 동만 darker.
        //   기존 ONE 폴리곤 방식 → DUAL layer 로 전환.
        if (!dongData?.features) return;
        const feat = findFeatureAt(dongData.features, lat, lng);
        if (!feat) return;
        // 부모 시군구 feature (mouse 위치 기준 — sigData 에서 찾기)
        const sigParentFeat = sigData?.features ? findFeatureAt(sigData.features, lat, lng) : null;
        const rawName = String((feat.properties as { name?: string }).name ?? '').trim();
        // L-naver-legal1 (2026-04-26): 행정동 → 법정동 매핑.  네이버는 법정동 (신림·봉천·남현)
        //   기준이라 신원동·서원동·대학동 같은 행정동을 신림동으로 묶어야 함.
        const legalName = adminToLegalDong(rawName, parentSig);
        const key = `dong:${parentSido}:${parentSig}:${legalName}`;
        if (key === currentKey && currentLevelMode === mode) return;
        // 같은 법정동 모든 행정동 묶기 (신원동·서원동·대학동 → 신림동 한 덩어리)
        // L-naver-legal2 (2026-04-26): 동명 중복 시군구 필터.
        //   '중앙동' 이 관악구·동작구·성북구 등 여러 곳에 있어 단순 이름 매칭 시
        //   봉천동 polygon 이 동작구까지 확장되는 버그.  feature 가 부모 sigungu polygon
        //   안에 있는지 확인 (centroid point-in-polygon).
        // L-naver-multi4 (2026-04-26): code prefix 매칭 (point-in-polygon 보다 안정).
        const sigParentCode = sigParentFeat
          ? String((sigParentFeat.properties as { code?: string }).code ?? '').slice(0, 5)
          : '';
        const groupFeats = dongData.features.filter((f) => {
          const n = String((f.properties as { name?: string }).name ?? '').trim();
          if (adminToLegalDong(n, parentSig) !== legalName) return false;
          if (sigParentCode) {
            const c = String((f.properties as { code?: string }).code ?? '');
            if (c.length >= 5 && c.slice(0, 5) !== sigParentCode) return false;
          }
          return true;
        });
        cleanup();
        // L-naver-hier1: dong 모드 = 동 polygon 만 (sigungu backdrop 제거).
        const parts = [parentSido, parentSig, legalName].filter(Boolean);
        // L-naver-union1: turf.union 으로 행정동들을 깔끔한 1개 polygon 으로 merge.
        const grouped = groupFeats.length > 0 ? groupFeats : [feat];
        const merged = grouped.length > 1
          ? unionLegalDong(sigParentCode, legalName, grouped)
          : grouped[0];
        const renderFeats = merged ? [merged] : grouped;
        // L-naver-hier4: 시도/시군구/동 색상 통일 0.15.  마커 zoom (level <= 4) 만 옅게 0.04.
        const isMarkerZoom = level <= 4;
        drawRegion(renderFeats, parts.join(' '), 'dong', {
          fillOpacityOverride: isMarkerZoom ? 0.04 : 0.20,    // L-naver-hier5: 더 진하게
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
    const onMouseMove = (e?: KakaoMouseEvent) => {
      if (!e?.latLng) return;
      // L-naver-click3: 클릭 후 600ms 동안 mousemove 무시 (줌 애니메이션 안정화)
      if (Date.now() - lastClickAt < 600) return;
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
      try { document.removeEventListener('mousemove', updateTooltipPosition); } catch { /*noop*/ }
      try { tooltipEl.remove(); } catch { /*noop*/ }
      cleanup();
    };
  }, [map, onClickRegion]);

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
