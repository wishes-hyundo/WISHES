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

  // L-naver-2026flytoBoB3 (2026-04-27): iOS UISheetPresentationController spring 모션.
  //   사용자 요청: "iOS sheet 등장 같은 spring-like 느낌".
  //   기존 cubic-bezier(0.32,0.72,0,1) — easeOut (overshoot 없음).
  //   변경: cubic-bezier(0.34, 1.56, 0.64, 1) — back-out — 미세 overshoot + 정착.
  //
  //   spring 효과:
  //     · scale 진폭 0.93 → 1.0 (zoom in 시) — 7% 미세
  //     · 1.56 control point 가 약 5~6% overshoot 만들고 부드럽게 정착
  //     · duration 620ms — iOS sheet appearance 와 동일
  //     · pointerEvents=none — 트랜지션 중 잘못된 클릭 차단
  //     · 시각적 인상: "살짝 튕겼다가 부드럽게 안착"
  //
  //   기존 Web Animations API keyframe 시도는 SSR/strict TS 환경에서
  //   Animation type 의존성으로 빌드 실패 — 순수 CSS transition 으로 대체.
  const initScale = zoomDelta > 0 ? 0.93
                  : zoomDelta < 0 ? 1.07
                  : 0.97;

  // transformOrigin: 클릭 지점이면 그 지점 중심 zoom, 없으면 화면 중앙
  const rect = node.getBoundingClientRect();
  const ox = origin ? `${origin.x - rect.left}px` : '50%';
  const oy = origin ? `${origin.y - rect.top}px` : '50%';

  // 진입 (이전 transition 잔류 즉시 종료 + 클릭 좌표 기준 origin)
  node.style.transition = 'none';
  node.style.transformOrigin = `${ox} ${oy}`;
  node.style.transform = `scale(${initScale})`;
  node.style.opacity = '0.94';
  node.style.willChange = 'transform, opacity';
  node.style.pointerEvents = 'none';

  // 다음 frame 에 정상 상태로 transition (브라우저 layout flush 보장)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // back-out cubic-bezier — control point y > 1 에서 overshoot 후 정착.
      // (0.34, 1.56, 0.64, 1) 은 iOS sheet 등장 곡선과 시각적 동등.
      node.style.transition =
        'transfo