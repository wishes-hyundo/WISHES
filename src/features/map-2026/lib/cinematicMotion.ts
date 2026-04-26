// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cinematic Motion — 지도 카메라 이동 프리셋 (MapLibre / Kakao 공용)
//
// 🎯 목표: 지도 이동이 "끊김" 이 아니라 "영화적 전환" 으로 느껴지도록
//   - 범용 flyTo 는 linear/ease 가 기본 — 부동산 지도는 좀 더 드라마틱해야
//   - zoom 레벨 차이가 클수록 포물선 궤적 (curve 파라미터 활용)
//   - 카테고리 전환 시 zoom pulse 로 "컨텍스트 리셋" 시각화
//
// L-kakao1 (2026-04-22): store.MapInstance 가 Kakao 와 MapLibre 를 모두 수용
//   하는 구조로 바뀌었다. 본 파일도 런타임 dispatch 로 두 SDK 를 모두 지원.
//     · MapLibre: flyTo({center, zoom, pitch, bearing, ...})
//     · Kakao:    panTo(LatLng) + setLevel(level)
//   Kakao 는 pitch/bearing 이 없으므로 해당 옵션은 silent skip.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { MapInstance } from '../store';

/** 기본 easing: cubic-bezier 느낌의 자연스러운 감속 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// L-naver-2026flyto1 (2026-04-27): 자체 RAF cinematic flyTo (Kakao SDK 한계 극복).
//   문제: panTo + setLevel(animate) 동시 호출 시 race / 시퀀셜 시 끊김 / setBounds 시 freeze.
//   해결: requestAnimationFrame loop 으로 위치+줌 동시 보간 + cubic-bezier easing.
//   구글맵/Mapbox flyTo 동등한 cinematic 모션. 한 번의 부드러운 zoom+pan.
//
// duration 자동 계산: 거리 + level 차이 기반 (250~700ms).
// level 변화: 정수 단위만 setLevel(no animate) 호출.  매 frame setCenter (60fps).
export function kakaoFlyTo(
  mapInst: {
    getCenter: () => { getLat: () => number; getLng: () => number };
    getLevel: () => number;
    setCenter: (latlng: unknown) => void;
    setLevel: (n: number, opts?: unknown) => void;
  },
  LatLngCtor: new (lat: number, lng: number) => unknown,
  targetLat: number,
  targetLng: number,
  finalLevel: number,
  duration?: number,
): void {
  const startCenter = mapInst.getCenter();
  const startLat = startCenter.getLat();
  const startLng = startCenter.getLng();
  const startLevel = mapInst.getLevel();

  const dLat = Math.abs(targetLat - startLat);
  const dLng = Math.abs(targetLng - startLng);
  const distDeg = Math.sqrt(dLat * dLat + dLng * dLng);
  const dLevel = Math.abs(finalLevel - startLevel);
  const auto = Math.min(700, Math.max(250, 250 + distDeg * 4000 + dLevel * 80));
  const dur = duration ?? auto;

  const startTime = performance.now();
  let lastSetLevel = startLevel;

  const step = (now: number) => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / dur, 1);
    const eased = easeInOutCubic(t);

    const lat = startLat + (targetLat - startLat) * eased;
    const lng = startLng + (targetLng - startLng) * eased;
    try { mapInst.setCenter(new LatLngCtor(lat, lng)); } catch { /*noop*/ }

    const lvLerp = startLevel + (finalLevel - startLevel) * eased;
    const rounded = Math.round(lvLerp);
    if (rounded !== lastSetLevel) {
      try { mapInst.setLevel(rounded, { animate: false }); } catch { /*noop*/ }
      lastSetLevel = rounded;
    }

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      // 마지막 프레임 보정 (정확한 final 위치/level)
      try { mapInst.setCenter(new LatLngCtor(targetLat, targetLng)); } catch { /*noop*/ }
      if (lastSetLevel !== finalLevel) {
        try { mapInst.setLevel(finalLevel, { animate: false }); } catch { /*noop*/ }
      }
    }
  };

  requestAnimationFrame(step);
}

// 내부 타입 가드 — runtime 에서 MapLibre vs Kakao 판별
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

// 내부 zoom(5~17) → Kakao level(1~14) 근사 변환
function zoomToKakaoLevel(zoom: number): number {
  return Math.max(1, Math.min(14, Math.round(18 - zoom)));
}

export interface FlyToOptions {
  center: [number, number]; // [lng, lat]
  zoom?: number;
  pitch?: number;
  bearing?: number;
  duration?: number;
  /** MapLibre flyTo 의 curve — 높을수록 포물선 궤적 (Kakao 는 무시) */
  curve?: number;
}

/**
 * Cinematic flyTo — 줌 차이에 따라 자동으로 궤적/속도 조정
 */
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

/**
 * Zoom pulse — 살짝 줌 아웃 → 인 해서 컨텍스트 리셋 시각화
 * (카테고리 탭 전환 때 사용)
 */
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
    // pulse: 한 단계 위(far) 로 갔다가 220ms 후 복귀
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

/**
 * 매물 → 카메라 정렬 (클릭 시 1:1 포커스)
 */
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
  // Kakao 는 pitch 무시
  cinematicFlyTo(map, {
    center: coords,
    zoom: opts?.zoom ?? 16,
    duration: 900,
  });
}

/**
 * 피치 복귀 (3D → 2D) — MapLibre 전용, Kakao 는 no-op
 */
export function resetPitch(map: MapInstance) {
  if (isMapLibre(map)) {
    map.easeTo({ pitch: 0, bearing: 0, duration: 400, easing: easeOutCubic });
  }
}
