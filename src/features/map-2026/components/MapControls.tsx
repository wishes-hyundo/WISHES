// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapControls — 지도 우상단 기본 컨트롤 (L-mapctl1 2026-04-23 p.m.)
//
// 변경 이력
//   · 이전: 통근(Isochrone) · 히트맵 · 3D · 유사 4개 레이어 토글
//   · 이번: 실제로 동작하지 않는 고급 기능 제거 → Kakao 기본 컨트롤만 유지
//     [내 위치] + [줌 +] + [줌 -] 3개 버튼.
//
// Kakao SDK dispatch
//   · getLevel()/setLevel(n): 줌 레벨 조정 (낮을수록 확대)
//   · panTo(LatLng): 중심 이동
//   · navigator.geolocation.getCurrentPosition: 사용자 위치
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useState } from 'react';
import { Plus, Minus, LocateFixed } from 'lucide-react';
import { useMap2026Store } from '../store';

type KakaoMap = {
  getLevel?: () => number;
  setLevel?: (n: number) => void;
  panTo?: (latlng: unknown) => void;
};

export function MapControls() {
  const map = useMap2026Store((s) => s.map) as KakaoMap | null;
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const zoomIn = () => {
    if (!map?.getLevel || !map.setLevel) return;
    const lvl = map.getLevel();
    // Kakao 는 level 이 작을수록 확대. 최소 1.
    map.setLevel(Math.max(1, lvl - 1));
  };

  const zoomOut = () => {
    if (!map?.getLevel || !map.setLevel) return;
    const lvl = map.getLevel();
    // Kakao 최대 level 14.
    map.setLevel(Math.min(14, lvl + 1));
  };

  const goToMyLocation = () => {
    if (!navigator.geolocation) {
      setLocateError('위치 기능을 지원하지 않는 브라우저입니다');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        if (!map?.panTo || !map.setLevel) return;
        const kakao = (window as unknown as {
          kakao?: { maps: { LatLng: new (lat: number, lng: number) => unknown } };
        }).kakao;
        if (!kakao) return;
        const latlng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        map.panTo(latlng);
        // 가까운 줌으로 이동 (동 단위)
        map.setLevel(4);
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? '위치 권한이 차단됨'
            : '위치를 가져올 수 없음'
        );
        // 3초 후 에러 메시지 자동 소거
        setTimeout(() => setLocateError(null), 3000);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }
    );
  };

  return (
    <div className="pointer-events-none absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
      {/* 내 위치 */}
      <button
        onClick={goToMyLocation}
        aria-label="내 위치로 이동"
        title={locateError ?? '내 위치'}
        disabled={locating}
        className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-md transition hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-60"
      >
        <LocateFixed className={['size-4', locating ? 'animate-pulse' : ''].join(' ')} />
      </button>

      {/* 줌 +/- (붙어있는 하나의 컨트롤) */}
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md">
        <button
          onClick={zoomIn}
          aria-label="지도 확대"
          title="지도 확대 (+)"
          className="flex size-9 items-center justify-center text-neutral-700 transition hover:bg-neutral-50"
        >
          <Plus className="size-4" />
        </button>
        <div className="h-px bg-neutral-200" />
        <button
          onClick={zoomOut}
          aria-label="지도 축소"
          title="지도 축소 (−)"
          className="flex size-9 items-center justify-center text-neutral-700 transition hover:bg-neutral-50"
        >
          <Minus className="size-4" />
        </button>
      </div>

      {/* 위치 에러 토스트 */}
      {locateError && (
        <div className="pointer-events-auto rounded-md bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-700 shadow-md ring-1 ring-rose-100">
          {locateError}
        </div>
      )}
    </div>
  );
}
