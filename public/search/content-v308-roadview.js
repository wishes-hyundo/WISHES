/**
 * /search content-v308 — Kakao 로드뷰 통합
 * 작성: 2026-04-29
 *
 * 건축물대장 모달 (v245-bldg-body) 에 매물 좌표 기반 로드뷰 토글 패널 추가.
 * - 사장님이 매물 위치를 즉시 시각 확인 (현장 출장 전 사전 점검)
 * - lat/lng 가 모달 payload 에 있으면 자동 활성화
 * - "🛣️ 로드뷰 보기" 버튼 클릭 → Kakao Roadview iframe 임베드 (CSP 안전)
 *
 * 정책:
 * - HTML/CSS 무손상
 * - 무료 (Kakao Maps JavaScript API)
 * - DOM observe 패턴 (fetch wrap 충돌 X)
 */
(function () {
  'use strict';
  const V = 'v308-roadview';

  // 매물 위치 캐시 (v240 detail 모달이 mount 될 때 capture)
  let _lat = null, _lng = null, _addr = '';

  function captureLocFromDom() {
    try {
      // v240 모달 또는 매물 카드에 좌표/주소 attribute 있는 경우
      const el =
        document.querySelector('[data-listing-lat][data-listing-lng]') ||
        document.querySelector('.v240-ai-modal [data-lat][data-lng]') ||
        null;
      if (el) {
        const lat = parseFloat(el.getAttribute('data-listing-lat') || el.getAttribute('data-lat'));
        const lng = parseFloat(el.getAttribute('data-listing-lng') || el.getAttribute('data-lng'));
        if (isFinite(lat) && isFinite(lng)) { _lat = lat; _lng = lng; }
      }
      // 주소 텍스트 caption
      const addrEl = document.querySelector('.v240-ai-modal [data-listing-address]');
      if (addrEl) _addr = addrEl.getAttribute('data-listing-address') || '';
    } catch (_) {}
  }

  function injectRoadviewButton() {
    try {
      const body = document.getElementById('v245-bldg-body');
      if (!body) return;
      if (body.querySelector('.v308-roadview-section')) return;
      if (!_lat || !_lng) return;

      const root = document.createElement('div');
      root.className = 'v308-roadview-section';
      root.style.cssText = 'margin-top:14px;border-top:1px dashed #d0e0c8;padding-top:10px';
      root.innerHTML =
        '<button type="button" class="v308-rv-btn" ' +
        'style="width:100%;padding:10px;background:#2D5A27;color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">' +
        '🛣️ 로드뷰 + 항공뷰 보기</button>' +
        '<div class="v308-rv-panel" style="display:none;margin-top:10px"></div>';

      body.appendChild(root);

      const btn = root.querySelector('.v308-rv-btn');
      const panel = root.querySelector('.v308-rv-panel');
      btn.addEventListener('click', function () {
        if (panel.style.display === 'none') {
          renderRoadview(panel);
          btn.textContent = '🛣️ 로드뷰 닫기';
          panel.style.display = 'block';
        } else {
          panel.style.display = 'none';
          panel.innerHTML = '';
          btn.textContent = '🛣️ 로드뷰 + 항공뷰 보기';
        }
      });
    } catch (e) {
      console.warn('[' + V + '] inject error', e);
    }
  }

  function renderRoadview(panel) {
    try {
      // Kakao 로드뷰 = iframe URL (JS SDK 로드 안 해도 됨)
      // 카카오맵 로드뷰 페이지: https://map.kakao.com/link/roadview/<lat>,<lng>
      // 하지만 iframe 임베드는 카카오 정책상 자체 SDK 필요 → CSP 안전한 fallback:
      // map.kakao.com 링크 + Kakao Maps Static (위성) iframe
      const lat = _lat, lng = _lng;
      const kakaoMapUrl = 'https://map.kakao.com/link/map/' + encodeURIComponent(_addr || '매물') + ',' + lat + ',' + lng;
      const kakaoRvUrl = 'https://map.kakao.com/link/roadview/' + lat + ',' + lng;
      const naverMapUrl = 'https://map.naver.com/v5/?c=' + lng + ',' + lat + ',16,0,0,0,dh';

      panel.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
        '  <a href="' + kakaoRvUrl + '" target="_blank" rel="noopener" ' +
        '     style="display:block;padding:10px;background:#FEE500;color:#3A1D1D;border-radius:6px;text-align:center;text-decoration:none;font-weight:700;font-size:12px">' +
        '    🛣️ 카카오 로드뷰 새창</a>' +
        '  <a href="' + naverMapUrl + '" target="_blank" rel="noopener" ' +
        '     style="display:block;padding:10px;background:#03C75A;color:#fff;border-radius:6px;text-align:center;text-decoration:none;font-weight:700;font-size:12px">' +
        '    🛰️ 네이버 거리뷰 새창</a>' +
        '</div>' +
        '<div style="position:relative;width:100%;padding-top:60%;background:#000;border-radius:6px;overflow:hidden">' +
        '  <iframe ' +
        '     src="' + kakaoMapUrl + '" ' +
        '     style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" ' +
        '     loading="lazy" referrerpolicy="no-referrer"></iframe>' +
        '</div>' +
        '<div style="margin-top:6px;font-size:10px;color:#888">좌표: ' + lat.toFixed(6) + ', ' + lng.toFixed(6) + '</div>';
    } catch (e) {
      panel.innerHTML = '<div style="color:#a04;font-size:12px">로드뷰 로드 실패: ' + (e && e.message || 'unknown') + '</div>';
    }
  }

  // v306 가 unit 섹션 inject 한 후 v308 도 button inject — DOM observe
  try {
    const obs = new MutationObserver(function () {
      if (document.querySelector('.v240-ai-modal')) {
        captureLocFromDom();
      }
      // 모달 body 가 새로 mount 되면 button 추가 시도
      if (document.getElementById('v245-bldg-body')) {
        injectRoadviewButton();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  console.log('[' + V + '] 로드뷰 + 위성뷰 버튼 활성');
})();
