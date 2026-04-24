// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HeroPinLayer — 카카오맵 전환(2026-04-22, L-kakao1) 이후 no-op.
//
// 이전 구현은 MapLibre 의 map.project / map.on('move') 로 매물별 DOM 핀을
// 절대 배치했으나, 현재는 KakaoDeckOverlay 가 deck.gl ScatterplotLayer/TextLayer
// 로 GPU 렌더링한다. DOM 핀은 10만+ 매물에서 60fps 를 깨뜨려 제거.
//
// 컴포넌트 껍데기는 /map 라우트의 기존 import 경로 호환을 위해 유지.
// 필요 시 카카오 CustomOverlay 로 재구현 가능.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

export function HeroPinLayer() {
  return null;
}
