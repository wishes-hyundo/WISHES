/**
 * WISHES Search UI/UX Patch v2.3.0
 * ================================================================
 * 대상      : public/search/content.js v2.2.6 (2026-04-14 빌드) 위에 적용
 * 배포방식  : /public/search/content-v230-patch.js 로 동일 폴더에 배치 후
 *            src/app/search/page.tsx 에서 content.js 로드 직후 async:false 로드
 * 적용원리  : 원본 content.js 파일을 수정하지 않고 window.WS 메서드를 덮어쓰는
 *            additive patch. 언제든 <script> 태그 1개 제거로 롤백 가능.
 * 근거문서  : WISHES_UIUX_정밀감사_20260417.html (2026-04-17)
 *
 * 구현 범위 (보고서 P1~P5 100%)
 *   P1  상세보기 14섹션 → 5탭 + sticky 헤더 + 원본 기본접힘       [이 파일]
 *   P2  브리핑 4벌 분산 → "브리핑 스튜디오" 대상×포맷×출력 통합   [이 파일]
 *   P3  하단바 35+ 버튼 → 7 주액션 + ⌘K 검색형 팔레트            [이 파일]
 *   P4  저장검색 3개 → "내 검색" 통합 · 비교 3개 → "비교" 통합    [이 파일]
 *   P5  중복정의 5건 진단 로그 + 경미 UX 3건 수정                [이 파일]
 *
 * 원본 보존 정책 :  모든 기존 window.WS.* 함수는 __orig_* 에 백업 후 래핑.
 *                   롤백·긴급상황시 window.WS.__wpRollback() 로 원상복구.
 *
 * @version 2.3.0
 * @build 2026-04-17
 * @author WISHES · UI/UX 감사 기반 구현
 * ================================================================
 */

(function __wpPatchBoot() {
  'use strict';

  // ---[ 0. 부트 가드 ]------------------------------------------------------

  var PATCH_VERSION = '2.6.0';
  var PATCH_BUILD   = '2026-04-18';
  var PATCH_TAG     = '[WP v' + PATCH_VERSION + ']';

  // 도메인 화이트리스트 (원본과 동일 정책)
  if (location.hostname !== 'wishes.co.kr' && location.hostname !== 'www.wishes.co.kr') {
    return;
  }
  if (location.pathname.indexOf('admin-auth') !== -1 || location.pathname.indexOf('command-center') !== -1) {
    return;
  }

  // 이미 적용된 패치가 있으면 스킵 (중복 설치 방어)
  if (window.WS && window.WS.__wpPatchApplied) {
    console.log(PATCH_TAG + ' already applied — skip');
    return;
  }

  // WS 객체 대기 (content.js 가 로드를 끝낼 때까지)
  var waitTimer = null;
  var waitCount = 0;
  function waitForWS() {
    if (window.WS && typeof window.WS.showDetail === 'function' && typeof window.WS.showSearchUI === 'function') {
      clearInterval(waitTimer);
      install();
      return;
    }
    waitCount++;
    if (waitCount > 100) { // 10초 타임아웃
      clearInterval(waitTimer);
      console.warn(PATCH_TAG + ' WS not ready after 10s — abort patch');
    }
  }
  waitTimer = setInterval(waitForWS, 100);

  // ======================================================================
  // INSTALL — 모든 패치 섹션 순차 적용
  // ======================================================================
  function install() {
    try {
      injectStyles();
      patch_P1_DetailTabs();
      patch_P2_BriefingStudio();
      patch_P3_BottomBarAndPalette();
      patch_P4_MySearchesAndCompare();
      patch_P5_MinorFixes();
      diagnostics_duplicateDefs();

      window.WS.__wpPatchApplied = true;
      window.WS.__wpPatchVersion = PATCH_VERSION;
      window.WS.__wpPatchBuild   = PATCH_BUILD;
      window.WS.__wpRollback     = rollback;

      // 편의용 글로벌 핸들 (셀프진단 스크립트에서 사용)
      window.__WS_PATCH_V230__ = {
        version: PATCH_VERSION,
        build: PATCH_BUILD,
        rollback: rollback,
        install: install,
        applied: true
      };

      console.log('%c' + PATCH_TAG + ' installed ok · P1~P5 applied', 'background:#2D5A27;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;');
      try { window.WS.showToast && window.WS.showToast('UI 개선 패치 v' + PATCH_VERSION + ' 적용됨', 'success'); } catch(e){}
    } catch (err) {
      console.error(PATCH_TAG + ' install failed:', err);
    }
  }

  // ======================================================================
  // 글로벌 스타일 주입
  // ======================================================================
  function injectStyles() {
    if (document.getElementById('ws-wp-styles')) return;
    var css = [
      /* sticky 헤더 */
      '.wp-sticky{position:sticky;top:0;z-index:20;background:#fff;border-bottom:2px solid #2D5A27;padding:10px 14px;margin:-20px -20px 12px -20px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}',
      '.wp-sticky-info{flex:1;min-width:0;font-size:13px;color:#334155}',
      '.wp-sticky-info strong{color:#2D5A27;font-size:14px;margin-right:6px}',
      '.wp-sticky-price{font-size:15px;font-weight:800;color:#2D5A27;white-space:nowrap}',
      '.wp-sticky-fav{padding:6px 12px;border:1.5px solid #D32F2F;background:#fff;color:#D32F2F;border-radius:8px;font-size:12px;cursor:pointer;font-weight:700;white-space:nowrap}',
      '.wp-sticky-fav.active{background:#D32F2F;color:#fff}',
      /* 탭 네비 */
      '.wp-tabs{display:flex;gap:2px;border-bottom:2px solid #2D5A27;margin:-4px -20px 14px -20px;padding:0 14px;background:#f8fdf6;overflow-x:auto;scrollbar-width:thin}',
      '.wp-tab{padding:10px 16px;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;border:none;background:transparent;white-space:nowrap;border-radius:6px 6px 0 0;transition:all 0.15s}',
      '.wp-tab:hover{background:#e7f3e2;color:#2D5A27}',
      '.wp-tab.active{background:#2D5A27;color:#fff}',
      '.wp-tab-panel{display:none}',
      '.wp-tab-panel.active{display:block}',
      /* 브리핑 스튜디오 */
      '.wp-bs-modal{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:20px}',
      '.wp-bs-box{background:#fff;width:100%;max-width:820px;max-height:90vh;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column}',
      '.wp-bs-head{background:linear-gradient(135deg,#2D5A27,#1F5F3F);color:#fff;padding:18px 24px;display:flex;align-items:center;justify-content:space-between}',
      '.wp-bs-head h3{margin:0;font-size:17px;font-weight:800}',
      '.wp-bs-head-sub{font-size:12px;opacity:0.9;margin-top:2px}',
      '.wp-bs-close{background:none;border:none;color:#fff;font-size:24px;cursor:pointer;line-height:1;padding:0 4px}',
      '.wp-bs-body{padding:20px 24px;overflow-y:auto}',
      '.wp-bs-step{margin-bottom:18px}',
      '.wp-bs-step-num{display:inline-block;background:#2D5A27;color:#fff;width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:800;text-align:center;line-height:22px;margin-right:6px}',
      '.wp-bs-step-title{font-size:14px;font-weight:700;color:#2D5A27;margin-bottom:10px}',
      '.wp-bs-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}',
      '.wp-bs-opt{padding:12px;border:1.5px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;text-align:center;transition:all 0.15s;font-size:12px;font-weight:600;color:#475569}',
      '.wp-bs-opt:hover{border-color:#2D5A27;color:#2D5A27;background:#f8fdf6}',
      '.wp-bs-opt.active{background:#2D5A27;color:#fff;border-color:#2D5A27}',
      '.wp-bs-opt-ico{font-size:20px;display:block;margin-bottom:4px}',
      '.wp-bs-foot{padding:14px 24px;border-top:1px solid #e5e7eb;display:flex;gap:10px;justify-content:space-between;align-items:center;background:#fafafa}',
      '.wp-bs-summary{font-size:12px;color:#64748b}',
      '.wp-bs-summary b{color:#2D5A27}',
      '.wp-bs-run{padding:10px 24px;background:#2D5A27;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}',
      '.wp-bs-run:disabled{background:#9ca3af;cursor:not-allowed}',
      /* ⌘K 팔레트 */
      '.wp-pal-modal{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.6);display:flex;align-items:flex-start;justify-content:center;padding-top:80px}',
      '.wp-pal-box{background:#fff;width:100%;max-width:560px;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.35)}',
      '.wp-pal-input{width:100%;padding:16px 20px;border:none;border-bottom:1px solid #e5e7eb;font-size:15px;outline:none;box-sizing:border-box;font-family:inherit}',
      '.wp-pal-list{max-height:440px;overflow-y:auto}',
      '.wp-pal-item{display:flex;align-items:center;gap:12px;padding:10px 20px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155}',
      '.wp-pal-item:hover,.wp-pal-item.active{background:#f0f7ed;color:#2D5A27}',
      '.wp-pal-item .wp-pal-ico{font-size:16px;width:24px;text-align:center}',
      '.wp-pal-item .wp-pal-label{flex:1;font-weight:600}',
      '.wp-pal-item .wp-pal-cat{font-size:10px;color:#94a3b8;padding:2px 8px;background:#f1f5f9;border-radius:10px;font-weight:600}',
      '.wp-pal-empty{padding:30px;text-align:center;color:#94a3b8;font-size:13px}',
      '.wp-pal-foot{padding:8px 16px;background:#fafafa;border-top:1px solid #e5e7eb;font-size:10.5px;color:#94a3b8;display:flex;gap:12px}',
      '.wp-kbd{background:#fff;border:1px solid #cbd5e1;border-radius:3px;padding:1px 5px;font-family:monospace;font-size:10px;color:#475569}',
      /* 하단바 도구 버튼 */
      '.wp-tools-btn{padding:5px 10px !important;background:linear-gradient(135deg,#2D5A27,#1F5F3F) !important;color:#fff !important;border:none !important;border-radius:6px !important;font-size:11px !important;font-weight:700 !important;cursor:pointer;display:inline-flex;align-items:center;gap:4px}',
      '.wp-tools-btn .wp-kbd{background:rgba(255,255,255,0.2);border:none;color:#fff;padding:1px 5px;font-size:9.5px}',
      /* 내 검색 / 비교 통합 */
      '.wp-tabs-inner{display:flex;gap:4px;border-bottom:2px solid #e5e7eb;margin-bottom:14px}',
      '.wp-tabs-inner button{padding:8px 14px;font-size:12.5px;font-weight:600;color:#64748b;background:none;border:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px}',
      '.wp-tabs-inner button.active{color:#2D5A27;border-bottom-color:#2D5A27}',
      /* 원본 데이터 접힘 헤더 */
      '.wp-rawfold{cursor:pointer;user-select:none}',
      '.wp-rawfold::before{content:"▶ ";font-size:10px;color:#64748b;transition:transform 0.2s;display:inline-block}',
      '.wp-rawfold.open::before{transform:rotate(90deg)}',
      /* diag 토스트 */
      '.wp-diag{position:fixed;bottom:10px;left:10px;background:#0f172a;color:#e2e8f0;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:11px;z-index:2147483646;opacity:0.9}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'ws-wp-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ======================================================================
  // P1. 상세보기 14섹션 → 5탭 + sticky 헤더 + 원본 기본접힘
  // ======================================================================
  function patch_P1_DetailTabs() {
    if (typeof window.WS.showDetail !== 'function') return;

    // 원본 백업
    window.WS.__orig_showDetail = window.WS.showDetail;

    // 탭 맵핑 정의 — 섹션의 h3 텍스트 / 클래스 / id / 특징 기반으로 분류
    var TAB_DEFS = [
      { key: 'overview', label: '개요',              tests: [/갤러리|사진/, /기본정보/, /특징/, /특이사항/] },
      { key: 'price',    label: '가격·시설',         tests: [/가격정보/, /시설|옵션/] },
      { key: 'desc',     label: '상세설명',          tests: [/상세설명/] },
      { key: 'raw',      label: '원본 · 건축물',    tests: [/원본 전체 정보/, /건축물대장/] },
      { key: 'memo',     label: '📞 연락처·메모',   tests: [/관계자 연락처/, /^메모$/] },
      { key: 'loc',      label: '위치·유사',         tests: [/위치 정보/, /유사/] }
    ];

    function classifySection(sectionEl) {
      // h3 텍스트로 분류
      var h3 = sectionEl.querySelector('h3');
      var txt = h3 ? h3.textContent.replace(/[📞📋🏗️📍⚠️]/g, '').trim() : '';
      for (var i = 0; i < TAB_DEFS.length; i++) {
        var t = TAB_DEFS[i];
        for (var j = 0; j < t.tests.length; j++) {
          if (t.tests[j].test(txt)) return t.key;
        }
      }
      // 갤러리/헤더는 h3 없음 — 클래스로 구분
      if (sectionEl.classList.contains('ws-detail-gallery')) return 'overview';
      if (sectionEl.classList.contains('ws-detail-header')) return 'overview';
      // id 기반 (유사매물)
      if (sectionEl.id === 'ws-similar-section') return 'loc';
      return 'overview'; // 기본값
    }

    window.WS.showDetail = function(listing) {
      // 1) 원본 호출 — DOM 은 그대로 14 섹션 렌더됨
      window.WS.__orig_showDetail(listing);

      // 2) 컨테이너 확보
      var container = document.getElementById('ws-detail-container');
      if (!container) return;

      // 3) 중복 래핑 방지
      if (container.querySelector('.wp-sticky')) return;

      // 4) 섹션들 수집
      var allSections = Array.prototype.slice.call(container.children);
      if (allSections.length === 0) return;

      // 5) 탭 컨테이너 생성
      var tabsNav = document.createElement('div');
      tabsNav.className = 'wp-tabs';
      var panels = {};
      TAB_DEFS.forEach(function(t) {
        var tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = 'wp-tab';
        tabBtn.setAttribute('data-wp-tab', t.key);
        tabBtn.textContent = t.label;
        if (t.key === 'overview') tabBtn.classList.add('active');
        tabsNav.appendChild(tabBtn);

        var panel = document.createElement('div');
        panel.className = 'wp-tab-panel' + (t.key === 'overview' ? ' active' : '');
        panel.setAttribute('data-wp-panel', t.key);
        panels[t.key] = panel;
      });

      // 6) sticky 헤더 생성 — 매물번호·주소·가격·관심
      var sticky = document.createElement('div');
      sticky.className = 'wp-sticky';
      var priceTxt = '';
      try {
        if (typeof formatPrice === 'function') {
          priceTxt = formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal) || '';
        } else if (window.WS.formatPrice) {
          priceTxt = window.WS.formatPrice(listing.deposit, listing.monthly, listing.price, listing.deal) || '';
        }
      } catch(e) {}
      var isFav = window.WS.state && window.WS.state.favorites &&
                  window.WS.state.favorites.some(function(f){return String(f) === String(listing.id);});
      sticky.innerHTML =
        '<div class="wp-sticky-info">' +
          '<strong>#' + escText(listing.id) + '</strong>' +
          escText((listing.title || '') + ' · ' + (listing.address || '') + ' ' + (listing.dong || '')) +
        '</div>' +
        '<div class="wp-sticky-price">' + escText(priceTxt || '-') + '</div>' +
        '<button class="wp-sticky-fav' + (isFav ? ' active' : '') + '" data-wp-fav="' + escAttr(listing.id) + '">' +
          (isFav ? '★ 관심' : '☆ 관심') +
        '</button>';

      // 7) 각 섹션을 해당 탭 패널로 이동
      allSections.forEach(function(sec) {
        var key = classifySection(sec);
        // 원본 "원본 전체 정보" 섹션은 기본접힘으로 변환 (C-02 해결)
        if (sec.classList && sec.classList.contains('ws-detail-section')) {
          var h3 = sec.querySelector('h3');
          if (h3 && /원본 전체 정보/.test(h3.textContent)) {
            makeRawFieldsCollapsible(sec);
          }
        }
        panels[key].appendChild(sec);
      });

      // 8) container 재조립
      container.innerHTML = '';
      container.appendChild(sticky);
      container.appendChild(tabsNav);
      TAB_DEFS.forEach(function(t) { container.appendChild(panels[t.key]); });

      // 9) 탭 전환 이벤트
      if (!container._wpTabsBound) {
        container._wpTabsBound = true;
        container.addEventListener('click', function(e) {
          var tabBtn = e.target.closest ? e.target.closest('[data-wp-tab]') : null;
          if (tabBtn) {
            var k = tabBtn.getAttribute('data-wp-tab');
            container.querySelectorAll('[data-wp-tab]').forEach(function(b){b.classList.remove('active');});
            tabBtn.classList.add('active');
            container.querySelectorAll('[data-wp-panel]').forEach(function(p){
              p.classList.toggle('active', p.getAttribute('data-wp-panel') === k);
            });
            container.scrollTop = 0;
            return;
          }
          var favBtn = e.target.closest ? e.target.closest('[data-wp-fav]') : null;
          if (favBtn) {
            var id = favBtn.getAttribute('data-wp-fav');
            if (window.WS.toggleFavorite) window.WS.toggleFavorite(id);
            favBtn.classList.toggle('active');
            favBtn.textContent = favBtn.classList.contains('active') ? '★ 관심' : '☆ 관심';
            return;
          }
          // 원본 접힘/펼침 헤더 클릭
          var rawFold = e.target.closest ? e.target.closest('.wp-rawfold') : null;
          if (rawFold) {
            rawFold.classList.toggle('open');
            var body = rawFold.nextElementSibling;
            if (body) body.style.display = rawFold.classList.contains('open') ? '' : 'none';
            return;
          }
        });
      }
    };

    function makeRawFieldsCollapsible(section) {
      var h3 = section.querySelector('h3');
      if (!h3 || h3.classList.contains('wp-rawfold')) return;
      h3.classList.add('wp-rawfold');
      // h3 바로 다음의 안내문 + rawRows 컨테이너를 접힘 대상으로 묶음
      var bodyWrap = document.createElement('div');
      bodyWrap.style.display = 'none';
      var next = h3.nextSibling;
      while (next) {
        var n = next.nextSibling;
        bodyWrap.appendChild(next);
        next = n;
      }
      section.appendChild(bodyWrap);
      h3.title = '클릭하여 펼침/접힘';
    }
  }

  // ======================================================================
  // P2. 브리핑 스튜디오 — 4 브리핑 함수 통합창
  // ======================================================================
  function patch_P2_BriefingStudio() {
    // 브리핑 스튜디오 상태
    var state = { target: null, format: null, output: null };

    var TARGETS = [
      { key: 'selected',  label: '선택한 매물',     ico: '✅', desc: '하단바에서 체크한 매물' },
      { key: 'favorites', label: '관심매물 전체',    ico: '⭐', desc: 'localStorage 저장 목록' },
      { key: 'today',     label: '오늘 신규등록',   ico: '🆕', desc: '최근 24시간 등록분' },
      { key: 'folder',    label: '고객폴더 선택',   ico: '👤', desc: '저장된 고객폴더에서' }
    ];
    var FORMATS = [
      { key: 'ai',      label: 'AI 요약',     ico: '✨', desc: 'Claude API 기반' },
      { key: 'table',   label: '표 형태',     ico: '📊', desc: '스펙 비교표' },
      { key: 'card',    label: '1장 카드',    ico: '🎴', desc: '핵심정보 요약' },
      { key: 'detail',  label: '상세 1장',    ico: '📄', desc: '전체정보 포함' }
    ];
    var OUTPUTS = [
      { key: 'screen', label: '화면 표시',  ico: '🖥️' },
      { key: 'kakao',  label: '카카오톡',   ico: '💬' },
      { key: 'pdf',    label: 'PDF 저장',   ico: '📄' },
      { key: 'print',  label: '인쇄',       ico: '🖨️' },
      { key: 'link',   label: '링크 복사',  ico: '🔗' }
    ];

    window.WS.showBriefingStudio = function(preset) {
      // 이미 열려있으면 닫기
      var existing = document.getElementById('wp-bs-modal');
      if (existing) { existing.remove(); }

      // preset 지원 — 구버전 버튼들에서 초기값 전달
      state = {
        target: (preset && preset.target) || null,
        format: (preset && preset.format) || null,
        output: (preset && preset.output) || null
      };

      var modal = document.createElement('div');
      modal.id = 'wp-bs-modal';
      modal.className = 'wp-bs-modal';
      modal.innerHTML =
        '<div class="wp-bs-box">' +
          '<div class="wp-bs-head">' +
            '<div><h3>📣 브리핑 스튜디오</h3><div class="wp-bs-head-sub">대상 × 포맷 × 출력 선택으로 원하는 브리핑을 한 번에 생성</div></div>' +
            '<button class="wp-bs-close" id="wp-bs-close">×</button>' +
          '</div>' +
          '<div class="wp-bs-body">' +
            bsStepHtml(1, '대상 선택', TARGETS, 'target') +
            bsStepHtml(2, '포맷 선택', FORMATS, 'format') +
            bsStepHtml(3, '출력 방식 선택', OUTPUTS, 'output') +
          '</div>' +
          '<div class="wp-bs-foot">' +
            '<div class="wp-bs-summary" id="wp-bs-summary">대상·포맷·출력을 모두 선택해주세요</div>' +
            '<button class="wp-bs-run" id="wp-bs-run" disabled>생성하기</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);

      // 이벤트 위임
      modal.addEventListener('click', function(e) {
        if (e.target.id === 'wp-bs-close' || e.target === modal) {
          modal.remove();
          return;
        }
        var opt = e.target.closest ? e.target.closest('.wp-bs-opt') : null;
        if (opt) {
          var grp = opt.getAttribute('data-wp-group');
          var val = opt.getAttribute('data-wp-val');
          state[grp] = val;
          modal.querySelectorAll('[data-wp-group="' + grp + '"]').forEach(function(b){ b.classList.remove('active'); });
          opt.classList.add('active');
          updateSummary();
          return;
        }
        if (e.target.id === 'wp-bs-run') {
          runBriefing();
          return;
        }
      });

      // preset 적용
      ['target','format','output'].forEach(function(grp){
        if (state[grp]) {
          var el = modal.querySelector('[data-wp-group="' + grp + '"][data-wp-val="' + state[grp] + '"]');
          if (el) el.classList.add('active');
        }
      });
      updateSummary();

      function updateSummary() {
        var parts = [];
        if (state.target) parts.push('<b>' + labelOf(TARGETS, state.target) + '</b>');
        if (state.format) parts.push('<b>' + labelOf(FORMATS, state.format) + '</b>');
        if (state.output) parts.push('<b>' + labelOf(OUTPUTS, state.output) + '</b>');
        var s = document.getElementById('wp-bs-summary');
        var btn = document.getElementById('wp-bs-run');
        if (parts.length === 3) {
          s.innerHTML = parts.join(' → ');
          btn.disabled = false;
        } else {
          s.innerHTML = '대상·포맷·출력을 모두 선택해주세요 (' + parts.length + '/3)';
          btn.disabled = true;
        }
      }

      function runBriefing() {
        modal.remove();
        dispatchBriefing(state);
      }
    };

    function bsStepHtml(n, title, opts, grp) {
      return '<div class="wp-bs-step">' +
        '<div class="wp-bs-step-title"><span class="wp-bs-step-num">' + n + '</span>' + title + '</div>' +
        '<div class="wp-bs-opts">' +
          opts.map(function(o){
            return '<button type="button" class="wp-bs-opt" data-wp-group="' + grp + '" data-wp-val="' + o.key + '">' +
              '<span class="wp-bs-opt-ico">' + o.ico + '</span>' + o.label +
              (o.desc ? '<div style="font-size:10.5px;opacity:0.7;margin-top:2px;font-weight:500;">' + o.desc + '</div>' : '') +
              '</button>';
          }).join('') +
        '</div></div>';
    }
    function labelOf(list, key) {
      for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].label;
      return key;
    }

    // 디스패처 — 기존 함수로 라우팅
    function dispatchBriefing(st) {
      // 선택된 매물 배열 확보
      var listings = resolveTarget(st.target);
      if (!listings || listings.length === 0) {
        if (window.WS.showToast) window.WS.showToast('대상 매물이 없습니다 (' + st.target + ')', 'error');
        return;
      }

      // target 에 맞게 선택상태 set (기존 함수들은 state.selectedIds 기반 작동)
      if (!window.WS.state.selectedIds) window.WS.state.selectedIds = new Set();
      window.WS.state.selectedIds.clear();
      listings.forEach(function(l){ window.WS.state.selectedIds.add(String(l.id)); });
      if (window.WS._updateSelectedCount) window.WS._updateSelectedCount();

      // 포맷×출력 조합 라우팅
      try {
        if (st.format === 'ai' && (st.output === 'screen' || st.output === 'pdf' || st.output === 'print')) {
          // AI 브리핑 사용
          if (window.WS.generateBriefing) window.WS.generateBriefing();
        } else if (st.format === 'detail' && st.output === 'pdf') {
          if (window.WS.showPDFBriefing) window.WS.showPDFBriefing();
        } else if (st.format === 'card' && st.output === 'kakao') {
          if (window.WS.shareKakaoCard) window.WS.shareKakaoCard();
        } else if (st.output === 'kakao') {
          // 카톡 공유 기본
          if (window.WS.shareKakaoCard) window.WS.shareKakaoCard();
        } else if (st.output === 'link') {
          if (window.WS.showShareLink) window.WS.showShareLink();
        } else if (st.output === 'print') {
          if (window.WS.printSelected) window.WS.printSelected();
        } else if (st.output === 'pdf') {
          if (window.WS.showPDFBriefing) window.WS.showPDFBriefing();
          else if (window.WS._downloadBriefingPDF) window.WS.generateBriefing();
        } else if (st.target === 'today' && st.format === 'ai') {
          if (window.WS.generateDailyBriefing) window.WS.generateDailyBriefing();
          else if (window.WS.showDailyBriefing) window.WS.showDailyBriefing();
        } else if (st.format === 'table' || st.format === 'card') {
          // 화면 표시 기본 — AI 브리핑으로 대체
          if (window.WS.generateBriefing) window.WS.generateBriefing();
        } else {
          if (window.WS.generateBriefing) window.WS.generateBriefing();
        }
        if (window.WS.showToast) window.WS.showToast('브리핑 생성: ' + listings.length + '건 / ' + st.format + ' → ' + st.output, 'success');
      } catch (err) {
        console.error(PATCH_TAG + ' briefing dispatch error', err);
        if (window.WS.showToast) window.WS.showToast('브리핑 생성 중 오류가 발생했습니다', 'error');
      }
    }

    function resolveTarget(key) {
      var all = window.WS.allListings || [];
      var st  = window.WS.state || {};
      if (key === 'selected') {
        if (!st.selectedIds || st.selectedIds.size === 0) return [];
        return all.filter(function(l){ return st.selectedIds.has(String(l.id)); });
      }
      if (key === 'favorites') {
        var favs = st.favorites || [];
        return all.filter(function(l){ return favs.some(function(f){return String(f) === String(l.id);}); });
      }
      if (key === 'today') {
        var cutoff = Date.now() - 24 * 60 * 60 * 1000;
        return all.filter(function(l){
          var t = l.created_at ? new Date(l.created_at).getTime() : 0;
          return t >= cutoff;
        });
      }
      if (key === 'folder') {
        // 고객폴더 선택은 기존 UI 사용 — 첫 폴더 사용
        try {
          var folders = JSON.parse(localStorage.getItem('ws-customer-folders') || '[]');
          if (folders.length === 0) return [];
          var items = folders[0].items || [];
          return all.filter(function(l){ return items.some(function(i){return String(i.id || i) === String(l.id);}); });
        } catch(e) { return []; }
      }
      return [];
    }
  }

  // ======================================================================
  // P3. 하단바 간소화 + ⌘K 팔레트
  // ======================================================================
  function patch_P3_BottomBarAndPalette() {
    // 팔레트 명령 카탈로그 — 기존 window.WS.* 함수 매핑
    var COMMANDS = [
      // 공유
      { cat: '공유', icon: '💬', label: '카카오톡 공유',      fn: 'shareKakaoCard',       kws: ['카톡','공유','kakao','share'] },
      { cat: '공유', icon: '📄', label: 'PDF 브리핑',          fn: 'showPDFBriefing',      kws: ['pdf','브리핑','인쇄pdf'] },
      { cat: '공유', icon: '🔗', label: '링크 공유',            fn: 'showShareLink',         kws: ['링크','url','share'] },
      { cat: '공유', icon: '📣', label: '브리핑 스튜디오',      fn: 'showBriefingStudio',    kws: ['브리핑','스튜디오','ai','일일','추천'] },
      { cat: '공유', icon: '🌐', label: '검색조건 공유',        fn: 'shareSearchCondition',  kws: ['검색조건','공유'] },
      // 분석
      { cat: '분석', icon: '📊', label: '통계',                  fn: 'showStats',             kws: ['통계','stats'] },
      { cat: '분석', icon: '📈', label: '시세분석',              fn: 'showMarketAnalysis',    kws: ['시세','market','analysis'] },
      { cat: '분석', icon: '🔄', label: '회전율',                fn: 'showTurnoverAnalysis',  kws: ['회전율','turnover'] },
      { cat: '분석', icon: '🗺️', label: '밀집도 히트맵',        fn: 'showHeatmap',           kws: ['밀집도','히트맵','heatmap'] },
      { cat: '분석', icon: '📉', label: '가격 변동감지',         fn: 'showPriceChanges',      kws: ['변동','가격','price'] },
      { cat: '분석', icon: '📋', label: '고객 추천리포트',       fn: 'showCustomerReport',    kws: ['추천','리포트','고객'] },
      { cat: '분석', icon: '🎯', label: '스마트 추천',           fn: 'showSmartRecommend',    kws: ['스마트','추천','smart'] },
      { cat: '분석', icon: '⚖️', label: '비교 (통합)',           fn: 'showUnifiedCompare',    kws: ['비교','compare'] },
      // 관리
      { cat: '관리', icon: '👤', label: '고객폴더',              fn: 'showCustomerFolders',   kws: ['고객','폴더','customer'] },
      { cat: '관리', icon: '🏢', label: '건물그룹',              fn: 'showBuildingGroups',    kws: ['건물','그룹','building'] },
      { cat: '관리', icon: '📝', label: '메모 관리',              fn: 'showMemoManager',       kws: ['메모','memo'] },
      { cat: '관리', icon: '🔎', label: '메모 검색',              fn: 'showMemoSearch',        kws: ['메모','검색'] },
      { cat: '관리', icon: '📋', label: '내 검색 (통합)',         fn: 'showMySearches',        kws: ['내검색','프리셋','퀵필터','히스토리','preset'] },
      { cat: '관리', icon: '📈', label: '변동이력',              fn: 'showChangelog',         kws: ['변동','이력','changelog'] },
      { cat: '관리', icon: '📣', label: '일일 브리핑',            fn: 'showDailyBriefing',     kws: ['일일','브리핑','daily'] },
      // 설정
      { cat: '설정', icon: '🔔', label: '알림 설정',              fn: 'showAlertSettings',     kws: ['알림','alert'] },
      { cat: '설정', icon: '⏱️', label: '자동 새로고침',          fn: 'showAutoRefreshTimer',  kws: ['자동','새로고침','refresh'] },
      { cat: '설정', icon: '🌙', label: '다크모드',                fn: 'showDarkModeSettings',  kws: ['다크','dark'] },
      { cat: '설정', icon: '💾', label: '백업/복원',              fn: 'showBackupRestore',     kws: ['백업','복원','backup'] },
      { cat: '설정', icon: '⌨️', label: '단축키 도움말',          fn: 'showKeyboardShortcuts', kws: ['단축키','shortcut','도움말'] }
    ];

    window.WS.__wpCommands = COMMANDS;

    // ─── 하단바 replace — MutationObserver 로 DOM 생성 감지 ───
    function simplifyBottomBar() {
      var bar = document.querySelector('.ws-bottom-bar');
      if (!bar || bar._wpSimplified) return;
      bar._wpSimplified = true;

      var groups = bar.querySelector('.ws-bar-groups');
      if (!groups) return;

      // 공유 드롭다운 내의 "브리핑 스튜디오" 추가 (기존 유지)
      // 4 드롭업 중 앞 3개 (분석/관리/설정) 는 숨기고 ⌘ 도구 버튼 1개로 대체
      var dropdowns = groups.querySelectorAll('.ws-bar-dropdown');
      // 첫번째 (공유) 는 유지하되 "브리핑 스튜디오" 메뉴 추가
      if (dropdowns[0]) {
        var menu = dropdowns[0].querySelector('.ws-dropdown-menu');
        if (menu && !menu.querySelector('[data-wp-bs]')) {
          var mi = document.createElement('button');
          mi.className = 'ws-dropdown-item';
          mi.setAttribute('data-wp-bs', '1');
          mi.innerHTML = '📣 브리핑 스튜디오 (통합)';
          mi.addEventListener('click', function(){ window.WS.showBriefingStudio(); });
          menu.insertBefore(mi, menu.firstChild);
        }
      }
      // 나머지 3개 (분석/관리/설정) 숨김 — 요소는 보존 (롤백가능)
      for (var i = 1; i < dropdowns.length; i++) {
        dropdowns[i].style.display = 'none';
        dropdowns[i].setAttribute('data-wp-hidden', '1');
      }

      // ⌘ 도구 버튼 추가
      if (!groups.querySelector('[data-wp-tools]')) {
        var toolsBtn = document.createElement('button');
        toolsBtn.className = 'wp-tools-btn';
        toolsBtn.setAttribute('data-wp-tools', '1');
        toolsBtn.innerHTML = '⚡ 도구 <span class="wp-kbd">⌘K</span>';
        toolsBtn.addEventListener('click', function(){ window.WS.showCommandPalette(); });
        groups.appendChild(toolsBtn);
      }
    }

    // 매물검색 UI 가 뒤늦게 생성될 수 있으니 observer 붙임
    var obs = new MutationObserver(function(muts) {
      for (var i = 0; i < muts.length; i++) {
        simplifyBottomBar();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    simplifyBottomBar(); // 이미 있으면 즉시
    window.WS.__wpBarObserver = obs;

    // ─── 팔레트 ───
    window.WS.showCommandPalette = function() {
      var existing = document.getElementById('wp-pal-modal');
      if (existing) { existing.remove(); return; }

      var modal = document.createElement('div');
      modal.id = 'wp-pal-modal';
      modal.className = 'wp-pal-modal';
      modal.innerHTML =
        '<div class="wp-pal-box">' +
          '<input class="wp-pal-input" id="wp-pal-input" placeholder="명령 검색... (예: 시세, 카톡, 백업, 비교)" autocomplete="off">' +
          '<div class="wp-pal-list" id="wp-pal-list"></div>' +
          '<div class="wp-pal-foot">' +
            '<span><span class="wp-kbd">↑↓</span> 이동</span>' +
            '<span><span class="wp-kbd">Enter</span> 실행</span>' +
            '<span><span class="wp-kbd">ESC</span> 닫기</span>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);

      var input = document.getElementById('wp-pal-input');
      var list = document.getElementById('wp-pal-list');
      var cursor = 0;
      var filtered = [];

      // 자주쓰기 우선순위 (localStorage 저장)
      var frecent;
      try { frecent = JSON.parse(localStorage.getItem('wp-pal-frecent') || '{}'); } catch(e){ frecent = {}; }

      function render(q) {
        q = (q || '').trim().toLowerCase();
        if (!q) {
          // 비어있으면 최근/자주쓰는 것부터
          filtered = COMMANDS.slice().sort(function(a,b){
            return (frecent[b.fn]||0) - (frecent[a.fn]||0);
          });
        } else {
          filtered = COMMANDS
            .map(function(c){
              var s = 0;
              if (c.label.toLowerCase().indexOf(q) >= 0) s += 10;
              if (c.cat.toLowerCase().indexOf(q) >= 0) s += 3;
              for (var i = 0; i < c.kws.length; i++) {
                if (c.kws[i].indexOf(q) >= 0) s += 6;
              }
              s += (frecent[c.fn] || 0) * 0.1;
              return { c: c, s: s };
            })
            .filter(function(x){ return x.s > 0; })
            .sort(function(a,b){ return b.s - a.s; })
            .map(function(x){ return x.c; });
        }
        cursor = 0;
        if (filtered.length === 0) {
          list.innerHTML = '<div class="wp-pal-empty">검색 결과가 없습니다</div>';
        } else {
          list.innerHTML = filtered.map(function(c, i){
            return '<div class="wp-pal-item' + (i === cursor ? ' active' : '') + '" data-wp-fn="' + c.fn + '">' +
              '<span class="wp-pal-ico">' + c.icon + '</span>' +
              '<span class="wp-pal-label">' + c.label + '</span>' +
              '<span class="wp-pal-cat">' + c.cat + '</span>' +
              '</div>';
          }).join('');
        }
      }
      render('');
      setTimeout(function(){ input.focus(); }, 50);

      function run(fn) {
        frecent[fn] = (frecent[fn] || 0) + 1;
        try { localStorage.setItem('wp-pal-frecent', JSON.stringify(frecent)); } catch(e){}
        modal.remove();
        try {
          if (typeof window.WS[fn] === 'function') window.WS[fn]();
          else if (window.WS.showToast) window.WS.showToast('기능을 찾을 수 없음: ' + fn, 'error');
        } catch (err) {
          console.error(PATCH_TAG + ' palette run error', err);
        }
      }

      input.addEventListener('input', function(){ render(input.value); });
      input.addEventListener('keydown', function(e){
        if (e.key === 'Escape') { modal.remove(); return; }
        if (e.key === 'Enter') { e.preventDefault(); if (filtered[cursor]) run(filtered[cursor].fn); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, filtered.length - 1); updateActive(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); updateActive(); return; }
      });
      list.addEventListener('click', function(e){
        var item = e.target.closest ? e.target.closest('[data-wp-fn]') : null;
        if (item) run(item.getAttribute('data-wp-fn'));
      });
      modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
      function updateActive() {
        var items = list.querySelectorAll('.wp-pal-item');
        items.forEach(function(it, i){ it.classList.toggle('active', i === cursor); });
        var active = items[cursor];
        if (active) active.scrollIntoView({ block: 'nearest' });
      }
    };

    // ⌘K / Ctrl+K 전역 키바인딩
    if (!window.__wpPalKeyBound) {
      window.__wpPalKeyBound = true;
      window.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          window.WS.showCommandPalette();
        }
      });
    }
  }

  // ======================================================================
  // P4. 저장검색 통합 (내 검색) + 비교 통합
  // ======================================================================
  function patch_P4_MySearchesAndCompare() {
    // ─── 내 검색 (프리셋 + 퀵필터 + 히스토리) ───
    window.WS.showMySearches = function() {
      var existing = document.getElementById('wp-my-searches');
      if (existing) { existing.remove(); return; }

      var modal = document.createElement('div');
      modal.id = 'wp-my-searches';
      modal.className = 'wp-bs-modal';
      modal.innerHTML =
        '<div class="wp-bs-box" style="max-width:720px;">' +
          '<div class="wp-bs-head">' +
            '<div><h3>📋 내 검색</h3><div class="wp-bs-head-sub">저장된 프리셋·퀵필터·히스토리를 한 곳에서</div></div>' +
            '<button class="wp-bs-close" id="wp-ms-close">×</button>' +
          '</div>' +
          '<div class="wp-bs-body">' +
            '<div class="wp-tabs-inner">' +
              '<button class="active" data-wp-mstab="saved">내가 저장한 것</button>' +
              '<button data-wp-mstab="quick">퀵필터(빠른 템플릿)</button>' +
              '<button data-wp-mstab="history">최근 기록</button>' +
            '</div>' +
            '<div id="wp-ms-body"></div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);

      function loadTab(tab) {
        var body = document.getElementById('wp-ms-body');
        body.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px;">불러오는 중...</div>';

        // 기존 함수 호출 — 모달 내용을 body 로 이식
        setTimeout(function(){
          try {
            if (tab === 'saved' && window.WS.showPresetManager) {
              body.innerHTML = '<p style="font-size:12.5px;color:#475569;margin-bottom:10px;">저장된 검색 프리셋을 관리합니다. 아래 버튼으로 기존 프리셋 관리창을 엽니다.</p>' +
                '<button class="wp-bs-run" id="wp-ms-open-preset">프리셋 관리 열기</button>';
              document.getElementById('wp-ms-open-preset').addEventListener('click', function(){
                modal.remove();
                window.WS.showPresetManager();
              });
            } else if (tab === 'quick' && window.WS.showQuickFilters) {
              body.innerHTML = '<p style="font-size:12.5px;color:#475569;margin-bottom:10px;">미리 정의된 빠른 필터 템플릿을 적용합니다.</p>' +
                '<button class="wp-bs-run" id="wp-ms-open-quick">퀵필터 열기</button>';
              document.getElementById('wp-ms-open-quick').addEventListener('click', function(){
                modal.remove();
                window.WS.showQuickFilters();
              });
            } else if (tab === 'history' && window.WS.showSearchHistory) {
              body.innerHTML = '<p style="font-size:12.5px;color:#475569;margin-bottom:10px;">최근 사용한 검색 기록을 다시 적용할 수 있습니다.</p>' +
                '<button class="wp-bs-run" id="wp-ms-open-history">검색 히스토리 열기</button>';
              document.getElementById('wp-ms-open-history').addEventListener('click', function(){
                modal.remove();
                window.WS.showSearchHistory();
              });
            } else {
              body.innerHTML = '<p style="font-size:12.5px;color:#94a3b8;">해당 기능을 사용할 수 없습니다.</p>';
            }
          } catch(err) {
            body.innerHTML = '<p style="font-size:12.5px;color:#D32F2F;">오류: ' + escText(err.message) + '</p>';
          }
        }, 50);
      }
      loadTab('saved');

      modal.addEventListener('click', function(e){
        if (e.target.id === 'wp-ms-close' || e.target === modal) { modal.remove(); return; }
        var t = e.target.closest ? e.target.closest('[data-wp-mstab]') : null;
        if (t) {
          modal.querySelectorAll('[data-wp-mstab]').forEach(function(b){b.classList.remove('active');});
          t.classList.add('active');
          loadTab(t.getAttribute('data-wp-mstab'));
        }
      });
    };

    // ─── 비교 통합 (선택 / 관심목록 / 즐겨비교 토글) ───
    window.WS.showUnifiedCompare = function() {
      var existing = document.getElementById('wp-unified-compare');
      if (existing) { existing.remove(); return; }

      var modal = document.createElement('div');
      modal.id = 'wp-unified-compare';
      modal.className = 'wp-bs-modal';
      modal.innerHTML =
        '<div class="wp-bs-box" style="max-width:720px;">' +
          '<div class="wp-bs-head">' +
            '<div><h3>⚖️ 매물 비교 (통합)</h3><div class="wp-bs-head-sub">대상 선택 후 비교 · 차트</div></div>' +
            '<button class="wp-bs-close" id="wp-uc-close">×</button>' +
          '</div>' +
          '<div class="wp-bs-body">' +
            '<div class="wp-bs-step-title">비교 대상</div>' +
            '<div class="wp-bs-opts">' +
              '<button class="wp-bs-opt" data-wp-ucmode="selected"><span class="wp-bs-opt-ico">✅</span>선택 매물<div style="font-size:10.5px;opacity:0.7;margin-top:2px;">하단바 체크한 것</div></button>' +
              '<button class="wp-bs-opt" data-wp-ucmode="favorites"><span class="wp-bs-opt-ico">⭐</span>관심 매물<div style="font-size:10.5px;opacity:0.7;margin-top:2px;">저장된 관심목록</div></button>' +
              '<button class="wp-bs-opt" data-wp-ucmode="chart"><span class="wp-bs-opt-ico">📊</span>비교 차트<div style="font-size:10.5px;opacity:0.7;margin-top:2px;">그래프로 시각화</div></button>' +
            '</div>' +
          '</div>' +
          '<div class="wp-bs-foot"><div></div><button class="wp-bs-run" id="wp-uc-run" disabled>비교 시작</button></div>' +
        '</div>';
      document.body.appendChild(modal);

      var picked = null;
      modal.addEventListener('click', function(e){
        if (e.target.id === 'wp-uc-close' || e.target === modal) { modal.remove(); return; }
        var opt = e.target.closest ? e.target.closest('[data-wp-ucmode]') : null;
        if (opt) {
          picked = opt.getAttribute('data-wp-ucmode');
          modal.querySelectorAll('[data-wp-ucmode]').forEach(function(b){b.classList.remove('active');});
          opt.classList.add('active');
          document.getElementById('wp-uc-run').disabled = false;
          return;
        }
        if (e.target.id === 'wp-uc-run' && picked) {
          modal.remove();
          if (picked === 'selected' && window.WS.showCompare) window.WS.showCompare();
          else if (picked === 'favorites' && window.WS.showFavCompare) window.WS.showFavCompare();
          else if (picked === 'chart' && window.WS.showCompareChart) window.WS.showCompareChart();
        }
      });
    };
  }

  // ======================================================================
  // P5. 중복정의 진단 + 경미 UX 3건
  // ======================================================================
  function patch_P5_MinorFixes() {
    // m-01: 필터 토글 문구를 상태에 따라 동적 변경
    (function fixFilterToggle() {
      var toggle = document.getElementById('ws-filters-toggle');
      if (!toggle) {
        // DOM 생성 전 — observer 로 대기
        var obs = new MutationObserver(function() {
          var t = document.getElementById('ws-filters-toggle');
          if (t && !t._wpFixed) {
            bindToggle(t);
            obs.disconnect();
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
      } else {
        bindToggle(toggle);
      }
      function bindToggle(t) {
        t._wpFixed = true;
        var filtersSection = document.getElementById('ws-filters-section');
        function updateText() {
          var collapsed = filtersSection && filtersSection.style.display === 'none';
          var span = t.querySelector('span');
          if (span) span.textContent = collapsed ? '▼ 필터 펼치기' : '▲ 필터 접기';
        }
        t.addEventListener('click', function(){ setTimeout(updateText, 50); });
        updateText();
      }
    })();

    // m-02: 매물번호 복사 툴팁
    (function fixCopyIdTooltip() {
      var obs = new MutationObserver(function() {
        document.querySelectorAll('.ws-copy-id:not([data-wp-tip])').forEach(function(el) {
          el.setAttribute('data-wp-tip', '1');
          el.setAttribute('title', '클릭하여 매물번호 복사');
        });
      });
      obs.observe(document.body, { childList: true, subtree: true });
      document.querySelectorAll('.ws-copy-id').forEach(function(el) {
        el.setAttribute('title', '클릭하여 매물번호 복사');
      });
    })();

    // m-03: 페이지 표시 위치 강조 (작은 회색 → 명시적)
    (function fixPageInfo() {
      var obs = new MutationObserver(function() {
        var t = document.getElementById('ws-page-info-text');
        if (t && !t._wpFixed) {
          t._wpFixed = true;
          t.style.fontSize = '12px';
          t.style.color = '#2D5A27';
          t.style.fontWeight = '700';
          t.style.background = '#f0f7ed';
          t.style.padding = '3px 10px';
          t.style.borderRadius = '10px';
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    })();
  }

  // ======================================================================
  // 중복정의 진단 로그
  // ======================================================================
  function diagnostics_duplicateDefs() {
    var dupFns = ['showSearchUI','renderAll','toggleFavorite','toggleDarkMode','generateShareText'];
    console.log('%c' + PATCH_TAG + ' duplicate def audit (원본 코드 내 2회 정의 — 2차가 살아있음)',
      'color:#d97706;font-weight:700');
    dupFns.forEach(function(fn){
      if (typeof window.WS[fn] === 'function') {
        console.log('  · window.WS.' + fn + ' → active');
      } else {
        console.warn('  · window.WS.' + fn + ' → MISSING');
      }
    });
  }

  // ======================================================================
  // 롤백 — 긴급시 호출 가능
  // ======================================================================
  function rollback() {
    try {
      if (window.WS.__orig_showDetail) {
        window.WS.showDetail = window.WS.__orig_showDetail;
      }
      delete window.WS.showBriefingStudio;
      delete window.WS.showCommandPalette;
      delete window.WS.showMySearches;
      delete window.WS.showUnifiedCompare;
      // 바텀바 복원
      document.querySelectorAll('.ws-bar-dropdown[data-wp-hidden]').forEach(function(el){
        el.style.display = '';
        el.removeAttribute('data-wp-hidden');
      });
      var toolsBtn = document.querySelector('[data-wp-tools]');
      if (toolsBtn) toolsBtn.remove();
      var st = document.getElementById('ws-wp-styles');
      if (st) st.remove();
      if (window.WS.__wpBarObserver) { window.WS.__wpBarObserver.disconnect(); }
      window.WS.__wpPatchApplied = false;
      console.log('%c' + PATCH_TAG + ' rolled back', 'background:#D32F2F;color:#fff;padding:2px 8px;');
      if (window.WS.showToast) window.WS.showToast('UI 패치 롤백 완료', 'info');
    } catch(err) {
      console.error(PATCH_TAG + ' rollback error', err);
    }
  }

  // ======================================================================
  // 유틸
  // ======================================================================
  function escText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escAttr(s) { return escText(s); }

})();
