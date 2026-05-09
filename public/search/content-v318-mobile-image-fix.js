/* /search content-v318 rev6 — <img> + background-image 모두 self-origin proxy 변환.
 * 사장님: "썸네일은 뜨는데 큰 사진은 검정" — content.js 의 ws-gallery-main 은 <img> 가
 *         아니라 <div style="background-image: url(...)"> 형태. v318 selector 가 놓침. */
(function () {
  'use strict';
  var V = 'v318-mobile-image-fix-rev7';
  var EXTERNAL_HOSTS = [
    'wishes-image-proxy.wishes-img.workers.dev',
    'pub-e16c7a50584c4db7be3571746cd80716.r2.dev',
    'd4k1brqee4emz.cloudfront.net',
    // L-imgproxy-zigbang (2026-05-09 사장님 발견 매물 78745):
    //   onhouse 매물의 사진이 직방 CDN 호스팅. octet-stream 응답으로
    //   브라우저 broken image. img-proxy 거치게 변환.
    'resource.zigbang.io',
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

  // ① <img> 처리
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

  // ② <div style="background-image: url(...)"> 처리 (sandbox 핵심: rev6 신규)
  function fixBgImage(el) {
    try {
      var styleAttr = el.getAttribute('style');
      if (!styleAttr || styleAttr.indexOf('background-image') < 0) return;
      // background-image: url('https://...') 또는 url("...") 또는 url(...)
      var m = styleAttr.match(/background-image\s*:\s*url\((['"]?)([^'")]+)\1\)/);
      if (!m) return;
      var url = m[2];
      if (!shouldProxify(url)) return;
      var newUrl = proxify(url);
      var newStyle = styleAttr.replace(
        /background-image\s*:\s*url\((['"]?)[^'")]+\1\)/,
        "background-image: url('" + newUrl + "')"
      );
      el.setAttribute('style', newStyle);
    } catch (e) { /* noop */ }
  }

  function fixAll() {
    try {
      // 모든 <img> 처리
      document.querySelectorAll('img').forEach(fixImg);
      // background-image 가진 element 처리 (style 속성 검사)
      document.querySelectorAll('[style*="background-image"]').forEach(fixBgImage);
    } catch (e) { /* noop */ }
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
            if (n.nodeType === 1 && (
                n.tagName === 'IMG' ||
                (n.querySelector && n.querySelector('img, [style*="background-image"]')) ||
                (n.getAttribute && (n.getAttribute('style') || '').indexOf('background-image') >= 0)
            )) {
              hit = true; break;
            }
          }
          if (hit) break;
        }
        if (m.type === 'attributes' && m.target) {
          var attr = m.attributeName;
          if (m.target.tagName === 'IMG' && (attr === 'src' || attr === 'data-src')) {
            hit = true; break;
          }
          if (attr === 'style') {
            // style 변경 시 background-image 검사
            var s = m.target.getAttribute && m.target.getAttribute('style');
            if (s && s.indexOf('background-image') >= 0) { hit = true; break; }
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
        attributes: true, attributeFilter: ['src', 'data-src', 'style'],
      });
      console.log('[' + V + '] 시작 — <img> + background-image 모두 self-origin 자동 변환');
    } catch (e) { console.warn('[' + V + '] MutationObserver 실패:', e); }
    setTimeout(fixAll, 500);
    setTimeout(fixAll, 1500);
    setTimeout(fixAll, 4000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
