/**
 * v365 v2 — Mobile narrow viewport UI cleanup (flex-wrap fix + m² 버튼)
 * 사장님 명령 2026-05-12.
 *
 * v2 변경:
 *   - .ws-mgmt-dashboard 의 inline style flex-wrap:wrap → nowrap 강제 (가로 한 줄)
 *   - .ws-unit-toggle, .ws-unit-label (m² 등) 작게
 *   - .ws-mgmt-stat 가로 스크롤 + 적절 min-width
 *
 * 회귀 회피:
 *   - CSS 만 inject (JS 동작 안 건드림)
 *   - @media query 로 mobile 만 (PC 영향 0)
 *   - !important 로 inline style override
 */
(function () {
  'use strict';
  if (window.__WS_V365_MOBILE_UI__) return;
  window.__WS_V365_MOBILE_UI__ = true;

  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function injectCSS() {
    try {
      var style = document.createElement('style');
      style.setAttribute('data-v365', 'mobile-ui-v2');
      style.textContent = [
        '/* ── v365 v2 모바일 UI 정리 ── */',

        '@media (max-width: 480px) {',
        '  /* 헤더 */',
        '  .ws-header { padding: 8px 12px !important; }',
        '  .ws-title { font-size: 16px !important; }',
        '  .ws-global-search input { font-size: 13px !important; padding: 6px 10px !important; }',
        '',
        '  /* 매물 유형 탭 가로 스크롤 */',
        '  .ws-type-tabs {',
        '    overflow-x: auto !important;',
        '    -webkit-overflow-scrolling: touch;',
        '    white-space: nowrap !important;',
        '    flex-wrap: nowrap !important;',
        '    gap: 4px !important;',
        '    padding: 6px 8px !important;',
        '  }',
        '  .ws-type-tab {',
        '    flex: 0 0 auto !important;',
        '    padding: 4px 8px !important;',
        '    font-size: 12px !important;',
        '  }',
        '  .ws-type-tab .ws-count {',
        '    font-size: 10px !important;',
        '    margin-left: 3px !important;',
        '  }',
        '',
        '  /* 지역 탭 */',
        '  .ws-region-tabs {',
        '    overflow-x: auto !important;',
        '    white-space: nowrap !important;',
        '    flex-wrap: nowrap !important;',
        '    gap: 4px !important;',
        '    padding: 4px 8px !important;',
        '  }',
        '  .ws-region-tab {',
        '    flex: 0 0 auto !important;',
        '    padding: 4px 8px !important;',
        '    font-size: 12px !important;',
        '  }',
        '',
        '  /* 필터 */',
        '  .ws-filters-section { padding: 8px !important; }',
        '  .ws-filter-grid { gap: 6px !important; }',
        '  .ws-filter-col { font-size: 12px !important; padding: 6px !important; }',
        '  .ws-filter-col-header { font-size: 11px !important; padding: 4px !important; }',
        '  .ws-filter-col-body { padding: 4px !important; }',
        '  .ws-fchip {',
        '    font-size: 11px !important;',
        '    padding: 3px 6px !important;',
        '    margin: 2px !important;',
        '  }',
        '',
        '  /* 가격 / 면적 */',
        '  .ws-price-grid { gap: 6px !important; }',
        '  .ws-price-cell { padding: 6px !important; }',
        '  .ws-price-inputs { gap: 4px !important; }',
        '  .ws-price-input, .ws-area-input, .ws-keyword-input {',
        '    font-size: 12px !important;',
        '    padding: 6px 8px !important;',
        '    height: 32px !important;',
        '  }',
        '',
        '  /* ★ 핵심 fix — m² unit 버튼 작게 */',
        '  .ws-unit-toggle, .ws-unit-label {',
        '    padding: 4px 8px !important;',
        '    font-size: 11px !important;',
        '    min-width: 32px !important;',
        '    width: auto !important;',
        '    height: 28px !important;',
        '    line-height: 1 !important;',
        '  }',
        '',
        '  /* ★ 핵심 fix — mgmt dashboard 가로 한 줄 (inline style override) */',
        '  .ws-mgmt-dashboard {',
        '    display: flex !important;',
        '    flex-direction: row !important;',
        '    flex-wrap: nowrap !important;',
        '    overflow-x: auto !important;',
        '    -webkit-overflow-scrolling: touch !important;',
        '    gap: 4px !important;',
        '    padding: 6px !important;',
        '    margin: 6px 4px !important;',
        '  }',
        '  .ws-mgmt-stat {',
        '    flex: 1 1 auto !important;',
        '    min-width: 56px !important;',
        '    max-width: 100px !important;',
        '    padding: 6px 4px !important;',
        '    font-size: 11px !important;',
        '    white-space: nowrap !important;',
        '    text-align: center !important;',
        '  }',
        '  #ws-mgmt-total, #ws-mgmt-public, #ws-mgmt-private {',
        '    font-size: 14px !important;',
        '    font-weight: 700 !important;',
        '  }',
        '',
        '  /* 검색결과 헤더 */',
        '  .ws-results-header {',
        '    padding: 6px 10px !important;',
        '    font-size: 12px !important;',
        '  }',
        '',
        '  /* 매물 카드 */',
        '  .ws-listings { padding: 0 !important; }',
        '  .ws-listing-card {',
        '    padding: 10px !important;',
        '    margin-bottom: 6px !important;',
        '    border-radius: 6px !important;',
        '    gap: 8px !important;',
        '  }',
        '  .ws-card-info { gap: 4px !important; }',
        '  .ws-card-info > div { font-size: 12px !important; line-height: 1.4 !important; }',
        '  .ws-card-right { gap: 4px !important; min-width: 80px !important; }',
        '  .ws-card-right .ws-btn { font-size: 11px !important; padding: 4px 8px !important; }',
        '',
        '  /* 페이지네이션 */',
        '  .ws-pagination { gap: 2px !important; padding: 8px !important; flex-wrap: wrap !important; }',
        '  .ws-page-btn {',
        '    min-width: 28px !important;',
        '    height: 28px !important;',
        '    padding: 2px 6px !important;',
        '    font-size: 11px !important;',
        '  }',
        '',
        '  /* 버튼 */',
        '  .ws-btn { font-size: 12px !important; padding: 6px 10px !important; }',
        '}',

        '@media (max-width: 414px) {',
        '  .ws-listing-card { padding: 8px !important; gap: 6px !important; }',
        '  .ws-card-info > div { font-size: 11px !important; }',
        '  .ws-mgmt-stat { font-size: 10px !important; padding: 4px 2px !important; min-width: 50px !important; }',
        '  #ws-mgmt-total, #ws-mgmt-public, #ws-mgmt-private { font-size: 13px !important; }',
        '  .ws-type-tab { font-size: 11px !important; padding: 3px 6px !important; }',
        '  .ws-fchip { font-size: 10px !important; padding: 2px 5px !important; }',
        '  .ws-page-btn { min-width: 26px !important; height: 26px !important; font-size: 10px !important; }',
        '  .ws-unit-toggle, .ws-unit-label { padding: 3px 6px !important; font-size: 10px !important; min-width: 28px !important; height: 26px !important; }',
        '}',

        '@media (max-width: 374px) {',
        '  .ws-listing-card { padding: 6px !important; }',
        '  .ws-card-info > div { font-size: 10px !important; line-height: 1.3 !important; }',
        '  .ws-mgmt-stat { min-width: 44px !important; }',
        '  .ws-page-btn { min-width: 24px !important; height: 24px !important; font-size: 9px !important; }',
        '  .ws-unit-toggle, .ws-unit-label { min-width: 26px !important; font-size: 9px !important; }',
        '}',
      ].join('\n');
      document.head.appendChild(style);
      try { console.log('[v365-mobile-ui-v2] CSS injected (flex-wrap nowrap + m² 작게)'); } catch(_){}
    } catch (e) {
      try { console.log('[v365-mobile-ui-v2] err:', e && e.message); } catch(_){}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  } else {
    injectCSS();
  }
})();
