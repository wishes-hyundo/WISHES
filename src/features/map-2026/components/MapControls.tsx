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
//   · enableHighAccuracy: true 복원 (L-mylocation2 — false 면 IP 기반으로 잡혀 ISP 서버 위치 반환)
//   · error.code 별 명확한 한글 메시지
//   · 지도 또는 Kakao SDK 아직 로드 안된 edge case 구분 처리
//   · 개발자 콘솔에 [my-location] 로 디버그 로그 (성공/실패 좌표 포함)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';

import { useEffect, useState } from 'react';
import { Plus, Minus, LocateFixed, Map as MapIcon, Satellite } from 'lucide-react';
import { useMap2026Store } from '../store';

type KakaoMap = {
  getLevel?: () => number;
  setLevel?: (n: number) => void;
  panTo?: (latlng: unknown) => void;
  setMapTypeId?: (typeId: unknown) => void;
};

export function MapControls() {
  const map = useMap2026Store((s) => s.map) as KakaoMap | null;
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  // L-naver-2026maptype1 (2026-04-27): 위성/지도 토글 (사용자 요청).
  //   Kakao SDK MapTypeId: ROADMAP (지도) / SKYVIEW (위성) / HYBRID (위성 + 라벨).
  //   기본 = ROADMAP. 토글 시 HYBRID (위성 + 도로/지명 라벨) — 더 실용적.
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const toggleMapType = () => {
    if (!map?.setMapTypeId) return;
    const kakao = (window as unknown as {
      kakao?: { maps?: { MapTypeId?: { ROADMAP?: unknown; HYBRID?: unknown } } };
    }).kakao;
    const Ids = kakao?.maps?.MapTypeId;
    if (!Ids) return;
    const next = mapType === 'roadmap' ? 'hybrid' : 'roadmap';
    try {
      map.setMapTypeId(next === 'hybrid' ? Ids.HYBRID : Ids.ROADMAP);
      setMapType(next);
    } catch (e) {
      console.warn('[map-type] failed', e);
    }
  };
  // 페이지 떠날 때 ROADMAP 으로 복귀 (memory leak 방지 + UX 일관성)
  useEffect(() => {
    return () => {
      if (!map?.setMapTypeId) return;
      const kakao = (window as unknown as { kakao?: { maps?: { MapTypeId?: { ROADMAP?: unknown } } } }).kakao;
      const id = kakao?.maps?.MapTypeId?.ROADMAP;
      if (id) try { map.setMapTypeId(id); } catch { /*noop*/ }
    };
  }, [map]);

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
        // L-mylocation3 (2026-04-23 p.m.): 정확도 5km 초과면 IP 기반 fallback 의심.
        //   브라우저가 WiFi 위치 DB 접근 실패 → ISP 서버 좌표 반환하는 전형 상황.
        //   이 경우 알림 한 줄 (panTo 는 일단 진행).
        if (accuracy > 5000) {
          showError(`위치 정확도가 낮음 (${(accuracy/1000).toFixed(0)}km) — Windows 위치 서비스 ON 또는 휴대폰에서 확인 권장`);
        }

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
              ? 'PC 에서는 WiFi 위치 DB 가 없으면 IP 기반으로 잡혀 부정확할 수 있어요. 휴대폰에서 확인 권장'
              : err.code === 3 /* TIMEOUT */
                ? '시간 초과 — 다시 시도해주세요'
                : '알 수 없는 위치 오류';
        showError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="pointer-events-none absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
      {/* L-naver-2026maptype1: 위성/지도 토글 */}
      <button
        onClick={toggleMapType}
        aria-label={mapType === 'roadmap' ? '위성 지도로 전환' : '일반 지도로 전환'}
        title={mapType === 'roadmap' ? '위성뷰' : '일반 지도'}
        className="pointer-events-auto flex size-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-md transition hover:bg-neutral-50"
      >
        {mapType === 'roadmap'
          ? <Satellite className="size-4" />
          : <MapIcon className="size-4 text-emerald-600" />}
      </button>

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
