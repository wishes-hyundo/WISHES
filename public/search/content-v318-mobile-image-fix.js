/* /search content-v318 rev5 — 외부 image URL → self-origin /api/img-proxy 자동 변환.
 * 사장님: "직접 올린 사진은 뜨는데 그 외 사진은 전혀 안뜸" — Cloudflare Worker referer 검사 우회. */
(function () {
  'use strict';
  var V = 'v318-mobile-image-fix-rev5';
  var EXTERNAL_HOSTS = [
    'wishes-image-proxy.wishes-img.workers.dev',
    'pub-e16c7a50584c4db7be3571746cd80716.r2.dev',
    'd4k1brqee4emz.cloudfront.net',
  ];
  var PROXY_PREFIX = '/api/img-proxy?url=';

  function shouldProxify(url) {
    if (!url) return false;
    if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return false;
    if (url.indexOf(PROXY_PREFIX) >= 0) return false;
    try {
      var u = new URL(url, location.origin);
      if (u.origin === location.origin) return false;
      for (var i = 0; i < EXTERNAL_HOSTS.length; i++) {
        if (u.hostname === EXTERNAL_HOSTS[i]) return true;
      }
      return false;
    } catch (_) { return false; }
  }

  function proxify(url) { return PROXY_PREFIX + encodeURIComponent(url); }

  function fixImg(img) {
    try {
      var src = img.getAttribute('src');
      if (src && shouldProxify(src)) img.setAttribute('src', proxify(src));
      var ds = img.getAttribute('data-src');
      if (ds) {
        var finalDs = shouldProxify(ds) ? proxify(ds) : ds;
        if (img.getAttribute('src') !== finalDs) {
          img.setAttribute('loading', 'lazy');
          img.setAttribute('decoding', 'async');
          img.setAttribute('src', finalDs);
        }
        img.removeAttribute('data-src');
        if (img.classList) img.classList.remove('ws-lazy');
      }
    } catch (e) { /* noop */ }
  }

  function fixAll() {
    try { document.querySelectorAll('img').forEach(fixImg); } catch (e) { /* noop */ }
  }

  function start() {
    fixAll();
    var mo = new MutationObserver(function (muts) {
      var hit = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1 && (n.tagName === 'IMG' || (n.querySelector && n.querySelector('img')))) {
              hit = true; break;
            }
          }
          if (hit) break;
        }
        if (m.type === 'attributes' && m.target && m.target.tagName === 'IMG') {
          if (m.attributeName === 'src' || m.attributeName === 'data-src') {
            var s = m.target.getAttribute('src') || '';
            if (shouldProxify(s) || m.target.getAttribute('data-src')) { hit = true; break; }
          }
        }
      }
      if (hit) {
        if (window.requestAnimationFrame) requestAnimationFrame(fixAll);
        else setTimeout(fixAll, 16);
      }
    });
    try {
      mo.observe(document.body, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['src', 'data-src'],
      });
      console.log('[' + V + '] 시작 — image-proxy URL → self-origin 자동 변환');
    } catch (e) { console.warn('[' + V + '] MutationObserver 실패:', e); }
    setTimeout(fixAll, 500);
    setTimeout(fixAll, 1500);
    setTimeout(fixAll, 4000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
