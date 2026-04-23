// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// content-v297-edit.js (2026-04-23)
//
// 🛠 L-crit4c — /search 상세모달 "크롤링한 원본보기" 외 전 필드 편집
//
// 요구사항 (사용자 직접 지시)
//   "wishes.co.kr/search 매물 수정 및 편집에서 상세 모달에 있는 크롤링한
//    원본보기만 제외하고는 전부다 수정 및 편집 가능하게 해줘야되고"
//
// 범위
//   편집 가능
//     · 기본 정보   : type, deal, rooms, bathrooms, floor_current,
//                     floor_total, direction, heating_type, building_name,
//                     built_year, entrance_type, parking_spaces,
//                     parking_fee, lease_period
//     · 면적        : area_m2 (평수는 자동 환산)
//     · 가격        : deposit, rent, management_fee, purchase_price
//     · 주소        : address, road_address, detail_address, dong
//     · 본문        : description, special_notes, features[]
//     · AI 콘텐츠   : ai_title, ai_description, seo_keywords[], seo_tags[],
//                     seo_meta_description
//     · 메타        : status (공개/비공개/계약중/계약완료)
//   편집 불가 (READ-ONLY, 🔒 표기)
//     · 크롤링한 원본 본문 (raw_fields)
//     · 원본URL, 출처 사이트 (source_url, source_site)
//
// 엔드포인트
//   PUT /api/admin/listings   Authorization: Bearer ${ws_token}
//     body: { id, ...changedFields }
//   (zod createListingSchema.partial() 로 서버에서 필드별 검증)
//
// 설계
//   1) window.WS.showDetail 을 v296 위에 wrap. post-render 시 헤더 우측에
//      "✏️ 매물 수정" 버튼 삽입.
//   2) 버튼 클릭 시 slide-over 패널 오픈. 모든 편집 가능 필드를 섹션별로
//      폼으로 표시. data-v297-lock="original" 카드는 건드리지 않음.
//   3) 저장 버튼 클릭 → diff 계산 → PUT → 성공 시 listing 객체 merge + 전체
//      showDetail 재렌더 → 패널 닫기. 실패 시 에러 토스트.
//   4) ESC · 취소 버튼 · 배경 클릭 시 변경사항 유실 확인 후 닫기.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function(){
  'use strict';
  var VERSION = '2.9.7';
  var TAG = '[WP v' + VERSION + ' edit]';

  try { if (window.WS && window.WS.__v297EditApplied) return; } catch(_){}

  var MAX_TRIES = 120, POLL = 100, tries = 0;

  function getToken(){
    try {
      return sessionStorage.getItem('ws_token') ||
             localStorage.getItem('ws_token') || '';
    } catch(_) { return ''; }
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function toast(msg, kind){
    try {
      var t = document.createElement('div');
      t.className = 'v297-toast v297-toast-' + (kind || 'info');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function(){ t.style.opacity = '0'; }, 2400);
      setTimeout(function(){ try { t.remove(); } catch(_){} }, 2800);
    } catch(_){}
  }

  function injectCss(){
    if (document.getElementById('v297-edit-css')) return;
    var s = document.createElement('style');
    s.id = 'v297-edit-css';
    s.textContent = [
      '.v297-edit-btn{',
      '  display:inline-flex;align-items:center;gap:6px;',
      '  margin-left:8px;padding:6px 12px;border-radius:6px;',
      '  border:1px solid #2E7D32;background:#fff;color:#2E7D32;',
      '  font-size:12px;font-weight:700;cursor:pointer;',
      '  transition:all .15s ease;',
      '}',
      '.v297-edit-btn:hover{background:#E8F5E9;}',
      '.v297-edit-btn:disabled{opacity:.5;cursor:not-allowed;}',

      '.v297-overlay{',
      '  position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100020;',
      '  display:flex;justify-content:flex-end;align-items:stretch;',
      '  animation:v297-fade .15s ease;',
      '}',
      '@keyframes v297-fade{from{opacity:0}to{opacity:1}}',
      '.v297-panel{',
      '  width:min(640px,100vw);background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.15);',
      '  display:flex;flex-direction:column;animation:v297-slide .2s ease;',
      '}',
      '@keyframes v297-slide{from{transform:translateX(40px)}to{transform:translateX(0)}}',
      '.v297-hd{',
      '  display:flex;justify-content:space-between;align-items:center;',
      '  padding:14px 18px;border-bottom:1px solid #E6EDE9;background:#F8FBF9;',
      '}',
      '.v297-hd-t{font-size:16px;font-weight:800;color:#1e3a2a;}',
      '.v297-hd-close{',
      '  background:none;border:none;font-size:22px;color:#5a7d66;cursor:pointer;',
      '  line-height:1;padding:4px 10px;border-radius:6px;',
      '}',
      '.v297-hd-close:hover{background:#E6EDE9;}',
      '.v297-body{flex:1;overflow-y:auto;padding:16px 18px;}',
      '.v297-sec{margin-bottom:22px;}',
      '.v297-sec-h{',
      '  font-size:13px;font-weight:800;color:#1e3a2a;',
      '  margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #C8E6C9;',
      '}',
      '.v297-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;}',
      '.v297-fld{display:flex;flex-direction:column;gap:4px;}',
      '.v297-fld.v297-fld-full{grid-column:1/-1;}',
      '.v297-lbl{font-size:11px;font-weight:700;color:#4b6355;}',
      '.v297-lbl .v297-req{color:#d32f2f;margin-left:2px;}',
      '.v297-inp,.v297-sel,.v297-ta{',
      '  width:100%;padding:7px 9px;border:1px solid #D0DCC9;border-radius:6px;',
      '  font-size:13px;color:#1e3a2a;background:#fff;font-family:inherit;',
      '  transition:border-color .12s ease;',
      '}',
      '.v297-inp:focus,.v297-sel:focus,.v297-ta:focus{outline:none;border-color:#2E7D32;}',
      '.v297-ta{min-height:80px;resize:vertical;}',
      '.v297-hint{font-size:10px;color:#8aa091;}',
      '.v297-lock-note{',
      '  font-size:11px;color:#8aa091;background:#F5F7F4;',
      '  padding:8px 12px;border-radius:6px;border-left:3px solid #D0DCC9;',
      '  margin-top:4px;',
      '}',
      '.v297-ft{',
      '  display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;',
      '  border-top:1px solid #E6EDE9;background:#F8FBF9;',
      '}',
      '.v297-btn{',
      '  padding:8px 18px;border-radius:6px;font-size:13px;font-weight:700;',
      '  cursor:pointer;border:1px solid transparent;transition:all .12s ease;',
      '}',
      '.v297-btn-cancel{background:#fff;color:#4b6355;border-color:#D0DCC9;}',
      '.v297-btn-cancel:hover{background:#F5F7F4;}',
      '.v297-btn-save{background:#2E7D32;color:#fff;}',
      '.v297-btn-save:hover{background:#1B5E20;}',
      '.v297-btn-save:disabled{opacity:.5;cursor:not-allowed;}',

      '.v297-toast{',
      '  position:fixed;bottom:28px;left:50%;transform:translateX(-50%);',
      '  padding:10px 18px;border-radius:8px;background:#1e3a2a;color:#fff;',
      '  font-size:13px;font-weight:600;z-index:100030;opacity:1;',
      '  transition:opacity .3s ease;box-shadow:0 4px 16px rgba(0,0,0,.2);',
      '}',
      '.v297-toast-err{background:#c62828;}',
      '.v297-toast-ok{background:#2E7D32;}',

      '@media (max-width:640px){',
      '  .v297-panel{width:100vw;}',
      '  .v297-grid{grid-template-columns:1fr;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ----------------------------------------------------------------------
  // 폼 필드 정의 (섹션별)
  // ----------------------------------------------------------------------
  var DEAL_OPTS = ['매매', '전세', '월세', '단기'];
  var TYPE_OPTS = ['원룸', '투룸', '쓰리룸', '오피스텔', '빌라', '아파트',
                   '단독/다가구', '상가', '사무실', '공오피스', '건물', '토지', '기타'];
  var DIR_OPTS  = ['-', '남향', '남동향', '남서향', '동향', '서향',
                   '북향', '북동향', '북서향', '남북향'];
  var HEAT_OPTS = ['-', '개별난방', '중앙난방', '지역난방',
                   '개별냉난방', '시스템에어컨'];
  var STAT_OPTS = ['공개', '비공개', '계약중', '계약완료'];

  function selectHtml(name, current, opts, allowEmpty){
    var out = '<select class="v297-sel" name="' + esc(name) + '">';
    if (allowEmpty) {
      out += '<option value=""' + (!current ? ' selected' : '') + '>-</option>';
    }
    opts.forEach(function(o){
      var sel = String(current || '') === String(o) ? ' selected' : '';
      out += '<option value="' + esc(o) + '"' + sel + '>' + esc(o) + '</option>';
    });
    out += '</select>';
    return out;
  }

  function inputHtml(name, value, type, placeholder){
    type = type || 'text';
    placeholder = placeholder || '';
    return '<input class="v297-inp" type="' + esc(type) + '"' +
           ' name="' + esc(name) + '"' +
           ' value="' + esc(value == null ? '' : value) + '"' +
           (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + ' />';
  }

  function taHtml(name, value, rows){
    return '<textarea class="v297-ta" name="' + esc(name) + '"' +
           ' rows="' + (rows || 4) + '">' +
           esc(value == null ? '' : value) + '</textarea>';
  }

  function fld(label, inner, full, hint){
    return '<div class="v297-fld' + (full ? ' v297-fld-full' : '') + '">' +
             '<label class="v297-lbl">' + esc(label) + '</label>' +
             inner +
             (hint ? '<span class="v297-hint">' + esc(hint) + '</span>' : '') +
           '</div>';
  }

  function arrToStr(v){
    if (Array.isArray(v)) return v.join(', ');
    if (v == null) return '';
    return String(v);
  }

  function buildPanel(L){
    var html = '';

    // --- 1) 기본 정보 ---
    html += '<section class="v297-sec">';
    html += '<div class="v297-sec-h">🏠 기본 정보</div>';
    html += '<div class="v297-grid">';
    html += fld('매물 유형', selectHtml('type', L.type, TYPE_OPTS, true));
    html += fld('거래 유형', selectHtml('deal', L.deal, DEAL_OPTS, true));
    html += fld('건물명', inputHtml('building_name', L.building_name));
    html += fld('준공년도', inputHtml('built_year', L.built_year, 'number', 'YYYY'));
    html += fld('전용면적 (㎡)', inputHtml('area_m2', L.area_m2, 'number', '예: 33.5'));
    html += fld('공급면적 (㎡)', inputHtml('area_supply_m2', L.area_supply_m2, 'number', '예: 42.0'));
    html += fld('해당 층', inputHtml('floor_current', L.floor_current));
    html += fld('총 층', inputHtml('floor_total', L.floor_total));
    html += fld('방 수', inputHtml('rooms', L.rooms, 'number'));
    html += fld('욕실 수', inputHtml('bathrooms', L.bathrooms, 'number'));
    html += fld('방향', selectHtml('direction', L.direction, DIR_OPTS));
    html += fld('난방', selectHtml('heating_type', L.heating_type, HEAT_OPTS));
    html += fld('현관 구조', inputHtml('entrance_type', L.entrance_type, 'text', '계단식/복도식/타워형'));
    html += fld('룸 구조', inputHtml('room_shape', L.room_shape, 'text', '분리형/오픈형'));
    html += fld('주차 대수', inputHtml('parking_spaces', L.parking_spaces, 'number'));
    html += fld('주차비 (월/만원)', inputHtml('parking_fee', L.parking_fee, 'number'));
    html += fld('임대 기간', inputHtml('lease_period', L.lease_period, 'text', '1년/2년/협의'));
    html += fld('상태', selectHtml('status', L.status || '공개', STAT_OPTS));
    html += '</div></section>';

    // --- 2) 가격 ---
    html += '<section class="v297-sec">';
    html += '<div class="v297-sec-h">💰 가격</div>';
    html += '<div class="v297-grid">';
    html += fld('매매가 (만원)', inputHtml('purchase_price', L.purchase_price, 'number'));
    html += fld('보증금 (만원)', inputHtml('deposit', L.deposit, 'number'));
    html += fld('월세 (만원)', inputHtml('rent', L.rent, 'number'));
    html += fld('관리비 (만원)', inputHtml('management_fee', L.management_fee, 'number'));
    html += '</div></section>';

    // --- 3) 주소 · 위치 ---
    html += '<section class="v297-sec">';
    html += '<div class="v297-sec-h">📍 주소 · 위치</div>';
    html += '<div class="v297-grid">';
    html += fld('지번 주소', inputHtml('address', L.address), true);
    html += fld('도로명 주소', inputHtml('road_address', L.road_address), true);
    html += fld('상세 주소', inputHtml('detail_address', L.detail_address));
    html += fld('동', inputHtml('dong', L.dong));
    html += '</div></section>';

    // --- 4) 본문 · 특징 ---
    html += '<section class="v297-sec">';
    html += '<div class="v297-sec-h">📝 본문 · 특징</div>';
    html += '<div class="v297-grid">';
    html += fld('특징 (쉼표로 구분)',
                inputHtml('features', arrToStr(L.features), 'text',
                          '예: 풀옵션, CCTV, 엘리베이터'),
                true, '배열 필드 — 쉼표로 구분해 입력하세요.');
    html += fld('본문 설명 (description)', taHtml('description', L.description, 6), true);
    html += fld('중개사 전용 메모 (special_notes)',
                taHtml('special_notes', L.special_notes, 5), true,
                '🔒 고객에게 노출되지 않는 비공개 메모');
    html += '</div></section>';

    // --- 5) AI 콘텐츠 ---
    html += '<section class="v297-sec">';
    html += '<div class="v297-sec-h">✨ AI 콘텐츠 (생성 후 편집)</div>';
    html += '<div class="v297-grid">';
    html += fld('AI 제목 (ai_title)', inputHtml('ai_title', L.ai_title), true,
                '주소/동/지번/도로명 포함 금지. 트렌드 카피 권장.');
    html += fld('AI 설명 (ai_description)',
                taHtml('ai_description', L.ai_description, 8), true);
    html += fld('SEO 키워드 (쉼표)',
                inputHtml('seo_keywords', arrToStr(L.seo_keywords)), true);
    html += fld('SEO 태그 (쉼표)',
                inputHtml('seo_tags', arrToStr(L.seo_tags)), true);
    html += fld('SEO 메타 설명',
                taHtml('seo_meta_description', L.seo_meta_description, 3), true,
                '검색엔진 노출용 요약 (160자 이내)');
    html += '</div></section>';

    // --- LOCK 안내 ---
    html += '<div class="v297-lock-note">' +
              '🔒 <strong>편집 불가 필드</strong> — 크롤링 원본 본문(raw_fields), ' +
              '원본URL(source_url), 출처 사이트(source_site) 는 무결성 유지를 ' +
              '위해 편집할 수 없습니다.' +
            '</div>';

    return html;
  }

  // ----------------------------------------------------------------------
  // 변경분 추출 & 저장
  // ----------------------------------------------------------------------
  var ARR_FIELDS = { features:1, seo_keywords:1, seo_tags:1 };
  var NUM_FIELDS = { rooms:1, bathrooms:1, area_m2:1, area_supply_m2:1,
                     built_year:1, deposit:1, rent:1, management_fee:1,
                     purchase_price:1, parking_spaces:1, parking_fee:1 };

  function collect(form){
    var raw = {};
    Array.prototype.forEach.call(form.querySelectorAll('[name]'), function(el){
      raw[el.name] = el.value;
    });
    // 타입 변환
    Object.keys(raw).forEach(function(k){
      var v = raw[k];
      if (typeof v === 'string') v = v.trim();
      if (ARR_FIELDS[k]) {
        raw[k] = (v ? String(v).split(',').map(function(s){ return s.trim(); })
                                 .filter(Boolean) : []);
      } else if (NUM_FIELDS[k]) {
        if (v === '' || v == null) raw[k] = null;
        else {
          var n = Number(v);
          raw[k] = isFinite(n) ? n : null;
        }
      } else {
        raw[k] = v === '' ? null : v;
      }
    });
    return raw;
  }

  function diff(before, after){
    var d = {};
    Object.keys(after).forEach(function(k){
      var a = after[k], b = before[k];
      if (Array.isArray(a) || Array.isArray(b)) {
        if (JSON.stringify(a || []) !== JSON.stringify(b || [])) d[k] = a;
      } else {
        // null/undefined/빈문자 동치 처리
        var aN = (a == null || a === '') ? null : a;
        var bN = (b == null || b === '') ? null : b;
        // 숫자 비교 — 서버가 string 으로 줄 수도, number 로 줄 수도
        if (NUM_FIELDS[k]) {
          var aNum = aN == null ? null : Number(aN);
          var bNum = bN == null ? null : Number(bN);
          if (aNum !== bNum) d[k] = aN;
        } else {
          if (String(aN) !== String(bN)) d[k] = aN;
        }
      }
    });
    return d;
  }

  function mergeInto(listing, delta){
    Object.keys(delta).forEach(function(k){
      listing[k] = delta[k];
    });
  }

  function closePanel(overlay){
    try { overlay.remove(); } catch(_){}
    try { document.body.style.overflow = ''; } catch(_){}
  }

  function openPanel(listing){
    if (!listing) return;
    injectCss();

    var overlay = document.createElement('div');
    overlay.className = 'v297-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="v297-panel" role="form">' +
        '<div class="v297-hd">' +
          '<div class="v297-hd-t">✏️ 매물 수정 · ID ' + esc(listing.id || '-') + '</div>' +
          '<button type="button" class="v297-hd-close" aria-label="닫기">×</button>' +
        '</div>' +
        '<form class="v297-body"></form>' +
        '<div class="v297-ft">' +
          '<button type="button" class="v297-btn v297-btn-cancel">취소</button>' +
          '<button type="button" class="v297-btn v297-btn-save">💾 저장</button>' +
        '</div>' +
      '</div>';

    var panel = overlay.querySelector('.v297-panel');
    var form  = overlay.querySelector('.v297-body');
    var btnC  = overlay.querySelector('.v297-hd-close');
    var btnX  = overlay.querySelector('.v297-btn-cancel');
    var btnS  = overlay.querySelector('.v297-btn-save');

    form.innerHTML = buildPanel(listing);

    var snapshot = {};
    Array.prototype.forEach.call(form.querySelectorAll('[name]'), function(el){
      snapshot[el.name] = el.value;
    });

    function attemptClose(){
      var dirty = false;
      Array.prototype.forEach.call(form.querySelectorAll('[name]'), function(el){
        if (snapshot[el.name] !== el.value) dirty = true;
      });
      if (dirty && !confirm('변경사항이 있습니다. 저장하지 않고 닫을까요?')) return;
      closePanel(overlay);
      document.removeEventListener('keydown', onKey, true);
    }

    function onKey(e){
      if (e.key === 'Escape') { e.stopPropagation(); attemptClose(); }
    }

    btnC.addEventListener('click', attemptClose);
    btnX.addEventListener('click', attemptClose);
    overlay.addEventListener('click', function(e){
      if (e.target === overlay) attemptClose();
    });
    document.addEventListener('keydown', onKey, true);

    btnS.addEventListener('click', function(){
      save();
    });

    function save(){
      var token = getToken();
      if (!token) {
        toast('로그인이 필요합니다. 다시 로그인 후 시도하세요.', 'err');
        return;
      }

      var after  = collect(form);
      var delta  = diff(listing, after);
      var keys   = Object.keys(delta);

      if (keys.length === 0) {
        toast('변경된 내용이 없습니다.', 'info');
        return;
      }

      btnS.disabled = true;
      btnS.textContent = '저장 중…';

      var payload = { id: listing.id };
      keys.forEach(function(k){ payload[k] = delta[k]; });

      fetch('/api/admin/listings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
        .then(function(r){
          return r.json().then(function(j){
            return { ok: r.ok, status: r.status, body: j };
          });
        })
        .then(function(res){
          if (!res.ok || !res.body || res.body.success === false) {
            var msg = (res.body && (res.body.error || res.body.message)) ||
                      ('저장 실패 (HTTP ' + res.status + ')');
            toast(msg, 'err');
            btnS.disabled = false;
            btnS.textContent = '💾 저장';
            return;
          }
          // 서버 응답에 data 가 있으면 그것으로, 없으면 delta 로 merge
          var merged = (res.body && res.body.data) ? res.body.data : delta;
          mergeInto(listing, merged);
          // hydrate 플래그는 유지 (v295)
          toast('저장 완료 · 재렌더 중…', 'ok');
          closePanel(overlay);
          document.removeEventListener('keydown', onKey, true);
          // 모달이 여전히 이 매물이라면 재렌더
          try {
            if (window.WS && typeof window.WS.showDetail === 'function') {
              window.WS.showDetail(listing);
            }
          } catch(e) { console.warn(TAG + ' re-render fail', e); }
        })
        .catch(function(err){
          toast('네트워크 오류: ' + (err && err.message || err), 'err');
          btnS.disabled = false;
          btnS.textContent = '💾 저장';
        });
    }

    document.body.appendChild(overlay);
    try { document.body.style.overflow = 'hidden'; } catch(_){}

    // 첫 입력에 포커스
    var firstInp = form.querySelector('input,select,textarea');
    if (firstInp) { try { firstInp.focus(); } catch(_){} }
  }

  // ----------------------------------------------------------------------
  // 헤더 버튼 삽입
  // ----------------------------------------------------------------------
  function wireButton(listing){
    try {
      var hero = document.querySelector('.v240-hero');
      if (!hero) return;
      if (hero.querySelector('.v297-edit-btn')) return;
      var priceBox = hero.querySelector('.v240-price-box');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'v297-edit-btn';
      btn.textContent = '✏️ 매물 수정';
      btn.setAttribute('data-v297-btn', '1');
      btn.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        openPanel(listing);
      });
      // priceBox 앞에 배치 (우측 정렬 영역의 왼쪽). priceBox 없으면 hero 끝에 붙임.
      if (priceBox && priceBox.parentNode === hero) {
        hero.insertBefore(btn, priceBox);
      } else {
        hero.appendChild(btn);
      }
    } catch(e) {
      try { console.warn(TAG + ' wireButton failed', e); } catch(_){}
    }
  }

  function install(){
    if (!window.WS || typeof window.WS.showDetail !== 'function') return false;
    if (window.WS.__v297EditApplied) return true;

    var prev = window.WS.showDetail;
    window.WS.__v297_prevShowDetail = prev;
    window.WS.showDetail = function(listing){
      try { prev.call(this, listing); }
      catch(e) { console.error(TAG + ' prev showDetail threw', e); throw e; }
      try { wireButton(listing); }
      catch(e) { console.warn(TAG + ' wire failed', e); }
    };

    window.WS.__v297EditApplied = true;
    window.WS.__v297Version = VERSION;
    try { console.log(TAG + ' edit panel installed'); } catch(_){}
    return true;
  }

  function tryInstall(){
    tries++;
    if (install()) return;
    if (tries >= MAX_TRIES) return;
    setTimeout(tryInstall, POLL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInstall, { once: true });
  } else {
    tryInstall();
  }
})();
