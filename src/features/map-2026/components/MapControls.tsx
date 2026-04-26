// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapControls — 지도 우상단 핵심 컨트롤만 (L-naver-2026minimal1 2026-04-27)
//
// 사용자 요청 (2026-04-27): 위성뷰/도달시간/학세권 모두 제거 → 핵심 3개만.
//   · 내 위치 (geolocation)
//   · 줌 +
//   · 줌 −
//
// 모바일 우선 디자인:
//   · 44×44px 최소 터치 영역 (Apple/Google guideline)
//   · 명확한 tap feedback (hover:none + active:scale)
//   · 우측 고정 (엄지 영역)
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

  const showError = (msg: string) => {
    setLocateError(msg);
    setTimeout(() => setLocateError(null), 5000);
  };

  const zoomIn = () => {
    if (!map?.getLevel || !map.setLevel) return;
    map.setLevel(Math.max(1, map.getLevel() - 1));
  };

  const zoomOut = () => {
    if (!map?.getLevel || !map.setLevel) return;
    map.setLevel(Math.min(14, map.getLevel() + 1));
  };

  const goToMyLocation = async () => {
    if (!navigator.geolocation) {
      showError('이 브라우저는 위치 기능을 지원하지 않습니다');
      return;
    }
    try {
      const perm = (navigator as Navigator & { permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
      if (perm) {
        const status = await perm.query({ name: 'geolocation' as PermissionName });
        if (status.state === 'denied') {
          showError('위치 권한이 차단됨 — 브라우저 주소창 🔒 에서 허용하세요');
          return;
        }
      }
    } catch { /* noop */ }

    if (!map) {
      showError('지도가 아직 준비되지 않았습니다');
      return;
    }

    setLocating(true);
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (accuracy > 5000) {
          showError(`위치 정확도가 낮음 (${(accuracy/1000).toFixed(0)}km) — 휴대폰에서 확인 권장`);
        }
        const kakao = (window as unknown as {
          kakao?: { maps: { LatLng: new (lat: number, lng: number) => unknown } };
        }).kakao;
        if (!kakao?.maps?.LatLng) {
          showError('지도 엔진이 아직 로딩 중입니다');
          return;
        }
        try {
          const latlng = new kakao.maps.LatLng(lat, lng);
          if (map.panTo) map.panTo(latlng);
          if (map.setLevel) map.setLevel(4);
        } catch {
          showError('지도 이동에 실패했습니다');
        }
      },
      (err) => {
        setLocating(false);
        const msg =
          err.code === 1 ? '위치 권한이 차단됨 — 브라우저 주소창 🔒 에서 허용하세요'
          : err.code === 2 ? 'PC 에서는 위치가 부정확할 수 있어요. 휴대폰에서 확인 권장'
          : err.code === 3 ? '시간 초과 — 다시 시도해주세요'
          : '알 수 없는 위치 오류';
        showError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // L-naver-2026mobile1: 모바일 터치 영역 44px 보장 + 활성 피드백
  const baseBtn = 'pointer-events-auto flex size-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-md transition active:scale-95 active:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 sm:size-10';

  return (
    <div className="pointer-events-none absolute top-3 right-3 z-20 flex flex-col items-end gap-2 sm:top-4 sm:right-4">
      <button
        onClick={goToMyLocation}
        aria-label="내 위치로 이동"
        title="내 위치"
        disabled={locating}
        className={baseBtn}
      >
        <LocateFixed className={['size-[18px]', locating ? 'animate-pulse text-emerald-600' : ''].join(' ')} />
      </button>

      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-md">
        <button
          onClick={zoomIn}
          aria-label="지도 확대"
          title="지도 확대 (+)"
          className="flex size-11 items-center justify-center text-neutral-700 transition active:scale-95 active:bg-neutral-100 sm:size-10"
        >
          <Plus className="size-[18px]" />
        </button>
        <div className="h-px bg-neutral-200" />
        <button
          onClick={zoomOut}
          aria-label="지도 축소"
          title="지도 축소 (−)"
          className="flex size-11 items-center justify-center text-neutral-700 transition active:scale-95 active:bg-neutral-100 sm:size-10"
        >
          <Minus className="size-[18px]" />
        </button>
      </div>

      {locating && !locateError && (
        <div className="pointer-events-auto rounded-md bg-emerald-50 px-3 py-1.5 text-[11.5px] font-medium text-emerald-700 shadow-md ring-1 ring-emerald-100">
          위치 가져오는 중…
        </div>
      )}
      {locateError && (
        <div className="pointer-events-auto max-w-[240px] rounded-md bg-rose-50 px-3 py-2 text-[11.5px] font-medium leading-tight text-rose-700 shadow-md ring-1 ring-rose-100">
          {locateError}
        </div>
      )}
    </div>
  );
}
