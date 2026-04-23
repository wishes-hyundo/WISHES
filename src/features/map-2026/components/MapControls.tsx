// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapControls — 지도 우상단 기본 컨트롤 (L-mapctl1 2026-04-23 p.m.)
//
// 구성
//   · 내 위치 버튼 (geolocation + Kakao panTo + level=4)
//   · 줌 + (setLevel - 1, 최소 1)
//   · 줌 − (setLevel + 1, 최대 14)
//
// L-mylocation1 (2026-04-23 p.m.): "내 위치가 제대로 안 먹힌다" 피드백 후 대폭 개선
//   · 에러 메시지 5초간 노출 (기존 3초 → 놓치기 쉬웠음)
//   · Permissions API 로 권한 선체크 → denied 면 즉시 안내
//   · enableHighAccuracy: true 제거 (모바일에서 타임아웃 빈발)
//   · error.code 별 명확한 한글 메시지
//   · 지도 또는 Kakao SDK 아직 로드 안된 edge case 구분 처리
//   · 개발자 콘솔에 [my-location] 로 디버그 로그 (성공/실패 좌표 포함)
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
    // 5초간 노출 (3초는 짧아서 놓침)
    setTimeout(() => setLocateError(null), 5000);
  };

  const zoomIn = () => {
    if (!map?.getLevel || !map.setLevel) return;
    const lvl = map.getLevel();
    map.setLevel(Math.max(1, lvl - 1));
  };

  const zoomOut = () => {
    if (!map?.getLevel || !map.setLevel) return;
    const lvl = map.getLevel();
    map.setLevel(Math.min(14, lvl + 1));
  };

  const goToMyLocation = async () => {
    if (!navigator.geolocation) {
      showError('이 브라우저는 위치 기능을 지원하지 않습니다');
      return;
    }

    // Permissions API 사전 체크 (크롬 계열)
    try {
      const perm = (navigator as Navigator & { permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
      if (perm) {
        const status = await perm.query({ name: 'geolocation' as PermissionName });
        if (status.state === 'denied') {
          showError('위치 권한이 차단됨 — 브라우저 주소창 🔒 에서 허용하세요');
          return;
        }
      }
    } catch { /* Permissions API 없는 브라우저: 그냥 진행 */ }

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
        console.log('[my-location]', { lat, lng, accuracy: `${Math.round(accuracy)}m` });

        const kakao = (window as unknown as {
          kakao?: { maps: { LatLng: new (lat: number, lng: number) => unknown } };
        }).kakao;
        if (!kakao?.maps?.LatLng) {
          showError('지도 엔진이 아직 로딩 중입니다. 잠시 후 다시 시도해주세요');
          return;
        }

        try {
          const latlng = new kakao.maps.LatLng(lat, lng);
          if (map.panTo) map.panTo(latlng);
          if (map.setLevel) map.setLevel(4);
        } catch (e) {
          console.error('[my-location] panTo failed', e);
          showError('지도 이동에 실패했습니다');
        }
      },
      (err) => {
        setLocating(false);
        console.warn('[my-location] error', err.code, err.message);
        const msg =
          err.code === 1 /* PERMISSION_DENIED */
            ? '위치 권한이 차단됨 — 브라우저 주소창 🔒 에서 허용하세요'
            : err.code === 2 /* POSITION_UNAVAILABLE */
              ? '현재 위치를 가져올 수 없습니다 (GPS/네트워크 확인)'
              : err.code === 3 /* TIMEOUT */
                ? '시간 초과 — 다시 시도해주세요'
                : '알 수 없는 위치 오류';
        showError(msg);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 }
    );
  };

  return (
    <div className="pointer-events-none absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
      {/* 내 위치 */}
      <button
        onClick={goToMyLocation}
        aria-label="내 위치로 이동"
        title="내 위치"
        disabled={locating}
        className="pointer-events-auto flex size-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-md transition hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-60"
      >
        <LocateFixed className={['size-4', locating ? 'animate-pulse text-emerald-600' : ''].join(' ')} />
      </button>

      {/* 줌 +/- */}
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md">
        <button
          onClick={zoomIn}
          aria-label="지도 확대"
          title="지도 확대 (+)"
          className="flex size-10 items-center justify-center text-neutral-700 transition hover:bg-neutral-50"
        >
          <Plus className="size-4" />
        </button>
        <div className="h-px bg-neutral-200" />
        <button
          onClick={zoomOut}
          aria-label="지도 축소"
          title="지도 축소 (−)"
          className="flex size-10 items-center justify-center text-neutral-700 transition hover:bg-neutral-50"
        >
          <Minus className="size-4" />
        </button>
      </div>

      {/* 위치 안내 토스트 (5초) */}
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
