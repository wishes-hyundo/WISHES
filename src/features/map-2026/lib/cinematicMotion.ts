// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cinematic Motion — 지도 카메라 이동 프리셋 (MapLibre / Kakao 공용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { MapInstance } from '../store';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// L-naver-2026flytoBoB3 (2026-04-27): iOS sheet spring 모션 (back-out cubic-bezier)
export function kakaoFlyTo(
  mapInst: {
    getCenter: () => { getLat: () => number; getLng: () => number };
    getLevel: () => number;
    setCenter: (latlng: unknown) => void;
    setLevel: (n: number, opts?: unknown) => void;
    getNode?: () => HTMLElement | null | undefined;
  },
  LatLngCtor: new (lat: number, lng: number) => unknown,
  targetLat: number,
  targetLng: number,
  finalLevel: number,
  origin?: { x: number; y: number },
): void {
  const startLevel = mapInst.getLevel();
  const zoomDelta = startLevel - finalLevel;

  try { mapInst.setCenter(new LatLngCtor(targetLat, targetLng)); } catch { /*noop*/ }
  try { mapInst.setLevel(finalLevel, { animate: false }); } catch { /*noop*/ }

  const node = typeof mapInst.getNode === 'function' ? mapInst.getNode() : null;
  if (!node) return;

  // iOS sheet spring 효과 — back-out cubic-bezier (overshoot ~5%)
  const initScale = zoomDelta > 0 ? 0.93
                  : zoomDelta < 0 ? 1.07
                  : 0.97;

  const rect = node.getBoundingClientRect();
  const ox = origin ? `${origin.x - rect.left}px` : '50%';
  const oy = origin ? `${origin.y - rect.top}px` : '50%';

  node.style.transition = 'none';
  node.style.transformOrigin = `${ox} ${oy}`;
  node.style.transform = `scale(${initScale})`;
  node.style.opacity = '0.94';
  node.style.willChange = 'transform, opacity';
  node.style.pointerEvents = 'none';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      node.style.transition =
        'transform 620ms cubic-bezier(0.34, 1.56, 0.64, 1), ' +
        'opacity 380ms cubic-bezier(0.32, 0.72, 0, 1)';
      node.style.transform = 'scale(1)';
      node.style.opacity = '1';
    });
  });

  setTimeout(() => {
    node.style.transition = '';
    node.style.transform = '';
    node.style.transformOrigin = '';
    node.style.opacity = '';
    node.style.willChange = '';
    node.style.pointerEvents = '';
  }, 720);
}

interface MapLibreLike {
  flyTo: (opts: Record<string, unknown>) => void;
  easeTo: (opts: Record<string, unknown>) => void;
  getZoom: () => number;
  getContainer?: () => HTMLElement | null;
}

interface KakaoLike {
  panTo: (latlng: unknown) => void;
  setLevel: (level: number) => void;
  getLevel: () => number;
}

function isMapLibre(m: MapInstance): m is MapInstance & MapLibreLike {
  const r = m as Record<string, unknown>;
  return (
    typeof r.flyTo === 'function' &&
    typeof r.easeTo === 'function' &&
    typeof r.getZoom === 'function'
  );
}

function isKakao(m: MapInstance): m is MapInstance & KakaoLike {
  const r = m as Record<string, unknown>;
  return (
    typeof r.panTo === 'function' &&
    typeof r.setLevel === 'function' &&
    typeof r.getLevel === 'function'
  );
}

function zoomToKakaoLevel(zoom: number): number {
  return Math.max(1, Math.min(14, Math.round(18 - zoom)));
}

export interface FlyToOptions {
  center: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  duration?: number;
  curve?: number;
}

export function cinematicFlyTo(map: MapInstance, opts: FlyToOptions) {
  if (isMapLibre(map)) {
    const currentZoom = map.getZoom();
    const targetZoom = opts.zoom ?? currentZoom;
    const zoomDelta = Math.abs(targetZoom - currentZoom);

    const auto = {
      duration: opts.duration ?? (1200 + zoomDelta * 250),
      curve: opts.curve ?? (zoomDelta > 3 ? 1.8 : 1.2),
    };

    map.flyTo({
      center: opts.center,
      zoom: targetZoom,
      pitch: opts.pitch,
      bearing: opts.bearing,
      duration: auto.duration,
      curve: auto.curve,
      easing: easeInOutCubic,
      essential: true,
    });
    return;
  }

  if (isKakao(map)) {
    const w = (typeof window !== 'undefined' ? window : null) as unknown as {
      kakao?: { maps?: { LatLng: new (lat: number, lng: number) => unknown } };
    } | null;
    const LatLngCtor = w?.kakao?.maps?.LatLng;
    if (!LatLngCtor) return;
    map.panTo(new LatLngCtor(opts.center[1], opts.center[0]));
    if (typeof opts.zoom === 'number') {
      map.setLevel(zoomToKakaoLevel(opts.zoom));
    }
  }
}

export function zoomPulse(map: MapInstance): () => void {
  if (isMapLibre(map)) {
    const currentZoom = map.getZoom();
    const pulseZoom = currentZoom - 0.4;

    map.easeTo({
      zoom: pulseZoom,
      duration: 220,
      easing: easeOutCubic,
    });

    const handle = setTimeout(() => {
      try {
        if (typeof map.getContainer !== 'function' || !map.getContainer()) return;
        map.easeTo({
          zoom: currentZoom,
          duration: 280,
          easing: easeOutCubic,
        });
      } catch {
        /* swallow */
      }
    }, 220);

    return () => clearTimeout(handle);
  }

  if (isKakao(map)) {
    const currentLevel = map.getLevel();
    try {
      map.setLevel(Math.min(14, currentLevel + 1));
    } catch {
      /* swallow */
    }
    const handle = setTimeout(() => {
      try {
        map.setLevel(currentLevel);
      } catch {
        /* swallow */
      }
    }, 220);
    return () => clearTimeout(handle);
  }

  return () => undefined;
}

export function focusListing(
  map: MapInstance,
  coords: [number, number],
  opts?: { zoom?: number; pitch?: number }
) {
  if (isMapLibre(map)) {
    cinematicFlyTo(map, {
      center: coords,
      zoom: Math.max(map.getZoom(), opts?.zoom ?? 16),
      pitch: opts?.pitch ?? 45,
      duration: 900,
      curve: 0.8,
    });
    return;
  }
  cinematicFlyTo(map, {
    center: coords,
    zoom: opts?.zoom ?? 16,
    duration: 900,
  });
}

export function resetPitch(map: MapInstance) {
  if (isMapLibre(map)) {
    map.easeTo({ pitch: 0, bearing: 0, duration: 400, easing: easeOutCubic });
  }
}
