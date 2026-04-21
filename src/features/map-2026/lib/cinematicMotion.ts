// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cinematic Motion — MapLibre 카메라 이동 프리셋
//
// 🎯 목표: 지도 이동이 "끊김" 이 아니라 "영화적 전환" 으로 느껴지도록
//   - 범용 flyTo 는 linear/ease 가 기본 — 부동산 지도는 좀 더 드라마틱해야
//   - zoom 레벨 차이가 클수록 포물선 궤적 (curve 파라미터 활용)
//   - 카테고리 전환 시 zoom pulse 로 "컨텍스트 리셋" 시각화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { Map as MapLibreMap } from 'maplibre-gl';

/** 기본 easing: cubic-bezier 느낌의 자연스러운 감속 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface FlyToOptions {
  center: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  duration?: number;
  /** MapLibre flyTo 의 curve — 높을수록 포물선 궤적 */
  curve?: number;
}

/**
 * Cinematic flyTo — 줌 차이에 따라 자동으로 궤적/속도 조정
 */
export function cinematicFlyTo(map: MapLibreMap, opts: FlyToOptions) {
  const currentZoom = map.getZoom();
  const targetZoom = opts.zoom ?? currentZoom;
  const zoomDelta = Math.abs(targetZoom - currentZoom);

  // 줌 차이가 크면 좀 더 길게, 포물선도 크게
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
    essential: true, // reduced-motion 사용자도 실행
  });
}

/**
 * Zoom pulse — 살짝 줌 아웃 → 인 해서 컨텍스트 리셋 시각화
 * (카테고리 탭 전환 때 사용)
 */
export function zoomPulse(map: MapLibreMap) {
  const currentZoom = map.getZoom();
  const pulseZoom = currentZoom - 0.4;

  map.easeTo({
    zoom: pulseZoom,
    duration: 220,
    easing: easeOutCubic,
  });

  setTimeout(() => {
    map.easeTo({
      zoom: currentZoom,
      duration: 280,
      easing: easeOutCubic,
    });
  }, 220);
}

/**
 * 매물 → 카메라 정렬 (클릭 시 1:1 포커스)
 */
export function focusListing(
  map: MapLibreMap,
  coords: [number, number],
  opts?: { zoom?: number; pitch?: number }
) {
  cinematicFlyTo(map, {
    center: coords,
    zoom: Math.max(map.getZoom(), opts?.zoom ?? 16),
    pitch: opts?.pitch ?? 45, // 건물 입체감
    duration: 900,
    curve: 0.8, // 짧고 부드러운 궤적
  });
}

/**
 * 피치 복귀 (3D → 2D)
 */
export function resetPitch(map: MapLibreMap) {
  map.easeTo({ pitch: 0, bearing: 0, duration: 400, easing: easeOutCubic });
}
