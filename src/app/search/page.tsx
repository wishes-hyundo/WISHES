'use client';

/**
 * /search — 중개사 포털
 */

import React, { useEffect, useState } from 'react';
import { createAuthClient } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminFetch';

type PageState = 'loading' | 'nosession' | 'ok';

export default function SearchPortalPage() {
  const [state, setState] = useState<PageState>('loading');

  // L-cache-nuke (2026-04-29): 사장님 cache 영구 stale 호소. /search 진입 시 자동
  //   Service Worker unregister + Cache API 모두 삭제. 매번 fresh 보장.
  useEffect(() => {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { r.unregister().catch(function(){}); });
        }).catch(function(){});
      }
      if ('caches' in window) {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) { caches.delete(k).catch(function(){}); });
        }).catch(function(){});
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    try {
      const token = (sessionStorage.getItem('ws_token')||(function(){try{var _lv=localStorage.getItem('ws_token');if(_lv){sessionStorage.setItem('ws_token',_lv);var u=localStorage.getItem('ws_user');if(u)sessionStorage.setItem('ws_user',u);var t=localStorage.getItem('ws_login_time');if(t)sessionStorage.setItem('ws_login_time',t);return _lv;}}catch(e){}return '';})());
      if (token) setState('ok'); else setState('nosession');
    } catch { setState('nosession'); }
  }, []);

  useEffect(() => {
    if (state !== 'ok') return;
    // [Step 29 emergency 2026-05-19 사장님 명령] /search 응급 진단 모드
    //   ?lite=1 → 모든 ws-ext-patch 차단 (어떤 patch 가 freeze 일으키는지 확인용)
    //   사장님 보고: 페이지 멈춤 + 콘솔도 못 열림
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('lite') === '1' || params.get('lite') === 'true') {
        (window as unknown as { __WS_LITE_MODE__?: boolean }).__WS_LITE_MODE__ = true;
        console.warn('[WS-LITE-MODE] 진단 모드 — 모든 patch 차단. 정상 사용 시 ?lite 제거.');
      }
      // [Step 30 진단] ?disable=v305,v270 형식으로 개별 patch 차단
      // [Step 31 fix] sessionStorage 백업 — login redirect 시 URL params 사라져도 보존
      let disableParam = params.get('disable') || '';
      try {
        if (disableParam === 'clear') {
          sessionStorage.removeItem('__WS_DISABLE_PATCHES__');
          console.warn('[WS-DISABLE-MODE] sessionStorage cleared. 새로고침 후 정상 사용.');
          disableParam = '';
        } else if (disableParam) {
          sessionStorage.setItem('__WS_DISABLE_PATCHES__', disableParam);
        } else {
          disableParam = sessionStorage.getItem('__WS_DISABLE_PATCHES__') || '';
          if (disableParam) console.info('[WS-DISABLE-MODE] sessionStorage 복원:', disableParam);
        }
      } catch {}
      if (disableParam) {
        const disabledIds = new Set(disableParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
        (window as unknown as { __WS_DISABLED_PATCHES__?: Set<string> }).__WS_DISABLED_PATCHES__ = disabledIds;
        console.warn('[WS-DISABLE-MODE] 차단 patch ids:', Array.from(disabledIds));
      }
    } catch {}
    let cancelled = false;
    const refreshAndPersist = async () => {
      try {
        if (cancelled) return;
        let stored = '';
        try { stored = sessionStorage.getItem('ws_refresh_token') || localStorage.getItem('ws_refresh_token') || ''; } catch {}
        if (!stored) return;
        const r = await fetch('/api/auth/refresh-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: stored }),
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (cancelled || !r.ok) return;
        const j = await r.json() as { access_token?: string; refresh_token?: string };
        if (!j?.access_token) return;
        const tok = j.access_token;
        const now = Date.now().toString();
        try {
          sessionStorage.setItem('ws_token', tok);
          sessionStorage.setItem('ws_login_time', now);
          localStorage.setItem('ws_token', tok);
          localStorage.setItem('ws_login_time', now);
          if (j.refresh_token) {
            sessionStorage.setItem('ws_refresh_token', j.refresh_token);
            localStorage.setItem('ws_refresh_token', j.refresh_token);
          }
        } catch {}
      } catch {}
    };
    const initialTimer = setTimeout(refreshAndPersist, 100);
    const interval = setInterval(refreshAndPersist, 15 * 60 * 1000);
    const onActivate = () => { if (document.visibilityState === 'visible') refreshAndPersist(); };
    const onFocus = () => refreshAndPersist();
    const onOnline = () => refreshAndPersist();
    document.addEventListener('visibilitychange', onActivate);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onActivate);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [state]);

  useEffect(() => {
    if (state !== 'ok') return;

    try {
      const w = window as unknown as { __WS_PREFETCH__?: Promise<unknown> };
      if (!w.__WS_PREFETCH__) {
        const wsToken = (() => { try { return sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || ''; } catch { return ''; } })();
        if (wsToken) {
          w.__WS_PREFETCH__ = Promise.resolve(null); if (false) adminFetch('/api/admin/listings?fields=minimal', {
            headers: { Authorization: 'Bearer ' + wsToken },
            cache: 'no-cache',
          }).then((r) => r.json()).then((j) => (j && j.success && Array.isArray(j.data) ? j.data : null)).catch(() => null);
        }
      }
    } catch {}

    try {
      interface KakaoMaps { load: (cb: () => void) => void; Map?: unknown }
      interface KakaoGlobal { maps: KakaoMaps }
      const kk = (window as unknown as { kakao?: KakaoGlobal }).kakao;
      if (kk && kk.maps && typeof kk.maps.load === 'function' && !kk.maps.Map) {
        kk.maps.load(() => {});
      }
    } catch {}

    let link = document.getElementById('ws-ext-styles') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'ws-ext-styles';
      link.rel = 'stylesheet';
      link.href = '/search/styles.css?v=20260420a';
      document.head.appendChild(link);
    }

    const existing = document.getElementById('ws-ext-content') as HTMLScriptElement | null;
    if (existing) {
      try {
        const w = window as unknown as { WS?: { showSearchUI?: () => void; loadData?: () => void; _loadingData?: boolean; allListings?: unknown[] } };
        if (w.WS?.showSearchUI) w.WS.showSearchUI();
        if (w.WS?.loadData && !w.WS._loadingData && (!w.WS.allListings || w.WS.allListings.length === 0)) w.WS.loadData();
      } catch {}
      return;
    }
    // [v407 2026-05-20 근본통합 1단계] 공유 MutationObserver 허브 —
    //   content.js / 모든 패치보다 먼저 실행되어야 함 (observer 65개 → 1개 통합).
    if (!document.getElementById('ws-ext-hub')) {
      const hub = document.createElement('script');
      hub.id = 'ws-ext-hub';
      hub.src = '/search/content-v407-observer-hub.js?v=20260520-step125';
      hub.async = false;
      hub.defer = false;
      document.body.appendChild(hub);
    }

    const script = document.createElement('script');
    script.id = 'ws-ext-content';
    script.src = '/search/content.js?v=20260514-cachev2';
    script.async = false;
    document.body.appendChild(script);

    // [Step 29 fix 2026-05-19] lite mode 진단: ?lite=1 시 patch 로드 차단
    if ((window as unknown as { __WS_LITE_MODE__?: boolean }).__WS_LITE_MODE__) {
      console.warn('[WS-LITE-MODE] patches 로드 skip');
      return;
    }
    const patches: Array<[string, string]> = [
      // [v398 2026-05-15 사장님] auto cache reset — deploy 변경 감지 시 stale storage 자동 정리
      //   강제새로고침/시크릿모드 매번 안 해도 즉시 반영 (사장님 명령)
      //   ws_token, ws-memos, ws-contacts, ws-favorites 는 보존
      ['ws-ext-patch-v398-auto-cache-reset', '/search/content-v398-auto-cache-reset.js?v=20260515b-firstclr'],
      ['ws-ext-patch', '/search/content-v230-patch.js?v=20260502'],
      ['ws-ext-patch-v240', '/search/content-v240-detail.js?v=20260519-step44-ai-poll-5s'],
      ['ws-ext-patch-v260-perf', '/search/content-v260-perf.js?v=20260519-step35-no-poll'],
      ['ws-ext-patch-v270-contacts', '/search/content-v270-contacts.js?v=20260418a1'],
      ['ws-ext-patch-v280-mobile', '/search/content-v280-mobile.js?v=20260420b'],
      ['ws-ext-patch-v290-polish', '/search/content-v290-polish.js?v=20260519-step49-restored'],
      ['ws-ext-patch-v291-stability', '/search/content-v291-stability.js?v=20260514nativePTR'],
      ['ws-ext-patch-v292-global-search', '/search/content-v292-global-search.js?v=20260519-step35-throttle'],
      // v293-alert-log removed (2026-05-15 사장님 명령 - 종 알림 잔상 영구 제거)
      // v294-scope removed (2026-05-15 사장님 명령 - 전체/내매물 잔상 완전 제거)
      ['ws-ext-patch-v295-detail-hydrate', '/search/content-v295-detail-hydrate.js?v=20260424d'],
      ['ws-ext-patch-v297-edit', '/search/content-v297-edit.js?v=20260429-reload'],
      ['ws-ext-patch-v300-aidesc-v2', '/search/content-v300-aidesc-v2.js?v=20260427a'],
      ['ws-ext-patch-v306-bldg-unit', '/search/content-v306-bldg-unit.js?v=20260429rev4'],
      ['ws-ext-patch-v307-listing-form', '/search/content-v307-listing-form.js?v=20260428redirect'],
      ['ws-ext-patch-v308-roadview', '/search/content-v308-roadview.js?v=20260429e'],
      ['ws-ext-patch-v310-modal-completeness', '/search/content-v310-modal-completeness.js?v=20260429a'],
      ['ws-ext-patch-v311-nearest-stations', '/search/content-v311-nearest-stations.js?v=20260429a'],
      // [Step126 2026-05-20] /search freeze 원인 — 근본통합까지 임시 비활성화 (이분탐색 8R 확인):
      //['ws-ext-patch-v318-mobile-image-fix', '/search/content-v318-mobile-image-fix.js?v=20260509c'],
      // [Step126 2026-05-20] /search freeze 원인 — 근본통합까지 임시 비활성화 (이분탐색 8R 확인):
      //['ws-ext-patch-v319-hero-dedup', '/search/content-v319-hero-dedup.js?v=20260429a'],
      // v312 (2026-04-29): 메인 모달 전유부 (.v240-info2 에 전용/공용/총면적 row) +
      //   Hero 영역 매물수정 버튼 + priceBox 밸런스 fix.
      ['ws-ext-patch-v312-main-modal-unit', '/search/content-v312-main-modal-unit.js?v=20260429bob'],
      // v313 (2026-04-29): 매물수정 패널 inline 사진 매니저 — drag-drop 업로드,
      //   서버측 Classic Negative + 워터마크 자동, '고급 보정' → /admin/photo-enhancer.
      //   View Transitions / Container Queries / Popover / WCAG 2.2 AAA / oklch.
      // v313 entry 제거 (CDN stale cache + v315 와 중복 mount 문제). v315 만 사용.
      // v315 (2026-04-29): 매물수정 패널 inline 사진/동영상 매니저 BoB.
      ['ws-ext-patch-v315-edit-photos', '/search/content-v315-edit-photos.js?v=20260429-dragonly'],
      // v316 (2026-04-29): raw_fields 의 구조형태/임대기간/주차대수/면적/룸 등을
      //   모달 빈 셀에 자동 채움. 사장님 명령 — 본문보기엔 다 있는데 표시 X 문제 fix.
      ['ws-ext-patch-v316-rawfields-fill', '/search/content-v316-modal-rawfields-fill.js?v=20260429-lidmarker'],
      // v317 (2026-04-29): 카카오 기반 주변 시설 (지하철 + 버스정류장)
      // [Step126 2026-05-20] /search freeze 원인 — 근본통합까지 임시 비활성화 (이분탐색 8R 확인):
      //['ws-ext-patch-v317-nearby-poi', '/search/content-v317-nearby-poi.js?v=20260429-addrfb'],
      // v320 (2026-04-29 사장님 명령): v240 모달 [+ 추가] 핸들러 누락 fix.
      //   IIFE + try/catch + MutationObserver. UI/검색결과 영향 0.
      // [Step126 2026-05-20] /search freeze 원인 — 근본통합까지 임시 비활성화 (이분탐색 8R 확인):
      //['ws-ext-patch-v320-contact-add', '/search/content-v320-contact-add.js?v=20260429-show'],
      // v322 (2026-04-29 사장님 명령): contacts 화면 미표시 fix.
      //   v270 fetchCache 우회 + DB fresh fetch 후 .v240-contacts-empty 영역 직접 렌더.
      ['ws-ext-patch-v322-contacts-render', '/search/content-v322-contacts-render.js?v=20260519-step47-throttle'],
      // v323 (2026-04-29 사장님 명령): contacts 수정/삭제 버튼 + 핸들러 + DB sync.
      ['ws-ext-patch-v323-contact-edit-del', '/search/content-v323-contact-edit-del.js?v=20260519-step47-throttle'],
      // v314 (2026-04-29): 매물수정 버튼 위치 이동 — hero 에서 '기본 정보·옵션'
      //   섹션 헤더 우측 끝으로 (사장님 제안). View Transitions 60fps + oklch.
      ['ws-ext-patch-v314-edit-btn-pos', '/search/content-v314-edit-btn-pos.js?v=20260429a'],
      // v324 (2026-04-29 사장님 명령): 출처 뱃지 — 공실클럽=파랑G / 온하우스=빨강O.
      //   카드 주소 라인 + 모달 hero 강제 보장. content.js 의 기존 녹색/주황 뱃지
      //   자동 교체. v324b: 매물번호 옆 mini 뱃지는 중복이라 제거.
      ['ws-ext-patch-v324-source-badge', '/search/content-v324-source-badge.js?v=20260519-step38-1s-throttle'],
      // v325 (2026-04-29 사장님 명령): 매물번호 강조 뱃지 — 카드 .ws-listing-tags
      //   첫 자식으로 "매물 {id}" 뱃지 (#2D5A27 짙은 녹색) prepend, 클릭 시 복사.
      //   기존 우측 .ws-listing-id 가 안 보인다는 보고 → 층수 앞 고정 배치.
      ['ws-ext-patch-v325-listing-id-tag', '/search/content-v325-listing-id-tag.js?v=20260519-step38-1s-throttle'],
      // v326 (2026-04-29 사장님 명령): mini 출처 뱃지 cleanup-only.
      //   v324b 가 만든 cleanup 코드가 Vercel CDN edge stale 로 풀리지 않아 별개
      //   path 의 단일책임 patch 로 우회. .ws-src-badge-mini 만 제거.
      ['ws-ext-patch-v326-cleanup-mini-badge', '/search/content-v326-cleanup-mini-badge.js?v=20260519-step38-1s-throttle'],
      // v327 (2026-04-29 사장님 명령): 카드 부 라인 = 도로명주소 (있을 때만).
      //   메인은 굵은 지번주소 그대로 / 부는 옅은 회색 도로명주소 (#6b7280).
      //   v327b: 도로명에서 시/구 prefix 제거 (메인 중복 방지).
      ['ws-ext-patch-v327-road-address-sub', '/search/content-v327-road-address-sub.js?v=20260519-step38-1s-throttle'],
      // v328 (2026-04-29 사장님 명령): 메인 주소 라인 형식 — "(건물명)" 괄호 제거 후
      //   "[지번주소] [건물명] [층] [호]" 형식으로 재구성.
      ['ws-ext-patch-v328-main-addr-format', '/search/content-v328-main-addr-format.js?v=20260519-step38-1s-throttle'],
      // v329 (2026-04-29 사장님 명령): 공실 라벨 정확화 — status=공개 무차별 → 
      //   available_date 기준 "공실/거주중/협의입주/YY.MM 입주/hide" 분기.
      ['ws-ext-patch-v329-vacancy-label', '/search/content-v329-vacancy-label.js?v=20260519-step38-1s-throttle'],
      // v330 (2026-04-29 사장님 명령): 룸 라벨 — "1개 방" → "원룸/투룸/1.5룸/쓰리룸/쓰리룸+"
      //   listing.rooms 숫자 기준 변환. selectFields 에 'rooms' 포함.
      ['ws-ext-patch-v330-room-label', '/search/content-v330-room-label.js?v=20260519-step38-1s-throttle'],
      // v331 (2026-04-29 사장님 보고): onhouse 모달 검정 화면 → placeholder.
      //   listing_images 0건 매물의 hero 영역 검정 → "사진 준비중" + 원본 링크.
      // L-perf-fix-14-2026-05-10 (사장님 명령): "사진 준비중" placeholder 쓸데없이 불편 → disable.
      // ['ws-ext-patch-v331-onhouse-image-placeholder', '/search/content-v331-onhouse-image-placeholder.js?v=20260519-step38-1s-throttle'],
      // v321 (2026-05-09 사장님 발견 — I-STORAGE-1): localStorage quota 자동 정리.
      //   매물 30,420건 → ws_data_snapshot/ws_price_snapshots 캐시 ~9MB → quota 초과
      //   → "저장공간 부족" 토스트 무한 반복. Storage.prototype.setItem 가로채기로
      //   quota 시 자동 cleanup + 재시도. 사장님 데이터 (즐겨찾기/메모/연락처/폴더)
      //   SAFE_PRESERVE 영구 보호. 토스트 10분 throttle.
      // [Step126 2026-05-20] /search freeze 원인 — 근본통합까지 임시 비활성화 (이분탐색 8R 확인):
      //['ws-ext-patch-v321-storage-cleanup', '/search/content-v321-storage-cleanup.js?v=20260519-step32-cap1000'],
      // Step D Plan C (2026-05-10): ws_data_snapshot → IndexedDB (50MB+, 전체 62K 매물 추적).
      ['ws-ext-patch-v340-snapshot-idb', '/search/content-v340-snapshot-idb.js?v=20260519-step43-restored'],
      // v343 (2026-05-10 사장님 명령 Fix 4): ws_price_snapshots -> IndexedDB.
      //   v340 와 같은 패턴, key 만 다름. 60K x 80byte = 5MB localStorage quota
      //   영구 fix. 토스트 영구 사라짐.
      ['ws-ext-patch-v343-pricesnap-idb', '/search/content-v343-pricesnap-idb.js?v=20260519-step43-restored'],
      // v345 (2026-05-10 사장님 명령 Fix 22): 매물 카드 img lazy load 강제.
      //   100 매물 사진 동시 fetch -> 수백 MB. viewport 외 사진도 fetch.
      //   loading=lazy 추가 -> viewport 안 매물만 fetch -> 첫 진입 빠름.
      ['ws-ext-patch-v345-img-lazy', '/search/content-v345-img-lazy.js?v=20260510a'],
      // v346 (2026-05-10 사장님 명령): 첫 표시 매물 100 -> 20건.
      //   100건 카드 렌더 = 시간 걸림. 20건만 즉시 표시 → 사장님 첫 진입 빠름.
      //   사용자가 select 다른 값 변경 시 그대로 유지 (영구 강제 X).
      // [URGENT 2026-05-15] v346-default-20 disabled - perPage 20 강제가 문제
      // ['ws-ext-patch-v346-default-20', '/search/content-v346-default-20-listings.js?v=20260510a'],
      ['ws-ext-patch-v349-server-search', '/search/content-v349-server-search.js?v=20260511za'],
      ['ws-ext-patch-v360-console-suppress', '/search/content-v360-console-suppress.js?v=20260512a'],
      // [URGENT 2026-05-15] v363-pagination disabled - 사장님 20건만 표시 회귀 (loadData race)
      // ['ws-ext-patch-v363-pagination', '/search/content-v363-pagination.js?v=20260514e'],
      // [Phase E 2026-05-15 사장님 명령] v397 후속 - feature flag 기반 server pagination
      //   /api/system-flags 의 use_server_pagination='true' 일 때만 활성
      //   기본 'false' 이므로 legacy 모드 유지 (회귀 risk 0)
      ['ws-ext-patch-v397-pagination', '/search/content-v397-pagination.js?v=20260515i-wraprenderpag'],
      // [Phase F.1 2026-05-15 사장님 명령] WS.fetchListingById / fetchListingsByIds helper
      //   detail-by-id 변환의 안전 기반 (cache 우선 + fallback fetch)
      //   v397 활성 시 WS.allListings 가 page 만 가져서 .find(id) 가 miss — 이 helper 가 보완
      ['ws-ext-patch-v399-fetch-by-id', '/search/content-v399-fetch-by-id.js?v=20260515c-csrf'],
      // [Phase F.2 2026-05-15] 모달 click 가로채기 — page 외 매물 자동 fetch + showDetail
      ['ws-ext-patch-v400-modal-prefetch', '/search/content-v400-modal-prefetch.js?v=20260515a'],
      // [Phase F.3 2026-05-15] 비교/인쇄/관심목록 button click 가로채기
      ['ws-ext-patch-v401-bulk-prefetch', '/search/content-v401-bulk-prefetch.js?v=20260515b-aibrief'],
      // [Phase I 2026-05-15] WS.showDetail wrap — minimal listing 자동 보강 (지도 마커 click 등)
      ['ws-ext-patch-v402-showdetail-wrap', '/search/content-v402-showdetail-wrap.js?v=20260520-step124-thinfetch'],
      // [Step 28 fix 2026-05-19] 통합 메모리 가드 — OOM 영구 해결
      //   85 patch 누적 setInterval/setTimeout 일괄 cleanup + WS.allListings cap
      ['ws-ext-patch-v403-memory-guard', '/search/content-v403-memory-guard.js?v=20260519-step48-no-stack-trace'],
      // [Step 85 2026-05-19 사장님 명령] C-5 카드 hover 미리보기 (desktop only)
      ['ws-ext-patch-v404-card-hover-preview', '/search/content-v404-card-hover-preview.js?v=20260519-step85'],
      // [Step 86 2026-05-19 사장님 명령] C-3 활성 필터 chip + 빠른 정렬
      ['ws-ext-patch-v405-active-filter-chips', '/search/content-v405-active-filter-chips.js?v=20260519-step86'],
      // [Step 87 2026-05-19 사장님 명령] C-2 검색 자동완성 dropdown
      ['ws-ext-patch-v406-search-autocomplete', '/search/content-v406-search-autocomplete.js?v=20260519-step87'],
      ['ws-ext-patch-v364-photo-mobile', '/search/content-v364-photo-mobile-ux.js?v=20260514nativePTR'],
      ['ws-ext-patch-v365-mobile-ui', '/search/content-v365-mobile-ui.js?v=20260512b'],
      ['ws-ext-patch-v366-token-refresh-v2', '/search/content-v366-token-refresh-v2.js?v=20260514short'],
      ['ws-ext-patch-v367-mobile-clean', '/search/content-v367-mobile-clean.js?v=20260514noPTR'],
      ['ws-ext-patch-v368-mobile-clean-v2', '/search/content-v368-mobile-clean-v2.js?v=20260514noPTR'],
      // v369 removed (2026-05-15 사장님 명령 - X 버튼이 만기 badge hide 후에도 남아있어 영구 차단)
      // [복원+조정 2026-05-15 사장님 명령] e23e9b60 잘못된 edit 로 빠졌던 patch 복원.
      //   v371: 만기 badge + 종 알림 + 큰글씨 toggle default 숨김 + ⋮ 토글 SAFETY HIDE
      //   v372: 제외 (사장님 명령 - ⋮ floating 토글이 본 페이지 가림 → 영구 제거)
      //   v373: 전체/내매물 탭 위치 재배치 (검색바 inline)
      //   v374: viewport-fixed 좌표 보정 (CSS only)
      ['ws-ext-patch-v371-badge-hide', '/search/content-v371-badge-hide.js?v=20260515noKebab'],
      // v373-layout-reposition removed (v294 없으니 위치 조정 불필요)
      // v374-result-row-position removed (v294 없으니 좌표 보정 불필요)
      ['ws-ext-patch-v382-lightbox-1200', '/search/content-v382-lightbox-1200.js?v=20260515-workersdev'],
      ['ws-ext-patch-v383-lightbox-img-patch', '/search/content-v383-lightbox-img-patch.js?v=20260515-workersdev'],
      ['ws-ext-patch-v384-modal-hero-bg-patch', '/search/content-v384-modal-hero-bg-patch.js?v=20260514a'],
      ['ws-ext-patch-v385-preload-link-patch', '/search/content-v385-preload-link-patch.js?v=20260514a'],
      ['ws-ext-patch-v386-cardid-hide-search', '/search/content-v386-cardid-hide-search.js?v=20260515c-nonull'],
      ['ws-ext-patch-v387-enter-search-blur', '/search/content-v387-enter-search-blur.js?v=20260515-fixtrunc'],
      // [Step 117 fix 2026-05-19 사장님 명령] v390 재활성화
      //   Step 96 가 v390 disable 했었는데 그게 진짜 freeze + 맵 안 보임 원인.
      //   map-main.js 는 chrome.runtime.getURL 사용 = chrome extension only.
      //   production (wishes.co.kr) 에서는 v390 만 web map provider.
      //   Step 96 → v390 disable → web 환경 map 자체 없음 → freeze.
      ['ws-ext-patch-v390-search-map-init', '/search/content-v390-search-map-init.js?v=20260520-step124-thintag'],
      ['ws-ext-patch-v392-aggressive-token-refresh', '/search/content-v392-aggressive-token-refresh.js?v=20260514a'],
      // v375-scope-bottom-toolbar removed (v294 없으니 의미 없음)
      ['ws-ext-patch-v376-remove-senior-toggle', '/search/content-v376-remove-senior-toggle.js?v=20260514a'],
      ['ws-ext-patch-v377-expiry-into-bell', '/search/content-v377-expiry-into-bell.js?v=20260514a'],
      // [복원 2026-05-15 사장님 명령] commit 79ceac40 가 잘못 제거한 4개 사진 patch 복원.
      //   v378: 매물카드 img src 강제 ?w=400/220 (freeze fix, 200-400KB → 작게)
      //   v379: 모달 hero/lightbox 의 img-proxy URL 에 nocap=1 (server cap 우회)
      //   v380: 모달 hero ?w=1200 강제 (gallery navigate 시도)
      //   v381: listing.hero_url 사용 (Option C - server 가 만든 hero_url 직접 사용)
      ['ws-ext-patch-v378-card-img-shrink', '/search/content-v378-card-img-shrink.js?v=20260515restore'],
      ['ws-ext-patch-v379-modal-nocap', '/search/content-v379-modal-nocap.js?v=20260515restore'],
      ['ws-ext-patch-v380-modal-hero-1200', '/search/content-v380-modal-hero-1200.js?v=20260515restore'],
      ['ws-ext-patch-v381-modal-hero-swap', '/search/content-v381-modal-hero-swap.js?v=20260515restore'],
      // v378 (2026-05-14 사장님 명령 - CRITICAL): 매물 모달에 다른 매물의 contacts 잘못 표시 fix.
      //   매물 A 모달 닫고 B 열 때 B 모달에 A 의 phone 표시 영업 critical 결함.
      //   root cause: v270 의 findCurrentContacts() 가 __currentListing.id 검증 안 함.
      //   fix: setter trap + getModalListingId() + DOM MutationObserver.
      ['ws-ext-patch-v378-contact-id-strict', '/search/content-v378-contact-id-strict.js?v=20260514a'],
      // v379 (2026-05-14 사장님 prod 검증 후): v378 만으론 부족 — v270 rendered DOM 강제 reset.
      //   사장님 발견: 매물 A 모달 닫고 B 열 때 B 모달에 A 의 phone 그대로 잔존.
      //   root cause: v270 의 renderContacts() 가 .v240-contacts-empty 의 outerHTML 교체 →
      //   매물 B 모달 열어도 v270 가 호출 안 됨 (.v240-contacts-empty 없으니).
      //   fix: modal id 변경 감지 시 .v270-contacts/.v270-ct-meta 제거 + .v240-contacts-empty 다시 추가.
      ['ws-ext-patch-v379-modal-contacts-reset', '/search/content-v379-modal-contacts-reset.js?v=20260514a'],
      // v380 (2026-05-14 사장님 prod 재발견): v379 도 부족 — modal id 기반 직접 fetch+render.
      //   v270 의 findCurrentContacts() 가 window.__currentListing 보는데
      //   v240-detail.js 가 modal HTML update 후 __currentListing update 전에 호출되면
      //   옛 매물의 contacts 잔존. v380 = v270/v322 완전 우회, 직접 fetch + 직접 render.
      ['ws-ext-patch-v380-contacts-fresh-render', '/search/content-v380-contacts-fresh-render.js?v=20260514a'],
      // v381 (2026-05-14 사장님 prod 재발견 + 콘솔 진단): v380 의 modal id 추출 결함.
      //   v380 의 querySelector('[data-listing-id]') 가 모달 안 유사매물 카드의 id 를 잘못 picked up
      //   (예: 매물 114603 모달에 유사매물 114609 의 phone 표시).
      //   fix v381: 모달 헤더의 '매물번호 XXX' 텍스트에서 정확 추출 + contacts container 모달 내부 한정.
      ['ws-ext-patch-v381-modal-id-precise', '/search/content-v381-modal-id-precise.js?v=20260519-step45-throttle'],
      // v382 (2026-05-14 사장님 prod 재발견 반복): v378~v381 모두 race condition.
      //   v270/v322/v378/v379/v380/v381 동시 작동 → 마지막 render 누구 보장 X.
      //   brute force: 500ms polling → modal id 의 정확한 phone DB fetch → 화면 phone 비교 → 강제 덮어쓰기.
      ['ws-ext-patch-v382-contact-polling-enforce', '/search/content-v382-contact-polling-enforce.js?v=20260519-step44-modal-gated'],
            // v332 (2026-05-09 사장님 발견 매물 78752): broken image 자동 retry.
      //   외부 사이트 503 / Lambda error / octet-stream 등 → onerror 시
      //   /api/img-proxy 경유로 자동 재시도 (transparent fallback 흡수).
      //   v318 의 src 변환을 놓치는 timing/dynamic 케이스 보완.
      ['ws-ext-patch-v332-img-onerror-retry', '/search/content-v332-img-onerror-retry.js?v=20260509a'],
      // v333 (2026-05-09 사장님 발견 매물 78954): 모달 hero h1 주소 중복 제거.
      //   v240-detail.js 가 address + address_detail 합치는데 space 차이로
      //   "..리더스가든 17층 2408동 1701 17층 2408동1701" 두 번 표기.
      //   v333 가 끝부분 중복 ("N층 NNNN동 NNNN" 두 번) 자동 제거.
      ['ws-ext-patch-v333-hero-addr-dedup', '/search/content-v333-hero-addr-dedup.js?v=20260520-step124-floordedup'],
      // v334 (2026-05-09 사장님 발견 매물 78954): 모달 hero 도로명 직접 채우기.
      //   "도로명 주소가 구주소 뒤에 숨겨져 있음" — Kakao Geocoder API 가 못 채운
      //   #v240-hero-road element 에 listing.building_info['도로명주소'] 또는
      //   listing.road_address 직접 채워서 "📍 도로명" 표시.
      ['ws-ext-patch-v334-hero-road-fill', '/search/content-v334-hero-road-fill.js?v=20260519-step44-mo-only'],
      // v335 (2026-05-09 사장님 발견): 매물 카드 부 라인 도로명 Kakao fallback.
      //   v327 는 listing.road_address 만 사용 → DB null 매물은 원본 title (건물명) 표시.
      //   v335 가 lat/lng → Kakao reverseGeocoder fallback 으로 도로명 채움.
      ['ws-ext-patch-v335-card-road-fallback', '/search/content-v335-card-road-fallback.js?v=20260519-step38-1s-throttle'],
            // v336 (2026-05-09 사장님 SOTA Step L): 카드 썸네일 강제 ?w=400.
      //   진단: 사장님 측정 26s finish 의 큰 부분 = img-proxy 2-6MB × 수십 장.
      //   해결: MutationObserver 로 img.src ?w=1920 → ?w=400 자동 변환.
      //   모달 hero 사진은 원본 보존 (.v240-hero, .v240-gallery skip).
      // v336 disabled (caused React loop)

      // Step T (2026-05-10): cookie-issue auto for CDN cache
      ['ws-ext-patch-v337-cookie-issue', '/search/content-v337-cookie-issue.js?v=20260510a'],
      // v341 v2 (2026-05-10 사장님 발견): 속도 효과 미체감 -> 보류, 더 정밀한 진단 후 재시도.
      // ['ws-ext-patch-v341-progressive-v2', '/search/content-v341-progressive.js?v=20260510c'],
      // v342 v3 (2026-05-10 Fix 7 사장님 명령): 모달 사진 속도 - REPLACE 방식.
      //   v1/v2 의 skip 버그 fix: ?w=1920 -> ?w=400 (CloudFront 60% 매물).
      //   썸네일 size 5MB -> 50KB (100배 감소). Hero 5MB -> 200KB.
      //   showDetail wrap, 외부 host (zigbang/nemo) 영향 X.
      ['ws-ext-patch-v342-modal-image-priority-v4', '/search/content-v342-modal-image-priority.js?v=20260514v4'],
      // v345 (Fix 22 - 등록 누락 발견 2026-05-10): MutationObserver 로 매물 카드
      //   img 에 loading="lazy" + decoding="async" 추가. viewport 외 사진 fetch
      //   중단 → 100MB transfer → ~10MB. 첫 진입 속도 dramatic 개선.      // v346 (Fix 23 - 등록 누락 발견 2026-05-10): WS.state.perPage = 20 강제.
      //   첫 표시 매물 100건 → 20건. DOM 카드 80개 줄어 render 빠름.
      // [URGENT 2026-05-15] v346 두번째 등록도 disable — 사장님 20 강제 잔존 fix
      // ['ws-ext-patch-v346-default-20-listings', '/search/content-v346-default-20-listings.js?v=20260510a'],
      // v347 (Fix 35 사장님 발견 2026-05-11): 확대 모드 lightbox 1/1 회귀 fix.
      //   v247 (lightbox) data-images 1 entry 만 사용 → 1/1. v250 (모달 갤러리) 는 .ws-thumb fallback 8장.
      //   v347 capture phase 로 .ws-thumb 수집 → data-images attribute 강제 set → v247 가 8장 인식.
      ['ws-ext-patch-v347-lightbox-imgs-fill', '/search/content-v347-lightbox-imgs-fill.js?v=20260511b'],
      // v349-snapshot-ttl (Fix 39): ws_data_snapshot TTL 자동 무효화 (직원 16건 회귀 자동 fix).
      //   1시간 이상 old 또는 100건 미만 자동 삭제. _ts auto injection.
      ['ws-ext-patch-v349-snapshot-ttl', '/search/content-v349-snapshot-ttl.js?v=20260511a'],
      // v350-mobile-ux (Fix 40): 모바일 scroll/PTR/lightbox swipe 자동 fix.
      //   overscroll-behavior: none + touch-action: manipulation + swipe handler.
      ['ws-ext-patch-v350-mobile-ux-fix', '/search/content-v350-mobile-ux-fix.js?v=20260514nativePTR'],
      // v348 disabled (Fix 36b): client wrap 이 v294 defineProperty 와 충돌 (무한 재귀 위험).
      //   server side middleware rewrite (Fix 36b) 로 대체. middleware.ts 의 if block 참고.
    ];
    for (const [id, src] of patches) {
      // [Step 30 진단 2026-05-19] ?disable=v305,v270 등 키워드 매칭 시 skip
      const disabled = (window as unknown as { __WS_DISABLED_PATCHES__?: Set<string> }).__WS_DISABLED_PATCHES__;
      if (disabled && disabled.size > 0) {
        const lowerId = id.toLowerCase();
        let skip = false;
        for (const d of disabled) {
          if (lowerId.includes(d)) { skip = true; break; }
        }
        if (skip) {
          console.warn('[WS-DISABLE-MODE] skip:', id);
          continue;
        }
      }
      if (!document.getElementById(id)) {
        const s = document.createElement('script');
        s.id = id;
        s.src = src;
        s.async = false;
        s.defer = false;
        // [Step127 2026-05-20] 패치 로드 프로파일러 — cold-load freeze 지점 자동 측정.
        //   각 패치 script 의 onload 시각 기록 → 콘솔 [WS-PROF] 로그.
        //   멈추면 마지막 [WS-PROF] 다음 패치가 범인. window.__WS_PROF__ 에도 축적.
        try {
          const _t0 = (performance && performance.now) ? performance.now() : Date.now();
          (window as unknown as { __WS_PROF__?: unknown[] }).__WS_PROF__ =
            (window as unknown as { __WS_PROF__?: unknown[] }).__WS_PROF__ || [];
          s.addEventListener('load', () => {
            try {
              const _t1 = (performance && performance.now) ? performance.now() : Date.now();
              const rec = { id, ms: Math.round(_t1 - _t0), at: Math.round(_t1) };
              (window as unknown as { __WS_PROF__: unknown[] }).__WS_PROF__.push(rec);
              console.log('[WS-PROF]', id, rec.ms + 'ms', '@' + rec.at);
            } catch (e) {}
          });
          s.addEventListener('error', () => {
            try { console.warn('[WS-PROF] LOAD-ERROR', id); } catch (e) {}
          });
        } catch (e) {}
        document.body.appendChild(s);
      }
    }

    // v270 freshness 잔여 정리 (영구 차단)
    try {
      const prev = document.getElementById('ws-ext-patch-v270-freshness');
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      const api = (window as unknown as { __WS_PATCH_V270__?: { rollback?: () => void } }).__WS_PATCH_V270__;
      if (api && typeof api.rollback === 'function') { try { api.rollback(); } catch {} }
      document.querySelectorAll('.v270-sort, #v270-sort-floating, #v270-summary-line, .v270-badge-wrap').forEach((n) => n.remove());
      document.querySelectorAll('[data-v270-badge]').forEach((n) => {
        n.removeAttribute('data-v270-badge');
        n.removeAttribute('data-v270-badge-key');
        n.classList.remove('v270-card-anchor');
      });
      const styleEl = document.getElementById('v270-fresh-styles');
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    } catch {}

  }, [state]);

  if (state === 'loading') {
    return (
      <div style={wrapStyle}>
        <div style={{ color: '#666' }}>로딩 중...</div>
      </div>
    );
  }

  if (state === 'nosession') {
    // L-perf-fix-8-2026-05-10 (사장님 명령): 모달 제거, 즉시 /login redirect.
    //   이전: 모달 표시 → 사용자 클릭 → /login 이동 (1-2초 추가).
    //   이후: 비로그인 검사 즉시 redirect → 로그인 페이지 바로 표시.
    if (typeof window !== 'undefined') {
      window.location.replace('/login?redirect=/search');
    }
    return null;
  }

  return (
    /* L-page-2026-mobile (2026-04-29 사장님 명령): 중개사 포털도 모바일 끝판왕.
       CLAUDE.md 정책: 디자인 X, content.js X. viewport/touch 만 적용. */
    <div
      id="ws-search-root"
      className="ws-mobile-page"
      style={{
        minHeight: '100dvh',
        // dvh 미지원 fallback 은 ws-mobile-page CSS 가 처리.
        WebkitTextSizeAdjust: 'none',
        textSizeAdjust: 'none',
        colorScheme: 'light dark',
        touchAction: 'manipulation',
        wordBreak: 'keep-all',
        scrollbarGutter: 'stable',
      } as React.CSSProperties}
    />
  );
}

const wrapStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: '#f7faf7',
};

const cardStyle: React.CSSProperties = {
  maxWidth: 420,
  width: '100%',
  background: '#fff',
  border: '1px solid #e5eee5',
  borderRadius: 12,
  padding: '32px 28px',
  textAlign: 'center',
  boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 20px',
  background: '#2D5A27',
  color: '#fff',
  borderRadius: 8,
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 20px',
  background: '#f0f5f0',
  color: '#2D5A27',
  borderRadius: 8,
  border: '1px solid #d5e5d5',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};











