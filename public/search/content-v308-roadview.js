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
      const el =
        document.querySelector('[data-listing-lat][data-listing-lng]') ||
        document.querySelector('.v240-ai-modal [data-lat][data-lng]') ||
        null;
      if (el) {
        const lat = parseFloat(el.getAttribute('data-listing-lat') || el.getAttribute('data-lat'));
        const lng = parseFloat(el.getAttribute('data-listing-lng') || el.getAttribute('data-lng'));
        if (isFinite(lat) && isFinite(lng)) { _lat = lat; _lng = lng; }
      }
      const addrEl = document.querySelector('.v240-ai-modal [data-listing-address]');
      if (addrEl) _addr = addrEl.getAttribute('data-listing-address') || '';
      // 주소 fallback — v245 모달 헤더 .sub 텍스트
      if (!_addr) {
        const bldgModal = document.querySelector('#v245-bldg-modal, .v240-ai-modal');
        if (bldgModal) {
          const subEl = bldgModal.querySelector('.sub, .v245-sub, p, h3 + div');
          if (subEl) {
            const t = (subEl.textContent || '').trim();
            const m = t.match(/(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)[\s\S]{0,100}?(?=·|$)/);
            if (m) _addr = m[0].trim();
            else if (t) _addr = t.split(/[·\n]/)[0].trim();
          }
        }
      }
    } catch (_) {}
  }

  function injectRoadviewButton() {
    try {
      const body = document.getElementById('v245-bldg-body');
      if (!body) return;
      if (body.querySelector('.v308-roadview-section')) return;
      if (!_lat && !_lng && !_addr) return;  // 셋 다 없으면 skip

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
      const lat = _lat, lng = _lng;
      const hasCoord = lat != null && lng != null && isFinite(lat) && isFinite(lng);
      const kakaoMapUrl = hasCoord
        ? 'https://map.kakao.com/link/map/' + encodeURIComponent(_addr || '매물') + ',' + lat + ',' + lng
        : 'https://map.kakao.com/?q=' + encodeURIComponent(_addr || '매물');
      const kakaoRvUrl = hasCoord
        ? 'https://map.kakao.com/link/roadview/' + lat + ',' + lng
        : 'https://map.kakao.com/?map_type=TYPE_SKYVIEW&q=' + encodeURIComponent(_addr || '매물');
      const naverMapUrl = hasCoord
        ? 'https://map.naver.com/v5/?c=' + lng + ',' + lat + ',16,0,0,0,dh'
        : 'https://map.naver.com/p/search/' + encodeURIComponent(_addr || '매물');

      panel.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
        '  <a href="' + kakaoRvUrl + '" target="_blank" rel="noopener" ' +
        '     style="display:block;padding:10px;background:#FEE500;color:#3A1D1D;border-radius:6px;text-align:center;text-decoration:none;font-weight:700;font-size:12px">' +
        '    🛣️ 카카오 로드뷰 새창</a>' +
        '  <a href="' + naverMapUrl + '" target="_blank" rel="noopener" ' +
        '     style="display:block;padding:10px;background:#03C75A;color:#fff;border-radius:6px;text-align:center;text-decoration:none;font-weight:700;font-size:12px">' +
        '    🛰️ 네이버 거리뷰 새창</a>' +
        '</div>' +
        '<div style="background:#f4f9f1;padding:12px;border-radius:6px;font-size:12px;color:#666;line-height:1.6;text-align:center">' +
        '🛰️ 위 버튼을 눌러 새 창에서 로드뷰/거리뷰를 확인하세요.<br>' +
        '<span style="font-size:11px;color:#aaa">(카카오/네이버 정책상 페이지 내 임베드 X)</span>' +
        '</div>' +
        (hasCoord ? '<div style="margin-top:6px;font-size:10px;color:#888">좌표: ' + lat.toFixed(6) + ', ' + lng.toFixed(6) + '</div>' : '<div style="margin-top:6px;font-size:10px;color:#888">주소: ' + escHtml(_addr || '-') + '</div>');
    } catch (e) {
      panel.innerHTML = '<div style="color:#a04;font-size:12px">로드뷰 로드 실패: ' + (e && e.message || 'unknown') + '</div>';
    }
  }

  // v306 가 unit 섹션 inject 한 후 v308 도 button inject — DOM observe
  try {
    // [Step 53 fix 2026-05-19 사장님 명령] throttle 400ms — 모달 inject 폭주 차단
    let __v308_throttle = null;
    const obs = new MutationObserver(function () {
      if (__v308_throttle) return;
      __v308_throttle = setTimeout(function () { __v308_throttle = null; }, 400);
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


  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  console.log('[' + V + '] 로드뷰 + 위성뷰 버튼 활성');
})();
