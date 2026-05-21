'use client';

/**
 * SearchMap — /search 통합 화면 지도 패널 (P5 · 카카오맵 실통합)
 *
 * 배경: ResultsSplit 의 지도 칸은 그동안 스타일 플레이스홀더였다. 이 컴포넌트가
 *   실제 카카오맵 + 서버 사전집계 클러스터를 렌더한다.
 *
 * 설계 원칙 (지도는 과거 멈춤 v390 의 진원지 — 절대 급하게 X):
 *   · map-2026 store 에 의존하지 않는다. /search 전용 자체 완결 컴포넌트.
 *   · 검증된 KakaoMarkerLayer (kakao CustomOverlay native, overlay pool 재사용) 재사용.
 *   · /api/map/clusters (PostGIS GIST + H3 MV 사전집계) 직접 호출. payload ~10KB.
 *   · setInterval 없음. idle debounce + AbortController 로 경쟁/누수 차단.
 *   · 동기 대량 렌더 없음 — 서버 클러스터만 그린다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchClusterLayer, type SearchCluster } from './SearchClusterLayer';
import { SearchRegionLayer } from './SearchRegionLayer';
import styles from './SearchMap.module.css';

// 서울 기본 중심 (MapClient 와 동일)
const SEOUL = { lat: 37.4979, lng: 127.0276 };

// Kakao level -> zoom (20 - level). MapClient·useMapClusters 와 동일 규칙.
function levelToZoom(level: number): number {
  return Math.max(0, 20 - level);
}

interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Kakao SDK 동적 로더 — autoload=false 로 SSR 안전, 다중 호출 중복 방지.
//   MapClient.loadKakaoSdk 와 동일 패턴 (검증됨). script id 공유 -> 중복 로드 0.
function loadKakaoSdk(appkey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('no window'));
      return;
    }
    const w = window as unknown as {
      kakao?: { maps?: { load: (cb: () => void) => void; Map: unknown } };
    };
    if (w.kakao?.maps?.Map) {
      resolve();
      return;
    }
    const existing = document.getElementById('kakao-map-sdk') as HTMLScriptElement | null;
    const onScriptReady = () => {
      if (w.kakao?.maps?.load) {
        w.kakao.maps.load(() => resolve());
      } else {
        reject(new Error('kakao.maps.load unavailable'));
      }
    };
    if (existing) {
      if (w.kakao?.maps) onScriptReady();
      else existing.addEventListener('load', onScriptReady, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false&libraries=services,clusterer`;
    script.async = true;
    script.onload = onScriptReady;
    script.onerror = () => reject(new Error('Kakao SDK network error'));
    document.head.appendChild(script);
  });
}

export interface SearchMapProps {
  /** 매물 클릭 시 (단일 클러스터). 상세 모달은 P4 — 현재는 선택만. */
  onSelectListing?: (id: number) => void;
}

export function SearchMap({ onSelectListing }: SearchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<unknown>(null);
  const [kakaoMap, setKakaoMap] = useState<unknown>(null);
  const [kakaoLevel, setKakaoLevel] = useState<number>(12);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [clusters, setClusters] = useState<SearchCluster[]>([]);

  // -- 카카오 지도 초기화 --
  useEffect(() => {
    if (!containerRef.current) return;
    const envKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    const key = envKey && envKey !== '여기에_카카오_JavaScript_앱키_입력' ? envKey : '';
    const container = containerRef.current;
    let disposed = false;
    let mapInst: unknown = null;

    (async () => {
      try {
        await loadKakaoSdk(key);
        if (disposed) return;
        const kakao = (window as unknown as {
          kakao: {
            maps: {
              LatLng: new (lat: number, lng: number) => unknown;
              Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
                getBounds: () => {
                  getSouthWest: () => { getLat: () => number; getLng: () => number };
                  getNorthEast: () => { getLat: () => number; getLng: () => number };
                };
                getLevel: () => number;
                setMinLevel?: (n: number) => void;
                setMaxLevel?: (n: number) => void;
              };
              event: {
                addListener: (t: unknown, type: string, h: (...a: any[]) => void) => void;
              };
            };
          };
        }).kakao;

        const map = new kakao.maps.Map(container, {
          center: new kakao.maps.LatLng(SEOUL.lat, SEOUL.lng),
          level: 12,
        });
        mapInst = map;
        kakaoMapRef.current = map;
        setKakaoMap(map);

        try {
          map.setMinLevel?.(1);  // SW-7: 최대 줌까지 허용
          map.setMaxLevel?.(14);
        } catch { /* SDK race — skip */ }

        // idle (팬/줌 종료) 시 bbox + level 동기화 -> 클러스터 fetch 트리거
        const sync = () => {
          const b = map.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          setBbox({
            west: sw.getLng(),
            south: sw.getLat(),
            east: ne.getLng(),
            north: ne.getLat(),
          });
          setKakaoLevel(map.getLevel());
        };
        kakao.maps.event.addListener(map, 'idle', sync);
        sync(); // 초기 1회 강제 호출

        setReady(true);
      } catch (e) {
        console.warn('[SearchMap] Kakao SDK init failed:', e);
        setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      kakaoMapRef.current = null;
      setKakaoMap(null);
      if (container) {
        try { container.innerHTML = ''; } catch { /* noop */ }
      }
      void mapInst;
    };
  }, []);

  // -- 서버 클러스터 fetch --
  //   bbox/level 변경 시 debounce 120ms -> /api/map/clusters. AbortController 로
  //   경쟁 차단. 실패 시 안전하게 [] (지도 패널 블록 방지).
  useEffect(() => {
    if (!bbox) return;
    if (
      !Number.isFinite(bbox.west) || !Number.isFinite(bbox.south) ||
      !Number.isFinite(bbox.east) || !Number.isFinite(bbox.north)
    ) return;
    if (bbox.east <= bbox.west || bbox.north <= bbox.south) return;

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const zoom = levelToZoom(kakaoLevel);
        const p = new URLSearchParams();
        p.set('swLat', bbox.south.toFixed(3));
        p.set('swLng', bbox.west.toFixed(3));
        p.set('neLat', bbox.north.toFixed(3));
        p.set('neLng', bbox.east.toFixed(3));
        p.set('zoom', String(zoom));
        const res = await fetch(`/api/map/clusters?${p.toString()}`, { signal: ctrl.signal });
        if (!res.ok) {
          if (!ctrl.signal.aborted) setClusters([]);
          return;
        }
        const json = await res.json();
        if (!ctrl.signal.aborted) {
          setClusters(Array.isArray(json?.data) ? json.data : []);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[SearchMap] cluster fetch:', err);
          if (!ctrl.signal.aborted) setClusters([]);
        }
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [bbox, kakaoLevel]);

  const onClickListing = useCallback(
    (id: number) => { onSelectListing?.(id); },
    [onSelectListing],
  );

  // -- 줌 +/- 버튼 (SW-7 후속) --
  //   delta -1 = 확대(레벨 감소), +1 = 축소. setMinLevel/MaxLevel 범위는 SDK 가 클램프.
  const zoomBy = useCallback((delta: number) => {
    const m = kakaoMapRef.current as {
      getLevel?: () => number;
      setLevel?: (n: number, opts?: Record<string, unknown>) => void;
    } | null;
    if (!m?.getLevel || !m.setLevel) return;
    const next = m.getLevel() + delta;
    try { m.setLevel(next, { animate: true }); }
    catch { try { m.setLevel(next); } catch { /* noop */ } }
  }, []);

  if (failed) {
    return (
      <div className={styles.fallback}>
        <p className={styles.fallbackTitle}>지도를 불러올 수 없어요</p>
        <p className={styles.fallbackText}>잠시 후 다시 시도하거나 목록에서 매물을 확인해 보세요.</p>
      </div>
    );
  }

  return (
    <div className={styles.mapRoot}>
      <div ref={containerRef} className={styles.canvas} />
      {ready && kakaoMap && (
        <div className={styles.zoomCtl}>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={() => zoomBy(-1)}
            aria-label="확대"
          >+</button>
          <span className={styles.zoomDiv} />
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={() => zoomBy(1)}
            aria-label="축소"
          >−</button>
        </div>
      )}
      {ready && kakaoMap ? (
        <>
          {/* 줌 1~3단계 — 시·도(>=11) / 시·군·구(8~10) / 읍·면·동(6~7) 폴리곤 + 개수 */}
          <SearchRegionLayer
            map={kakaoMap}
            tier={kakaoLevel >= 11 ? 'sido' : kakaoLevel >= 8 ? 'sigungu' : 'dong'}
            active={kakaoLevel >= 6}
            level={kakaoLevel}
            bbox={bbox}
          />
          {/* 클러스터·개별 핀 — 좁은 줌 (level < 6) */}
          {kakaoLevel < 6 && (
            <SearchClusterLayer
              map={kakaoMap}
              clusters={clusters}
              onSelectListing={onClickListing}
            />
          )}
        </>
      ) : (
        <div className={styles.loading}>지도 불러오는 중…</div>
      )}
    </div>
  );
}

export default SearchMap;
