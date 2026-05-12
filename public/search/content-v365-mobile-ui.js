/**
 * v365 — Mobile narrow viewport UI cleanup
 * 사장님 명령 2026-05-12.
 *
 * 목적:
 *   갤럭시폴드7 접은 화면 (~370-414px) UI 가독성 + 가용성 향상.
 *   - 필터 영역 더 압축
 *   - 매물 카드 단순/깔끔
 *   - 카운트 박스 한 줄
 *   - 폰트 크기 + 간격 조정
 *
 * 회귀 회피:
 *   - 새 CSS 만 inject (다른 patches 안 건드림)
 *   - ws- prefix selector 만 → wishes UI 한정
 *   - @media query 로 modile 만 (PC 영향 0)
 *   - 등록 안 하면 prod 영향 0
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
      style.setAttribute('data-v365', 'mobile-ui');
      style.textContent = [
        '/* ── v365 모바일 UI 정리 ── */',

        '/* 폰 (≤480px) */',
        '@media (max-width: 480px) {',
        '  /* 헤더 압축 */',
        '  .ws-header { padding: 8px 12px !important; }',
        '  .ws-title { font-size: 16px !important; }',
        '  .ws-global-search input { font-size: 13px !important; padding: 6px 10px !important; }',
        '',
        '  /* 매물 유형 탭 — 가로 스크롤 */',
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
        '  /* 지역 탭 압축 */',
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
        '  /* 필터 영역 압축 */',
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
        '  /* 가격 / 면적 입력 압축 */',
        '  .ws-price-grid { gap: 6px !important; }',
        '  .ws-price-cell { padding: 6px !important; }',
        '  .ws-price-inputs { gap: 4px !important; }',
        '  .ws-price-input, .ws-area-input, .ws-keyword-input {',
        '    font-size: 12px !important;',
        '    padding: 6px 8px !important;',
        '    height: 32px !important;',
        '  }',
        '',
        '  /* 관리 dashboard 카운트 박스 — 가로 한 줄 */',
        '  .ws-mgmt-dashboard {',
        '    display: flex !important;',
        '    gap: 6px !important;',
        '    padding: 8px !important;',
        '    overflow-x: auto;',
        '  }',
        '  .ws-mgmt-stat {',
        '    flex: 1 1 auto !important;',
        '    padding: 6px 4px !important;',
        '    font-size: 11px !important;',
        '    min-width: 0 !important;',
        '  }',
        '  #ws-mgmt-total, #ws-mgmt-public, #ws-mgmt-private {',
        '    font-size: 14px !important;',
        '    font-weight: 700 !important;',
        '  }',
        '',
        '  /* 검색결과 헤더 압축 */',
        '  .ws-results-header {',
        '    padding: 6px 10px !important;',
        '    font-size: 12px !important;',
        '  }',
        '',
        '  /* 매물 카드 단순 layout */',
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
        '  /* 페이지네이션 버튼 작게 */',
        '  .ws-pagination { gap: 2px !important; padding: 8px !important; flex-wrap: wrap !important; }',
        '  .ws-page-btn {',
        '    min-width: 28px !important;',
        '    height: 28px !important;',
        '    padding: 2px 6px !important;',
        '    font-size: 11px !important;',
        '  }',
        '',
        '  /* 버튼 크기 */',
        '  .ws-btn { font-size: 12px !important; padding: 6px 10px !important; }',
        '}',

        '/* 폴드 접음 (≤414px) — 더 좁음 */',
        '@media (max-width: 414px) {',
        '  .ws-listing-card { padding: 8px !important; gap: 6px !important; }',
        '  .ws-card-info > div { font-size: 11px !important; }',
        '  .ws-mgmt-stat { font-size: 10px !important; padding: 4px 2px !important; }',
        '  #ws-mgmt-total, #ws-mgmt-public, #ws-mgmt-private { font-size: 13px !important; }',
        '  .ws-type-tab { font-size: 11px !important; padding: 3px 6px !important; }',
        '  .ws-fchip { font-size: 10px !important; padding: 2px 5px !important; }',
        '  .ws-page-btn { min-width: 26px !important; height: 26px !important; font-size: 10px !important; }',
        '}',

        '/* 폴드 더 좁음 (≤374px) */',
        '@media (max-width: 374px) {',
        '  .ws-listing-card { padding: 6px !important; }',
        '  .ws-card-info > div { font-size: 10px !important; line-height: 1.3 !important; }',
        '  .ws-page-btn { min-width: 24px !important; height: 24px !important; font-size: 9px !important; }',
        '}',
      ].join('\n');
      document.head.appendChild(style);
      try { console.log('[v365-mobile-ui] CSS injected (mobile ≤480/414/374px)'); } catch(_){}
    } catch (e) {
      try { console.log('[v365-mobile-ui] err:', e && e.message); } catch(_){}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  } else {
    injectCSS();
  }
})();
