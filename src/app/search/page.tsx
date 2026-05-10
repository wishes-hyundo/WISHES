'use client';

/**
 * /search ??以묎컻???ы꽭
 */

import React, { useEffect, useState } from 'react';
import { createAuthClient } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminFetch';

type PageState = 'loading' | 'nosession' | 'ok';

export default function SearchPortalPage() {
  const [state, setState] = useState<PageState>('loading');

  // L-cache-nuke (2026-04-29): ?ъ옣??cache ?곴뎄 stale ?몄냼. /search 吏꾩엯 ???먮룞
  //   Service Worker unregister + Cache API 紐⑤몢 ??젣. 留ㅻ쾲 fresh 蹂댁옣.
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
    const script = document.createElement('script');
    script.id = 'ws-ext-content';
    script.src = '/search/content.js?v=20260429-bldggroup';
    script.async = false;
    document.body.appendChild(script);

    const patches: Array<[string, string]> = [
      ['ws-ext-patch', '/search/content-v230-patch.js?v=20260502'],
      ['ws-ext-patch-v240', '/search/content-v240-detail.js?v=20260420g'],
      ['ws-ext-patch-v260-perf', '/search/content-v260-perf.js?v=20260428real'],
      ['ws-ext-patch-v270-contacts', '/search/content-v270-contacts.js?v=20260418a1'],
      ['ws-ext-patch-v280-mobile', '/search/content-v280-mobile.js?v=20260420b'],
      ['ws-ext-patch-v290-polish', '/search/content-v290-polish.js?v=20260420b'],
      ['ws-ext-patch-v291-stability', '/search/content-v291-stability.js?v=20260510a'],
      ['ws-ext-patch-v292-global-search', '/search/content-v292-global-search.js?v=20260509a'],
      ['ws-ext-patch-v293-alert-log', '/search/content-v293-alert-log.js?v=20260420c'],
      ['ws-ext-patch-v294-scope', '/search/content-v294-scope.js?v=20260428legacy2'],
      ['ws-ext-patch-v295-detail-hydrate', '/search/content-v295-detail-hydrate.js?v=20260424d'],
      ['ws-ext-patch-v297-edit', '/search/content-v297-edit.js?v=20260429-reload'],
      ['ws-ext-patch-v300-aidesc-v2', '/search/content-v300-aidesc-v2.js?v=20260427a'],
      ['ws-ext-patch-v306-bldg-unit', '/search/content-v306-bldg-unit.js?v=20260429rev4'],
      ['ws-ext-patch-v307-listing-form', '/search/content-v307-listing-form.js?v=20260428redirect'],
      ['ws-ext-patch-v308-roadview', '/search/content-v308-roadview.js?v=20260429e'],
      ['ws-ext-patch-v310-modal-completeness', '/search/content-v310-modal-completeness.js?v=20260429a'],
      ['ws-ext-patch-v311-nearest-stations', '/search/content-v311-nearest-stations.js?v=20260429a'],
      ['ws-ext-patch-v318-mobile-image-fix', '/search/content-v318-mobile-image-fix.js?v=20260509c'],
      ['ws-ext-patch-v319-hero-dedup', '/search/content-v319-hero-dedup.js?v=20260429a'],
      // v312 (2026-04-29): 硫붿씤 紐⑤떖 ?꾩쑀遺 (.v240-info2 ???꾩슜/怨듭슜/珥앸㈃??row) +
      //   Hero ?곸뿭 留ㅻЪ?섏젙 踰꾪듉 + priceBox 諛몃윴??fix.
      ['ws-ext-patch-v312-main-modal-unit', '/search/content-v312-main-modal-unit.js?v=20260429bob'],
      // v313 (2026-04-29): 留ㅻЪ?섏젙 ?⑤꼸 inline ?ъ쭊 留ㅻ땲? ??drag-drop ?낅줈??
      //   ?쒕쾭痢?Classic Negative + ?뚰꽣留덊겕 ?먮룞, '怨좉툒 蹂댁젙' ??/admin/photo-enhancer.
      //   View Transitions / Container Queries / Popover / WCAG 2.2 AAA / oklch.
      // v313 entry ?쒓굅 (CDN stale cache + v315 ? 以묐났 mount 臾몄젣). v315 留??ъ슜.
      // v315 (2026-04-29): 留ㅻЪ?섏젙 ?⑤꼸 inline ?ъ쭊/?숈쁺??留ㅻ땲? BoB.
      ['ws-ext-patch-v315-edit-photos', '/search/content-v315-edit-photos.js?v=20260429-dragonly'],
      // v316 (2026-04-29): raw_fields ??援ъ“?뺥깭/?꾨?湲곌컙/二쇱감???硫댁쟻/猷??깆쓣
      //   紐⑤떖 鍮?????먮룞 梨꾩?. ?ъ옣??紐낅졊 ??蹂몃Ц蹂닿린?????덈뒗???쒖떆 X 臾몄젣 fix.
      ['ws-ext-patch-v316-rawfields-fill', '/search/content-v316-modal-rawfields-fill.js?v=20260429-lidmarker'],
      // v317 (2026-04-29): 移댁뭅??湲곕컲 二쇰? ?쒖꽕 (吏?섏쿋 + 踰꾩뒪?뺣쪟??
      ['ws-ext-patch-v317-nearby-poi', '/search/content-v317-nearby-poi.js?v=20260429-addrfb'],
      // v320 (2026-04-29 ?ъ옣??紐낅졊): v240 紐⑤떖 [+ 異붽?] ?몃뱾???꾨씫 fix.
      //   IIFE + try/catch + MutationObserver. UI/寃?됯껐怨??곹뼢 0.
      ['ws-ext-patch-v320-contact-add', '/search/content-v320-contact-add.js?v=20260429-show'],
      // v322 (2026-04-29 ?ъ옣??紐낅졊): contacts ?붾㈃ 誘명몴??fix.
      //   v270 fetchCache ?고쉶 + DB fresh fetch ??.v240-contacts-empty ?곸뿭 吏곸젒 ?뚮뜑.
      ['ws-ext-patch-v322-contacts-render', '/search/content-v322-contacts-render.js?v=20260429-fresh'],
      // v323 (2026-04-29 ?ъ옣??紐낅졊): contacts ?섏젙/??젣 踰꾪듉 + ?몃뱾??+ DB sync.
      ['ws-ext-patch-v323-contact-edit-del', '/search/content-v323-contact-edit-del.js?v=20260429-editdel'],
      // v314 (2026-04-29): 留ㅻЪ?섏젙 踰꾪듉 ?꾩튂 ?대룞 ??hero ?먯꽌 '湲곕낯 ?뺣낫쨌?듭뀡'
      //   ?뱀뀡 ?ㅻ뜑 ?곗륫 ?앹쑝濡?(?ъ옣???쒖븞). View Transitions 60fps + oklch.
      ['ws-ext-patch-v314-edit-btn-pos', '/search/content-v314-edit-btn-pos.js?v=20260429a'],
      // v324 (2026-04-29 ?ъ옣??紐낅졊): 異쒖쿂 諭껋? ??怨듭떎?대읇=?뚮옉G / ?⑦븯?곗뒪=鍮④컯O.
      //   移대뱶 二쇱냼 ?쇱씤 + 紐⑤떖 hero 媛뺤젣 蹂댁옣. content.js ??湲곗〈 ?뱀깋/二쇳솴 諭껋?
      //   ?먮룞 援먯껜. v324b: 留ㅻЪ踰덊샇 ??mini 諭껋???以묐났?대씪 ?쒓굅.
      ['ws-ext-patch-v324-source-badge', '/search/content-v324-source-badge.js?v=20260429b'],
      // v325 (2026-04-29 ?ъ옣??紐낅졊): 留ㅻЪ踰덊샇 媛뺤“ 諭껋? ??移대뱶 .ws-listing-tags
      //   泥??먯떇?쇰줈 "留ㅻЪ {id}" 諭껋? (#2D5A27 吏숈? ?뱀깋) prepend, ?대┃ ??蹂듭궗.
      //   湲곗〈 ?곗륫 .ws-listing-id 媛 ??蹂댁씤?ㅻ뒗 蹂닿퀬 ??痢듭닔 ??怨좎젙 諛곗튂.
      ['ws-ext-patch-v325-listing-id-tag', '/search/content-v325-listing-id-tag.js?v=20260429a'],
      // v326 (2026-04-29 ?ъ옣??紐낅졊): mini 異쒖쿂 諭껋? cleanup-only.
      //   v324b 媛 留뚮뱺 cleanup 肄붾뱶媛 Vercel CDN edge stale 濡??由ъ? ?딆븘 蹂꾧컻
      //   path ???⑥씪梨낆엫 patch 濡??고쉶. .ws-src-badge-mini 留??쒓굅.
      ['ws-ext-patch-v326-cleanup-mini-badge', '/search/content-v326-cleanup-mini-badge.js?v=20260429a'],
      // v327 (2026-04-29 ?ъ옣??紐낅졊): 移대뱶 遺 ?쇱씤 = ?꾨줈紐낆＜??(?덉쓣 ?뚮쭔).
      //   硫붿씤? 援듭? 吏踰덉＜??洹몃?濡?/ 遺???낆? ?뚯깋 ?꾨줈紐낆＜??(#6b7280).
      //   v327b: ?꾨줈紐낆뿉????援?prefix ?쒓굅 (硫붿씤 以묐났 諛⑹?).
      ['ws-ext-patch-v327-road-address-sub', '/search/content-v327-road-address-sub.js?v=20260429b'],
      // v328 (2026-04-29 ?ъ옣??紐낅졊): 硫붿씤 二쇱냼 ?쇱씤 ?뺤떇 ??"(嫄대Ъ紐?" 愿꾪샇 ?쒓굅 ??      //   "[吏踰덉＜?? [嫄대Ъ紐? [痢? [??" ?뺤떇?쇰줈 ?ш뎄??
      ['ws-ext-patch-v328-main-addr-format', '/search/content-v328-main-addr-format.js?v=20260509a'],
      // v329 (2026-04-29 ?ъ옣??紐낅졊): 怨듭떎 ?쇰꺼 ?뺥솗????status=怨듦컻 臾댁감蹂???
      //   available_date 湲곗? "怨듭떎/嫄곗＜以??묒쓽?낆＜/YY.MM ?낆＜/hide" 遺꾧린.
      ['ws-ext-patch-v329-vacancy-label', '/search/content-v329-vacancy-label.js?v=20260429a'],
      // v330 (2026-04-29 ?ъ옣??紐낅졊): 猷??쇰꺼 ??"1媛?諛? ??"?먮８/?щ８/1.5猷??곕━猷??곕━猷?"
      //   listing.rooms ?レ옄 湲곗? 蹂?? selectFields ??'rooms' ?ы븿.
      ['ws-ext-patch-v330-room-label', '/search/content-v330-room-label.js?v=20260429a'],
      // v331 (2026-04-29 ?ъ옣??蹂닿퀬): onhouse 紐⑤떖 寃???붾㈃ ??placeholder.
      //   listing_images 0嫄?留ㅻЪ??hero ?곸뿭 寃????"?ъ쭊 以鍮꾩쨷" + ?먮낯 留곹겕.
      ['ws-ext-patch-v331-onhouse-image-placeholder', '/search/content-v331-onhouse-image-placeholder.js?v=20260429a'],
      // v321 (2026-05-09 ?ъ옣??諛쒓껄 ??I-STORAGE-1): localStorage quota ?먮룞 ?뺣━.
      //   留ㅻЪ 30,420嫄???ws_data_snapshot/ws_price_snapshots 罹먯떆 ~9MB ??quota 珥덇낵
      //   ??"??κ났媛?遺議? ?좎뒪??臾댄븳 諛섎났. Storage.prototype.setItem 媛濡쒖콈湲곕줈
      //   quota ???먮룞 cleanup + ?ъ떆?? ?ъ옣???곗씠??(利먭꺼李얘린/硫붾え/?곕씫泥??대뜑)
      //   SAFE_PRESERVE ?곴뎄 蹂댄샇. ?좎뒪??10遺?throttle.
      ['ws-ext-patch-v321-storage-cleanup', '/search/content-v321-storage-cleanup.js?v=20260509j'],
      // v332 (2026-05-09 ?ъ옣??諛쒓껄 留ㅻЪ 78752): broken image ?먮룞 retry.
      //   ?몃? ?ъ씠??503 / Lambda error / octet-stream ????onerror ??      //   /api/img-proxy 寃쎌쑀濡??먮룞 ?ъ떆??(transparent fallback ?≪닔).
      //   v318 ??src 蹂?섏쓣 ?볦튂??timing/dynamic 耳?댁뒪 蹂댁셿.
      ['ws-ext-patch-v332-img-onerror-retry', '/search/content-v332-img-onerror-retry.js?v=20260509a'],
      // v333 (2026-05-09 ?ъ옣??諛쒓껄 留ㅻЪ 78954): 紐⑤떖 hero h1 二쇱냼 以묐났 ?쒓굅.
      //   v240-detail.js 媛 address + address_detail ?⑹튂?붾뜲 space 李⑥씠濡?      //   "..由щ뜑?ㅺ???17痢?2408??1701 17痢?2408??701" ??踰??쒓린.
      //   v333 媛 ?앸?遺?以묐났 ("N痢?NNNN??NNNN" ??踰? ?먮룞 ?쒓굅.
      ['ws-ext-patch-v333-hero-addr-dedup', '/search/content-v333-hero-addr-dedup.js?v=20260509a'],
      // v334 (2026-05-09 ?ъ옣??諛쒓껄 留ㅻЪ 78954): 紐⑤떖 hero ?꾨줈紐?吏곸젒 梨꾩슦湲?
      //   "?꾨줈紐?二쇱냼媛 援ъ＜???ㅼ뿉 ?④꺼???덉쓬" ??Kakao Geocoder API 媛 紐?梨꾩슫
      //   #v240-hero-road element ??listing.building_info['?꾨줈紐낆＜??] ?먮뒗
      //   listing.road_address 吏곸젒 梨꾩썙??"?뱧 ?꾨줈紐? ?쒖떆.
      ['ws-ext-patch-v334-hero-road-fill', '/search/content-v334-hero-road-fill.js?v=20260509h'],
      // v335 (2026-05-09 ?ъ옣??諛쒓껄): 留ㅻЪ 移대뱶 遺 ?쇱씤 ?꾨줈紐?Kakao fallback.
      //   v327 ??listing.road_address 留??ъ슜 ??DB null 留ㅻЪ? ?먮낯 title (嫄대Ъ紐? ?쒖떆.
      //   v335 媛 lat/lng ??Kakao reverseGeocoder fallback ?쇰줈 ?꾨줈紐?梨꾩?.
      ['ws-ext-patch-v335-card-road-fallback', '/search/content-v335-card-road-fallback.js?v=20260509b'],
            // v336 (2026-05-09 ?ъ옣??SOTA Step L): 移대뱶 ?몃꽕??媛뺤젣 ?w=400.
      //   吏꾨떒: ?ъ옣??痢≪젙 26s finish ????遺遺?= img-proxy 2-6MB 횞 ?섏떗 ??
      //   ?닿껐: MutationObserver 濡?img.src ?w=1920 ???w=400 ?먮룞 蹂??
      //   紐⑤떖 hero ?ъ쭊? ?먮낯 蹂댁〈 (.v240-hero, .v240-gallery skip).
      // v336 disabled (caused React loop)

      // Step T (2026-05-10): cookie-issue auto for CDN cache
      ['ws-ext-patch-v337-cookie-issue', '/search/content-v337-cookie-issue.js?v=20260510a'],
      // v340 (2026-05-10 Plan C): ws_data_snapshot localStorage -> IndexedDB.
      //   localStorage 5MB -> IDB 50MB+. quota toast permanent fix.
      //   v321 setItem wrapper outer -> ws_data_snapshot only intercepted.
      ['ws-ext-patch-v340-snapshot-idb', '/search/content-v340-snapshot-idb.js?v=20260510a'],
      // v341 (2026-05-10 Plan B Progressive): first 20 listings shown in 1s.
      //   /api/admin/listings?fields=minimal first fetch -> paginated=1&limit=20.
      //   Background cursor fetch BG_LIMIT=1000 each -> WS.allListings.push + renderAll.
      //   Must load AFTER v294 (auth wrap) -> last entry = outer fetch wrapper.
      ['ws-ext-patch-v341-progressive', '/search/content-v341-progressive.js?v=20260510a'],
      // v345 (2026-05-10 Fix 22 - 등록 누락 발견 2026-05-10): MutationObserver 로
      //   모든 매물 카드 img 에 loading="lazy" + decoding="async" 추가. viewport 외
      //   사진 fetch 중단 -> 100MB transfer -> ~10MB. 사장님 첫 진입 속도 dramatic 개선.
      ['ws-ext-patch-v345-img-lazy', '/search/content-v345-img-lazy.js?v=20260510a'],
      // v346 (2026-05-10 Fix 23 - 등록 누락 발견 2026-05-10): WS.state.perPage = 20 강제.
      //   첫 표시 매물 100건 → 20건. DOM 카드 80개 줄어 render time 감소.
      ['ws-ext-patch-v346-default-20-listings', '/search/content-v346-default-20-listings.js?v=20260510a'],
    ];
    for (const [id, src] of patches) {
      if (!document.getElementById(id)) {
        const s = document.createElement('script');
        s.id = id;
        s.src = src;
        s.async = false;
        s.defer = false;
        document.body.appendChild(s);
      }
    }

    // v270 freshness ?붿뿬 ?뺣━ (?곴뎄 李⑤떒)
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
        <div style={{ color: '#666' }}>濡쒕뵫 以?..</div>
      </div>
    );
  }

  if (state === 'nosession') {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>?뵍</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#2D5A27' }}>濡쒓렇?몄씠 ?꾩슂?⑸땲??/h1>
          <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 24, fontSize: 14 }}>
            以묎컻???ы꽭? ?뱀씤??吏곸썝留??댁슜?????덉뒿?덈떎.<br />怨꾩젙?쇰줈 濡쒓렇?명빐二쇱꽭??
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <a href="/login?redirect=/search" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>濡쒓렇??/a>
            <a href="/signup" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>?뚯썝媛??/a>
          </div>
        </div>
      </div>
    );
  }

  return (
    /* L-page-2026-mobile (2026-04-29 ?ъ옣??紐낅졊): 以묎컻???ы꽭??紐⑤컮???앺뙋??
       CLAUDE.md ?뺤콉: ?붿옄??X, content.js X. viewport/touch 留??곸슜. */
    <div
      id="ws-search-root"
      className="ws-mobile-page"
      style={{
        minHeight: '100dvh',
        // dvh 誘몄???fallback ? ws-mobile-page CSS 媛 泥섎━.
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
}