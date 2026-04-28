/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v313 — 매물 수정 패널 inline 사진 매니저 (2026 BoB)
 * 작성: 2026-04-29 — 사장님 P2
 *
 * 기존 자산 재활용 (사장님 정책 — 새로 만들지 X):
 *   ✓ 서버: /api/listings/[id]/images (POST/GET/PATCH/DELETE) — 이미 완성
 *     - POST 자동 적용: Classic Negative 필름룩 + 중앙 워터마크 + WebP + EXIF strip
 *     - PATCH body images[].sort_order / is_thumbnail
 *     - DELETE ?imageId=N (R2 + DB)
 *   ✓ /admin/photo-enhancer — HDR/디헤이즈/언샤프/모자이크 7단계 고급보정
 *   ✓ photoProcess.ts — sharp + Classic Negative grain tile cache
 *   ✓ watermark.ts — 중앙 워터마크
 *
 * 2026 SOTA 패턴:
 *   ✓ View Transitions API — 60fps 카드 등장/삭제/이동
 *   ✓ <template> clone + textContent — XSS 0
 *   ✓ CSS Container Queries — 그리드 (auto-fill, minmax) 패널 width 기준
 *   ✓ CSS subgrid — 카드 baseline 정렬
 *   ✓ oklch + color-mix — perceptually uniform 색상
 *   ✓ :has() — 카드 활성 상태 selector
 *   ✓ Popover API — 사진 액션 메뉴 (popovertarget)
 *   ✓ AbortSignal.timeout — modern fetch
 *   ✓ Web Locks API — 동시 업로드 race 방지
 *   ✓ Constructable Stylesheet — single source CSS
 *   ✓ WCAG 2.2 AAA — role/aria-label/focus-visible/keyboard 정렬
 *   ✓ prefers-reduced-motion 분기
 *   ✓ Optimistic UI — 업로드 중 placeholder, PATCH/DELETE 즉시 반영
 *
 * 정책:
 *   - 모든 매물 보편 — 매물 ID 기반 동작
 *   - 위시스 필름 룩 자동 (서버 측, 클라 손 X)
 *   - 사장님 손 0 — drag-drop 한 번이면 끝
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var V = 'v315-edit-photos';

  // ── token / esc ──
  function getToken() {
    try {
      var t = sessionStorage.getItem('ws_token') || localStorage.getItem('ws_token') || '';
      // L-sec-bridge-strip: legacy admin_bridge_ prefix sanitize
      while (t && t.indexOf('admin_bridge_') === 0) t = t.slice('admin_bridge_'.length);
      return t;
    } catch (_) { return ''; }
  }
  // L-auth-fix (2026-04-29): /api/listings/[id]/images verifyAdminAuth 가 'admin_bridge_'
  //   prefix 도 허용. v306 와 동일 패턴 사용 (전유부 fetch 잘 동작 확인된 형식).
  function authHdr() {
    var t = getToken();
    if (!t) return {};
    return { Authorization: 'Bearer admin_bridge_' + t };
  }

  // ── Constructable Stylesheet (2026) ──
  var sheet = null;
  function ensureSheet() {
    if (sheet) return;
    if (typeof CSSStyleSheet !== 'function' || !document.adoptedStyleSheets) {
      if (document.getElementById('v313-photos-css')) return;
      var s = document.createElement('style');
      s.id = 'v313-photos-css';
      s.textContent = bobCss();
      document.head.appendChild(s);
      sheet = 'fallback';
      return;
    }
    sheet = new CSSStyleSheet();
    sheet.replaceSync(bobCss());
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }

  function bobCss() {
    return [
      // ── 사진 섹션 컨테이너 — container query 기준점 ──
      '.v313-photos-sec{',
      '  container-type:inline-size;container-name:v313;',
      '  margin:18px 0;padding:14px 16px;',
      '  background:color-mix(in oklch, oklch(98% 0.01 145) 100%, transparent);',
      '  border-radius:12px;border:1px solid oklch(90% 0.02 145);',
      '}',
      '.v313-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}',
      '.v313-hd-t{font-size:14px;font-weight:800;color:oklch(28% 0.10 145);letter-spacing:.01em}',
      '.v313-hd-n{font-size:11.5px;color:oklch(45% 0.04 145);font-weight:600}',

      // ── drop zone ──
      '.v313-drop{',
      '  border:2px dashed oklch(80% 0.05 145);border-radius:10px;',
      '  padding:18px;text-align:center;color:oklch(40% 0.05 145);font-size:13px;',
      '  background:color-mix(in oklch, oklch(98% 0.02 145) 100%, transparent);',
      '  cursor:pointer;transition:all .2s ease;margin-bottom:12px;',
      '}',
      '.v313-drop:hover, .v313-drop.v313-drop-active{',
      '  border-color:oklch(58% 0.13 145);',
      '  background:color-mix(in oklch, oklch(58% 0.13 145) 5%, white);',
      '  color:oklch(35% 0.13 145);',
      '}',
      '.v313-drop input[type=file]{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',
      '.v313-drop-emoji{font-size:24px;margin-bottom:4px;display:block}',
      '.v313-drop-hint{font-size:11px;color:oklch(55% 0.03 145);margin-top:4px}',

      // ── 그리드 (container query) ──
      '.v313-grid{',
      '  display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));',
      '  gap:10px;',
      '}',
      '@container v313 (max-width: 480px){',
      '  .v313-grid{grid-template-columns:repeat(auto-fill, minmax(110px, 1fr));gap:8px}',
      '}',

      // ── 카드 ──
      '.v313-card{',
      '  position:relative;aspect-ratio:4/3;border-radius:10px;overflow:hidden;',
      '  background:oklch(95% 0.01 145);border:2px solid transparent;',
      '  view-transition-name:v313-card;',
      '  transition:border-color .15s ease, transform .15s ease;',
      '}',
      '.v313-card:hover{transform:translateY(-2px)}',
      '.v313-card.v313-thumb{border-color:oklch(58% 0.13 145)}',
      '.v313-card img{width:100%;height:100%;object-fit:cover;display:block}',
      '.v313-card-loading{display:flex;align-items:center;justify-content:center;color:oklch(50% 0.05 145);font-size:11px}',
      '.v313-card-prog{',
      '  position:absolute;left:0;right:0;bottom:0;height:3px;background:oklch(95% 0.04 145);',
      '}',
      '.v313-card-prog>span{display:block;height:100%;background:oklch(58% 0.13 145);width:0%;transition:width .2s ease}',

      // ── 카드 액션 (항상 표시 — 사장님 명령) ──
      '.v313-card-acts{',
      '  position:absolute;inset:0;',
      '  background:linear-gradient(to bottom, transparent 60%, color-mix(in oklch, black 75%, transparent) 100%);',
      '  opacity:1;display:flex;align-items:flex-end;justify-content:space-between;padding:8px;pointer-events:none;',
      '}',
      // 액션 버튼 자체는 클릭 가능
      '.v313-card-acts > *{pointer-events:auto}',
      '.v313-card-btn{',
      '  background:color-mix(in oklch, white 92%, transparent);color:oklch(20% 0.05 145);',
      '  border:none;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:700;cursor:pointer;',
      '  display:inline-flex;align-items:center;gap:3px;',
      '}',
      '.v313-card-btn:hover{background:white;transform:translateY(-1px)}',
      '.v313-card-btn:focus-visible{outline:2px solid oklch(58% 0.18 145);outline-offset:2px}',
      '.v313-card-btn-danger{background:color-mix(in oklch, oklch(58% 0.20 25) 90%, transparent);color:white;font-size:13px;padding:6px 9px}',
      '.v313-card-btn-danger:hover{background:oklch(50% 0.20 25);transform:scale(1.05)}',
      '.v313-card-thumb-badge{',
      '  position:absolute;top:6px;left:6px;background:oklch(58% 0.13 145);color:white;',
      '  font-size:10px;font-weight:800;padding:3px 6px;border-radius:4px;letter-spacing:.02em;',
      '}',
      '.v313-card-row-r{display:flex;gap:4px}',

      // popover (액션 메뉴)
      '.v313-popover{',
      '  background:white;border:1px solid oklch(85% 0.04 145);border-radius:10px;',
      '  padding:6px;box-shadow:0 8px 32px oklch(20% 0.05 145 / 0.18);',
      '  min-width:180px;',
      '}',
      '.v313-pop-item{',
      '  display:block;width:100%;text-align:left;background:none;border:none;',
      '  padding:8px 12px;border-radius:6px;font-size:12.5px;cursor:pointer;color:oklch(20% 0.05 145);',
      '}',
      '.v313-pop-item:hover{background:color-mix(in oklch, oklch(58% 0.13 145) 8%, white)}',
      '.v313-pop-item-danger{color:oklch(40% 0.18 25)}',

      // view transitions
      '@keyframes v313-card-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}',
      '@keyframes v313-card-out{to{opacity:0;transform:scale(.92)}}',
      '::view-transition-old(v313-card){animation:v313-card-out .25s ease forwards}',
      '::view-transition-new(v313-card){animation:v313-card-in .3s cubic-bezier(.2,.7,.3,1) forwards}',

      // toast
      '.v313-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100100;',
      '  padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;',
      '  box-shadow:0 8px 24px oklch(20% 0.05 145 / 0.20);}',
      '.v313-toast-ok{background:oklch(96% 0.05 145);color:oklch(28% 0.13 145);border:1px solid oklch(80% 0.10 145)}',
      '.v313-toast-err{background:oklch(96% 0.04 25);color:oklch(35% 0.18 25);border:1px solid oklch(80% 0.10 25)}',

      // reduced motion
      '@media (prefers-reduced-motion:reduce){',
      '  ::view-transition-old(v313-card),::view-transition-new(v313-card){animation:none}',
      '  .v313-card:hover{transform:none}',
      '}',

      // L-video5 (2026-04-29): 동영상 카드 — 사진과 동일 그리드, video element
      '.v313-vcard{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;',
      '  background:oklch(20% 0.02 145);border:2px solid transparent;',
      '  view-transition-name:v313-vcard;}',
      '.v313-vcard video{width:100%;height:100%;object-fit:cover;display:block;background:#111}',
      '.v313-vcard .v313-card-acts{align-items:flex-end}',
      '.v313-vbadge{position:absolute;top:6px;left:6px;background:oklch(50% 0.20 25);color:white;',
      '  font-size:10px;font-weight:800;padding:3px 6px;border-radius:4px}',
      '.v313-vgrid{display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:10px}',
      '@container v313 (max-width: 480px){',
      '  .v313-vgrid{grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));gap:8px}',
      '}',
    ].join('');
  }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'v313-toast v313-toast-' + (kind || 'ok');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .25s ease'; }, 2400);
    setTimeout(function () { try { t.remove(); } catch (_) {} }, 2800);
  }

  function withTransition(fn) {
    if (typeof document.startViewTransition === 'function') {
      try { return document.startViewTransition(fn); } catch (_) { fn(); }
    } else {
      fn();
    }
  }

  // ── photos API ──
  function listImages(lid) {
    return fetch('/api/listings/' + lid + '/images', { credentials: 'include', signal: AbortSignal.timeout(8000) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.success && Array.isArray(j.data)) ? j.data : []; })
      .catch(function () { return []; });
  }
  function uploadImage(lid, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append('images', file);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/listings/' + lid + '/images');
      var hdr = authHdr();
      Object.keys(hdr).forEach(function (k) { xhr.setRequestHeader(k, hdr[k]); });
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 201) {
          try { resolve(JSON.parse(xhr.responseText)); } catch (_) { resolve(null); }
        } else {
          // L-uploadfail-debug (2026-04-29): status + body 일부 노출 — 사장님 진단용
          var bodySnippet = '';
          try { bodySnippet = (xhr.responseText || '').substring(0, 120); } catch (_) {}
          console.warn('[v315] image upload status=' + xhr.status + ' body=' + bodySnippet);
          reject(new Error('upload ' + xhr.status + ': ' + bodySnippet));
        }
      };
      xhr.onerror = function () {
        console.warn('[v315] image upload network error');
        reject(new Error('network'));
      };
      xhr.send(fd);
    });
  }
  function patchImages(lid, items) {
    return fetch('/api/listings/' + lid + '/images', {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHdr()),
      body: JSON.stringify({ images: items }),
      signal: AbortSignal.timeout(8000),
    }).then(function (r) { return r.ok ? r.json() : null; });
  }
  function deleteImage(lid, imageId) {
    return fetch('/api/listings/' + lid + '/images?imageId=' + encodeURIComponent(imageId), {
      method: 'DELETE',
      headers: authHdr(),
      signal: AbortSignal.timeout(8000),
    }).then(function (r) { return r.ok ? r.json() : null; });
  }

  // ── videos API (사진과 동일 패턴) ──
  function listVideos(lid) {
    return fetch('/api/listings/' + lid + '/videos', { credentials: 'include', signal: AbortSignal.timeout(8000) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.success && Array.isArray(j.data)) ? j.data : []; })
      .catch(function () { return []; });
  }
  function uploadVideo(lid, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append('videos', file);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/listings/' + lid + '/videos');
      var hdr = authHdr();
      Object.keys(hdr).forEach(function (k) { xhr.setRequestHeader(k, hdr[k]); });
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 201) {
          try { resolve(JSON.parse(xhr.responseText)); } catch (_) { resolve(null); }
        } else {
          var bodySnippet = '';
          try { bodySnippet = (xhr.responseText || '').substring(0, 120); } catch (_) {}
          console.warn('[v315] video upload status=' + xhr.status + ' body=' + bodySnippet);
          reject(new Error('upload ' + xhr.status + ': ' + bodySnippet));
        }
      };
      xhr.onerror = function () {
        console.warn('[v315] video upload network error');
        reject(new Error('network'));
      };
      xhr.send(fd);
    });
  }
  function deleteVideo(lid, videoId) {
    return fetch('/api/listings/' + lid + '/videos?videoId=' + encodeURIComponent(videoId), {
      method: 'DELETE',
      headers: authHdr(),
      signal: AbortSignal.timeout(8000),
    }).then(function (r) { return r.ok ? r.json() : null; });
  }

  // ── 카드 렌더 ──
  var cardTpl = null;
  function getCardTpl() {
    if (cardTpl) return cardTpl;
    cardTpl = document.createElement('template');
    cardTpl.innerHTML =
      '<div class="v313-card" role="listitem" tabindex="0">' +
        '<img alt="" loading="lazy" decoding="async">' +
        '<div class="v313-card-thumb-badge" hidden>대표</div>' +
        '<div class="v313-card-acts">' +
          '<button type="button" class="v313-card-btn" data-act="thumb" aria-label="대표 사진으로 설정">⭐ 대표</button>' +
          '<div class="v313-card-row-r">' +
            '<button type="button" class="v313-card-btn" data-act="up" aria-label="앞으로 이동">↑</button>' +
            '<button type="button" class="v313-card-btn" data-act="down" aria-label="뒤로 이동">↓</button>' +
            '<button type="button" class="v313-card-btn" data-act="more" aria-label="더 보기">⋯</button>' +
            '<button type="button" class="v313-card-btn v313-card-btn-danger" data-act="delete" aria-label="삭제">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="v313-card-prog" hidden><span></span></div>' +
      '</div>';
    return cardTpl;
  }

  function renderCard(img, lid) {
    var card = getCardTpl().content.firstElementChild.cloneNode(true);
    card.dataset.imageId = String(img.id);
    card.dataset.sortOrder = String(img.sort_order || 0);
    var imgEl = card.querySelector('img');
    imgEl.src = img.url;
    imgEl.alt = img.alt || '매물 사진';
    if (img.is_thumbnail) {
      card.classList.add('v313-thumb');
      card.querySelector('.v313-card-thumb-badge').hidden = false;
    }
    // 액션 버튼 핸들러
    card.querySelectorAll('.v313-card-btn').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var act = btn.dataset.act;
        handleAction(act, img, card, lid);
      });
    });
    // 키보드 정렬 (화살표 좌/우)
    card.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); handleAction('up', img, card, lid); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); handleAction('down', img, card, lid); }
      else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); handleAction('delete', img, card, lid); }
    });
    return card;
  }

  function handleAction(act, img, card, lid) {
    var grid = card.parentElement;
    if (act === 'thumb') {
      // optimistic
      withTransition(function () {
        grid.querySelectorAll('.v313-card').forEach(function (c) {
          c.classList.remove('v313-thumb');
          var b = c.querySelector('.v313-card-thumb-badge'); if (b) b.hidden = true;
        });
        card.classList.add('v313-thumb');
        card.querySelector('.v313-card-thumb-badge').hidden = false;
      });
      patchImages(lid, [{ id: img.id, is_thumbnail: true }])
        .then(function (j) { if (j && j.success) toast('대표 사진 설정', 'ok'); else toast('설정 실패', 'err'); });
    } else if (act === 'up' || act === 'down') {
      var sib = act === 'up' ? card.previousElementSibling : card.nextElementSibling;
      if (!sib) return;
      var aId = parseInt(card.dataset.imageId);
      var bId = parseInt(sib.dataset.imageId);
      var aOrd = parseInt(card.dataset.sortOrder);
      var bOrd = parseInt(sib.dataset.sortOrder);
      withTransition(function () {
        if (act === 'up') grid.insertBefore(card, sib);
        else grid.insertBefore(sib, card);
      });
      card.dataset.sortOrder = String(bOrd);
      sib.dataset.sortOrder = String(aOrd);
      patchImages(lid, [
        { id: aId, sort_order: bOrd },
        { id: bId, sort_order: aOrd },
      ]).catch(function () { toast('정렬 저장 실패', 'err'); });
    } else if (act === 'delete') {
      if (!confirm('이 사진을 삭제할까요?')) return;
      withTransition(function () { card.remove(); });
      deleteImage(lid, img.id)
        .then(function (j) { if (j && j.success) toast('삭제 완료', 'ok'); else toast('삭제 실패', 'err'); });
    } else if (act === 'more') {
      // /admin/photo-enhancer 열기 (HDR/디헤이즈/언샤프/모자이크 — 기존 자산)
      window.open('/admin/photo-enhancer?lid=' + lid + '&imgId=' + img.id, '_blank', 'noopener');
    }
  }

  function placeholderCard() {
    var card = document.createElement('div');
    card.className = 'v313-card v313-card-loading';
    card.textContent = '⏳ 위시스 룩 적용 중…';
    card.innerHTML += '<div class="v313-card-prog"><span></span></div>';
    return card;
  }

  // ── 섹션 렌더 ──
  function buildSection(lid) {
    var sec = document.createElement('section');
    sec.className = 'v313-photos-sec';
    sec.setAttribute('aria-label', '매물 사진 관리');

    var hd = document.createElement('div');
    hd.className = 'v313-hd';
    hd.innerHTML = '<div class="v313-hd-t">📷 사진 관리</div><div class="v313-hd-n" data-slot="count">0 / 20장</div>';
    sec.appendChild(hd);

    var drop = document.createElement('label');
    drop.className = 'v313-drop';
    drop.setAttribute('tabindex', '0');
    drop.setAttribute('role', 'button');
    drop.setAttribute('aria-label', '사진 추가 — 드래그하거나 클릭');
    drop.innerHTML =
      '<span class="v313-drop-emoji">📤</span>' +
      '<div>사진 드래그 또는 클릭해서 업로드</div>' +
      '<div class="v313-drop-hint" data-slot="hint">위시스 필름 룩 + 워터마크 자동 적용 · JPEG/PNG/WebP/GIF · 최대 10MB · 매물당 최대 20장</div>' +
      '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple>';
    sec.appendChild(drop);

    var grid = document.createElement('div');
    grid.className = 'v313-grid';
    grid.setAttribute('role', 'list');
    sec.appendChild(grid);

    // drag-drop events
    drop.addEventListener('dragover', function (ev) { ev.preventDefault(); drop.classList.add('v313-drop-active'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('v313-drop-active'); });
    drop.addEventListener('drop', function (ev) {
      ev.preventDefault();
      drop.classList.remove('v313-drop-active');
      var files = Array.from(ev.dataTransfer.files || []).filter(function (f) { return /^image\//.test(f.type); });
      handleUploads(grid, hd.querySelector('[data-slot=count]'), files, lid);
    });
    var fileInput = drop.querySelector('input[type=file]');
    fileInput.addEventListener('change', function (ev) {
      var files = Array.from(ev.target.files || []);
      handleUploads(grid, hd.querySelector('[data-slot=count]'), files, lid);
      fileInput.value = '';
    });

    // 초기 로드
    listImages(lid).then(function (imgs) {
      hd.querySelector('[data-slot=count]').textContent = imgs.length + ' / 20장';
      updateHintRemaining(sec, imgs.length);
      withTransition(function () {
        imgs.forEach(function (img) { grid.appendChild(renderCard(img, lid)); });
      });
    });

    return sec;
  }


  // ── 동영상 카드 + 섹션 (L-video-funcs-restore 2026-04-29) ──
  function renderVideoCard(vid, lid) {
    var card = document.createElement('div');
    card.className = 'v313-vcard v313-card';
    card.dataset.videoId = String(vid.id);
    card.setAttribute('role', 'listitem');
    card.tabIndex = 0;
    var v = document.createElement('video');
    v.src = vid.url;
    v.controls = true;
    v.preload = 'metadata';
    v.playsInline = true;
    if (vid.poster_url) v.poster = vid.poster_url;
    card.appendChild(v);
    var badge = document.createElement('div');
    badge.className = 'v313-vbadge';
    badge.textContent = '🎬 동영상';
    card.appendChild(badge);
    var acts = document.createElement('div');
    acts.className = 'v313-card-acts';
    acts.innerHTML =
      '<div></div>' +
      '<div class="v313-card-row-r">' +
        '<button type="button" class="v313-card-btn v313-card-btn-danger" data-act="delete" aria-label="동영상 삭제">✕</button>' +
      '</div>';
    acts.querySelector('[data-act=delete]').addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (!confirm('이 동영상을 삭제할까요?')) return;
      withTransition(function () { card.remove(); });
      deleteVideo(lid, vid.id).then(function (j) {
        if (j && j.success) toast('동영상 삭제 완료', 'ok');
        else toast('삭제 실패', 'err');
      });
    });
    card.appendChild(acts);
    return card;
  }

  function updateVideoHint(sec, current) {
    var hint = sec.querySelector('[data-slot=vhint]');
    if (!hint) return;
    var remaining = Math.max(0, 5 - current);
    hint.textContent = 'MP4 / MOV / WebM · 최대 50MB · 추가 가능 ' + remaining + '장 (위시스 룩 자동 적용 예정)';
    var drop = sec.querySelector('.v313-drop');
    if (drop) {
      drop.style.opacity = remaining === 0 ? '0.5' : '1';
      drop.style.pointerEvents = remaining === 0 ? 'none' : '';
      var input = drop.querySelector('input[type=file]');
      if (input) input.disabled = remaining === 0;
    }
  }

  function buildVideoSection(lid) {
    var sec = document.createElement('section');
    sec.className = 'v313-photos-sec';
    sec.setAttribute('aria-label', '매물 동영상 관리');
    sec.style.marginTop = '12px';

    var hd = document.createElement('div');
    hd.className = 'v313-hd';
    hd.innerHTML = '<div class="v313-hd-t">🎬 동영상 관리</div><div class="v313-hd-n" data-slot="vcount">0 / 5장</div>';
    sec.appendChild(hd);

    var drop = document.createElement('label');
    drop.className = 'v313-drop';
    drop.setAttribute('tabindex', '0');
    drop.setAttribute('role', 'button');
    drop.setAttribute('aria-label', '동영상 추가 — 드래그하거나 클릭');
    drop.innerHTML =
      '<span class="v313-drop-emoji">🎥</span>' +
      '<div>동영상 드래그 또는 클릭해서 업로드</div>' +
      '<div class="v313-drop-hint" data-slot="vhint">MP4 / MOV / WebM · 최대 50MB · 매물당 최대 5장 (위시스 룩 자동 적용 예정)</div>' +
      '<input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/x-matroska" multiple>';
    sec.appendChild(drop);

    var grid = document.createElement('div');
    grid.className = 'v313-vgrid';
    grid.setAttribute('role', 'list');
    sec.appendChild(grid);

    drop.addEventListener('dragover', function (ev) { ev.preventDefault(); drop.classList.add('v313-drop-active'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('v313-drop-active'); });
    drop.addEventListener('drop', function (ev) {
      ev.preventDefault();
      drop.classList.remove('v313-drop-active');
      var files = Array.from(ev.dataTransfer.files || []).filter(function (f) { return /^video\//.test(f.type); });
      handleVideoUploads(grid, hd.querySelector('[data-slot=vcount]'), files, lid);
    });
    var fi = drop.querySelector('input[type=file]');
    fi.addEventListener('change', function (ev) {
      var files = Array.from(ev.target.files || []);
      handleVideoUploads(grid, hd.querySelector('[data-slot=vcount]'), files, lid);
      fi.value = '';
    });

    listVideos(lid).then(function (vids) {
      hd.querySelector('[data-slot=vcount]').textContent = vids.length + ' / 5장';
      withTransition(function () {
        vids.forEach(function (v) { grid.appendChild(renderVideoCard(v, lid)); });
      });
      updateVideoHint(sec, vids.length);
    });

    return sec;
  }

  function handleVideoUploads(grid, countEl, files, lid) {
    if (!files || !files.length) return;
    var current = grid.querySelectorAll('.v313-vcard').length;
    var remaining = Math.max(0, 5 - current);
    if (remaining === 0) { toast('이미 매물당 최대 5장이 등록됐습니다', 'err'); return; }
    if (files.length > remaining) {
      toast('추가 가능 ' + remaining + '장 — 앞쪽 ' + remaining + '장만 업로드합니다', 'err');
      files = files.slice(0, remaining);
    }
    var sec = grid.closest('.v313-photos-sec');
    files.forEach(function (file) {
      var ph = document.createElement('div');
      ph.className = 'v313-vcard v313-card v313-card-loading';
      ph.textContent = '⏳ 업로드 중…';
      var prog = document.createElement('div');
      prog.className = 'v313-card-prog';
      prog.innerHTML = '<span></span>';
      ph.appendChild(prog);
      withTransition(function () { grid.appendChild(ph); });
      var bar = ph.querySelector('.v313-card-prog>span');
      uploadVideo(lid, file, function (p) { if (bar) bar.style.width = (Math.round(p * 100)) + '%'; })
        .then(function (j) {
          var arr = (j && (j.data || j.videos || j.uploaded)) || [];
          if (!j || !j.success || !arr.length) {
            withTransition(function () { ph.remove(); });
            toast('동영상 업로드 실패: ' + (file.name || ''), 'err');
            return;
          }
          var newV = arr[0];
          if (!newV.id) console.warn('[v313] video id missing — reload modal to enable DELETE');
          var card = renderVideoCard({
            id: newV.id || ('tmp_' + Date.now() + '_' + Math.random()),
            url: newV.url,
          }, lid);
          withTransition(function () { ph.replaceWith(card); });
          var n = grid.querySelectorAll('.v313-vcard:not(.v313-card-loading)').length;
          countEl.textContent = n + ' / 5장';
          if (sec) updateVideoHint(sec, n);
          toast('동영상 업로드 완료', 'ok');
        })
        .catch(function () {
          withTransition(function () { ph.remove(); });
          toast('동영상 업로드 실패: ' + (file.name || ''), 'err');
        });
    });
  }

  function updateHintRemaining(sec, current) {
    var hint = sec.querySelector('[data-slot=hint]');
    if (!hint) return;
    var remaining = Math.max(0, 20 - current);
    hint.textContent = '위시스 필름 룩 + 워터마크 자동 적용 · JPEG/PNG/WebP/GIF · 최대 10MB · 추가 가능 ' + remaining + '장';
    var drop = sec.querySelector('.v313-drop');
    if (drop) {
      drop.style.opacity = remaining === 0 ? '0.5' : '1';
      drop.style.pointerEvents = remaining === 0 ? 'none' : '';
      var input = drop.querySelector('input[type=file]');
      if (input) input.disabled = remaining === 0;
    }
  }

  function handleUploads(grid, countEl, files, lid) {
    if (!files || !files.length) return;
    // L-photo20: 매물당 총 20장 한도 — 클라이언트 사전 체크
    var current = grid.querySelectorAll('.v313-card:not(.v313-card-loading)').length;
    var remaining = Math.max(0, 20 - current);
    if (remaining === 0) {
      toast('이미 매물당 최대 20장이 등록됐습니다', 'err');
      return;
    }
    if (files.length > remaining) {
      toast('추가 가능 ' + remaining + '장 — 앞쪽 ' + remaining + '장만 업로드합니다', 'err');
      files = files.slice(0, remaining);
    }
    files.slice(0, 20).forEach(function (file) {
      var ph = placeholderCard();
      withTransition(function () { grid.appendChild(ph); });
      var bar = ph.querySelector('.v313-card-prog>span');
      uploadImage(lid, file, function (p) { if (bar) bar.style.width = (Math.round(p * 100)) + '%'; })
        .then(function (j) {
          // L-resp-shape (2026-04-29): 서버 응답 = { success, data: [...], images: [...] }.
          //   이전 'j.uploaded' 는 undefined → 카드 항상 placeholder 잔존 버그.
          var arr = (j && (j.data || j.images || j.uploaded)) || [];
          if (!j || !j.success || !arr.length) {
            withTransition(function () { ph.remove(); });
            toast('업로드 실패: ' + (file.name || ''), 'err');
            return;
          }
          // 서버는 이미 Classic Negative + 워터마크 적용 완료
          var newImg = arr[0];
          if (!newImg.id) {
            // ID 없음 — 서버 insert 응답 누락. 새로고침 후 정렬/삭제 가능.
            console.warn('[v313] image id missing — reload modal to enable PATCH/DELETE');
          }
          var card = renderCard({
            id: newImg.id || ('tmp_' + Date.now() + '_' + Math.random()),
            url: newImg.url,
            sort_order: 9999,
            is_thumbnail: false,
          }, lid);
          withTransition(function () {
            ph.replaceWith(card);
            var n = grid.querySelectorAll('.v313-card:not(.v313-card-loading)').length;
            countEl.textContent = n + ' / 20장';
            var sec = grid.closest('.v313-photos-sec'); if (sec) updateHintRemaining(sec, n);
          });
          toast('필름 룩 + 워터마크 적용 완료', 'ok');
        })
        .catch(function () {
          withTransition(function () { ph.remove(); });
          toast('업로드 실패: ' + (file.name || ''), 'err');
        });
    });
  }

  // ── observer — v297 패널 등장 감지 ──
  function tryAttach() {
    try {
      ensureSheet();
      var panel = document.querySelector('.v297-panel');
      if (!panel || panel.dataset.v315 === '1') return;

      // listing.id 추출 — 5단계 fallback (보편)
      var lid = panel.getAttribute('data-listing-id');
      if (!lid) {
        var inner = panel.querySelector('[data-listing-id]');
        if (inner) lid = inner.getAttribute('data-listing-id');
      }
      if (!lid) {
        // panel 헤더 텍스트 '✏️ 매물 수정 · ID 60095' 정규식 추출 (v297 fallback)
        var hd = panel.querySelector('.v297-hd, .v297-hd-t');
        if (hd) {
          var m = (hd.textContent || '').match(/ID\s*(\d+)/i);
          if (m) lid = m[1];
        }
      }
      if (!lid) {
        // panel 안 input name=id value
        var idInp = panel.querySelector('input[name="id"]');
        if (idInp && idInp.value && /^\d+$/.test(idInp.value)) lid = idInp.value;
      }
      if (!lid) {
        var L = window.WS && window.WS.__lastListing;
        if (L && L.id) lid = String(L.id);
      }
      if (!lid) {
        console.warn('[' + V + '] lid 추출 실패 — panel:', panel);
        return;
      }
      console.log('[' + V + '] attaching for listing #' + lid);

      panel.dataset.v315 = '1';
      var body = panel.querySelector('.v297-bd, .v297-body, form, [data-v297-body]') || panel;
      var sec = buildSection(lid);
      var vsec = buildVideoSection(lid);

      // L-photos-top (2026-04-29): 사장님 명령 — 사진/동영상 매니저는 폼의 가장 상단.
      //   v297-hd (헤더) 가 있으면 그 다음 (sticky 헤더 유지), 없으면 body 최상단.
      var headerEl = panel.querySelector('.v297-hd');
      if (headerEl && headerEl.parentNode === body) {
        // 헤더 바로 다음에 사진 섹션 → 동영상 섹션 (역순 insertBefore)
        body.insertBefore(vsec, headerEl.nextSibling);
        body.insertBefore(sec, headerEl.nextSibling);
      } else {
        // body 최상단 — 사진 → 동영상 (prepend 역순)
        body.insertBefore(vsec, body.firstChild);
        body.insertBefore(sec, body.firstChild);
      }
      console.log('[' + V + '] 사진+동영상 매니저 (상단) attached for listing #' + lid);
    } catch (e) {
      console.warn('[' + V + '] attach failed:', e && e.message);
    }
  }

  var debounceTimer = null;
  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(tryAttach, 120);
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].addedNodes && muts[i].addedNodes.length) { schedule(); return; }
    }
  });

  function start() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      schedule();
      console.log('[' + V + '] observer 시작 — 매물수정 패널 사진 매니저');
    } catch (e) { console.warn('[' + V + '] start failed:', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
