/**
 * v372 — 우상단 ⋮ 토글 메뉴 + "UI 개선 패치 vX.X.X 적용됨" 토스트 영구 제거
 * 사장님 명령 2026-05-14.
 *
 * v371 가 만료badge + 종 알림 + 큰글씨 모두 display:none 으로 숨겼는데
 * 사장님 질문: "사라지면 어떻게 이용해?"
 *
 * v372 해결:
 *   1. 우상단 작은 ⋮ 버튼 (28x28, opacity 0.5) 클릭 시
 *      body.ws-tools-expanded class toggle → 3개 element 다시 보임
 *   2. v230-patch.js 가 매번 띄우는 "UI 개선 패치 vX.X.X 적용됨" 토스트
 *      MutationObserver 로 즉시 제거 (디버그성, 사용자 정보 0)
 *
 * 회귀 회피: 새 파일, v371 + 기타 그대로 유지
 */
(function () {
  'use strict';
  if (window.__WS_V372_TOOLS_TOGGLE__) return;
  window.__WS_V372_TOOLS_TOGGLE__ = true;
  var host = location.hostname;
  if (host.indexOf('wishes.co.kr') === -1 && host !== 'localhost') return;
  if (location.pathname.indexOf('/search') !== 0) return;

  function killPatchToast(root) {
    if (!root || !root.querySelectorAll) return false;
    var candidates = root.querySelectorAll('div, span');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.children.length > 3) continue;
      var t = el.textContent || '';
      if (t.indexOf('UI 개선 패치') > -1 && (t.indexOf('적용') > -1 || t.indexOf('v') > -1)) {
        try { el.remove(); return true; } catch (_) {}
      }
    }
    return false;
  }

  function installToggleBtn() {
    if (document.getElementById('ws-v372-toggle')) return;
    var btn = document.createElement('button');
    btn.id = 'ws-v372-toggle';
    btn.type = 'button';
    btn.textContent = '⋮';
    btn.title = '도구 (만기 임박 / 알림 / 큰글씨)';
    btn.setAttribute('aria-label', '도구 토글');
    btn.style.cssText = [
      'position: fixed',
      'top: 8px',
      'right: 8px',
      'width: 28px',
      'height: 28px',
      'background: rgba(255,255,255,0.9)',
      'border: 1px solid #ccc',
      'border-radius: 50%',
      'font-size: 18px',
      'line-height: 22px',
      'color: #444',
      'cursor: pointer',
      'z-index: 999999',
      'opacity: 0.5',
      'transition: opacity 0.2s',
      'padding: 0',
      'font-weight: 700',
      'box-shadow: 0 1px 3px rgba(0,0,0,0.1)'
    ].join(';');
    btn.addEventListener('mouseenter', function () { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', function () {
      btn.style.opacity = document.body.classList.contains('ws-tools-expanded') ? '0.85' : '0.5';
    });
    btn.addEventListener('click', function () {
      document.body.classList.toggle('ws-tools-expanded');
      btn.style.opacity = document.body.classList.contains('ws-tools-expanded') ? '0.85' : '0.5';
    });
    document.body.appendChild(btn);
  }

  function injectCSS() {
    if (document.getElementById('ws-v372-style')) return;
    var style = document.createElement('style');
    style.id = 'ws-v372-style';
    style.textContent = [
      'body.ws-tools-expanded #ws-expiry-badge { display: block !important; }',
      'body.ws-tools-expanded button[aria-label*="알림"] { display: flex !important; }',
      'body.ws-tools-expanded .senior-toggle { display: block !important; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function init() {
    injectCSS();
    installToggleBtn();
    killPatchToast(document.body);
    try {
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) {
              var t = n.textContent || '';
              if (t.indexOf('UI 개선 패치') > -1) {
                try { n.remove(); } catch (_) {}
              } else {
                killPatchToast(n);
              }
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    try { console.log('[v372-tools-toggle] installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
