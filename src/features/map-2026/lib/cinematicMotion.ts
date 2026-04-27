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

// L-naver-2026flytoBoB (2026-04-27): 2026 BoB 진짜 정답 — GPU CSS transform 분리.
//
// 이전 시도 모두 실패한 이유:
//   · Kakao SDK 의 setLevel(animate:true) 는 fixed center 기준 zoom 보간 → race
//   · panTo + setLevel 동시는 두 비동기 액션 충돌 → 위치 부정확
//   · setBounds atomic 은 level off-by-1 → polygon 잔류
//   · RAF 매 frame setCenter+setLevel 은 큰 polygon redraw 60fps × DOM 무거움 → freeze
//   · 시퀀셜 panTo→idle→setLevel 은 두 단계 끊김
//
// BoB 인사이트: **카카오 SDK 와 시각 효과를 분리**.
//   · 카카오 SDK: 한 번의 instant 호출 (race/freeze 자체 차단)
//   · 시각 효과: GPU CSS transform + opacity (60fps 보장, polygon redraw 무관)
//   · 사용자 인지: 부드러운 zoom in 모션 + cross-fade
//
// 동작 (~400ms 총):
//   1) [t=0]      카카오 viewport instant 변경 (setCenter + setLevel(no animate))
//   2) [t=0]      컨테이너 transform: scale(zoom-in-from / zoom-out-from)
//                 + opacity: 0.85
//   3) [t=0+RAF]  transform: scale(1) + opacity: 1
//                 cubic-bezier(0.16, 1, 0.3, 1) — easeOutQuint (iOS-like)
//   4) [t=400]    transition cleanup (다른 동작 방해 안 하게)
//
// transformOrigin = clickX/clickY 로 클릭 지점 중심 zoom 효과 가능 (옵션).
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
  // 옵션: transformOrigin 으로 사용할 클릭 지점 (px). 미지정 시 화면 중앙.
  origin?: { x: number; y: number },
): void {
  const startLevel = mapInst.getLevel();
  const zoomDelta = startLevel - finalLevel;  // +면 zoom in, -면 zoom out

  // 1) 카카오 SDK instant 변경 (race/freeze 차단)
  try { mapInst.setCenter(new LatLngCtor(targetLat, targetLng)); } catch { /*noop*/ }
  try { mapInst.setLevel(finalLevel, { animate: false }); } catch { /*noop*/ }

  // 2) 컨테이너 GPU CSS transform 시각 효과
  const node = typeof mapInst.getNode === 'function' ? mapInst.getNode() : null;
  if (!node) return;  // 컨테이너 못 찾으면 instant 효과만 (애니메이션 없음)

  // L-naver-2026flytoBoB2 (2026-04-27): Apple iOS 표준 곡선 + 더 부드러운 진폭.
  //   사용자 피드백 "살짝 부드럽지 못한것 같은데" — 미세 조정.
  //   변경:
  //     · scale 진폭 0.85→0.92 (15% → 8%, 더 미세)
  //     · cubic-bezier(0.16,1,0.3,1) → (0.32,0.72,0,1) Apple iOS 표준
  //     · duration 380ms → 520ms (더 부드러움)
  //     · opacity 0.85 → 0.94 (cross-fade 약하게, 지도 흐려짐 어색 제거)
  //     · pointer-events 잠시 차단 (transition 중 잘못된 클릭 방지)
  const initScale = zoomDelta > 0 ? 0.92
                  : zoomDelta < 0 ? 1.08
                  : 0.97;

  // transformOrigin: 클릭 지점이면 그 지점 중심 zoom, 없으면 화면 중앙
  const rect = node.getBoundingClientRect();
  const ox = origin ? `${origin.x - rect.left}px` : '50%';
  const oy = origin ? `${origin.y - rect.top}px` : '50%';

  // 진입 (이전 동작 강제 종료 + 즉시 적용)
  node.style.transition = 'none';
  node.style.transformOrigin = `${ox} ${oy}`;
  node.style.transform = `scale(${initScale})`;
  node.style.opacity = '0.94';
  node.style.willChange = 'transform, opacity';
  node.style.pointerEvents = 'none';  // transition 중 잘못된 클릭 방지

  // 다음 frame 에 정상 상태로 transition (브라우저 layout flush 보장)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // L-naver-2026flytoBoB2: Apple iOS 표준 cubic-bezier — 가장 자연스러운 곡선.
      //   modal/sheet 등장에 사용되는 곡선. spring-like 부드러움.
      node.style.transition =
        'transform 520ms cubic-bezier(0.32, 0.72, 0, 1), ' +
        'opacity 380ms cubic-bezier(0.32, 0.72, 0, 1)';
      node.style.transform = 'scale(1)';
      node.style.opacity = '1';
    });
  });

  // cleanup: 520ms + 여유 후 transition 제거
  setTimeout(() => {
    node.style.transition = '';
    node.style.transform = '';
    node.style.transformOrigin = '';
    node.style.opacity = '';
    node.style.willChange = '';
    node.style.pointerEvents = '';
  }, 620);
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
