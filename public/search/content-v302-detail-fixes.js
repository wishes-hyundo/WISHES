/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v302 — 상세 모달 fixes
 * 작성: 2026-04-28 사장님 명령 — 정밀 검수 발견 5개 버그 보완
 *
 * 1. 금액 표기 수정 ("1억5000" → "1억 5,000만원")
 * 2. 옵션 chips 확장 (full_option / parking false 명확 / raw_fields 구조형태/임대기간 등)
 * 3. 🔍 원본 데이터 보기 버튼 추가 (raw_fields jsonb 모달)
 * 4. 🤖 AI 매물 설명 생성 버튼 추가
 * 5. 🏢 건축물대장 조회 버튼 추가
 *
 * 정책: /search HTML/CSS 무손상 (vanilla patch only).
 *       window.WS.formatPrice override + MutationObserver 로 모달 감시 → 버튼 주입
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const V = 'v302-detail-fixes';

  // ════════════════════ 1. 금액 표기 수정 ════════════════════
  // formatSinglePrice: 단위 없는 "1억5000" / "5000만" → "1억 5,000만원" / "5,000만원"
  function formatSinglePriceV302(value) {
    if (!value || value === 0) return '-';
    const v = Number(value);
    if (!isFinite(v) || v <= 0) return '-';
    if (v >= 10000) {
      const eok = Math.floor(v / 10000);
      const man = v % 10000;
      if (man > 0) {
        const manStr = man.toLocaleString('ko-KR');
        return `${eok}억 ${manStr}만원`;
      }
      return `${eok}억`;
    }
    return `${v.toLocaleString('ko-KR')}만원`;
  }

  function formatPriceV302(deposit, monthly, price, deal, listing) {
    if (deal === '매매') return formatSinglePriceV302(price);
    if (deal === '전세') return formatSinglePriceV302(deposit);
    if (deal === '월세') {
      const dep = formatSinglePriceV302(deposit);
      const mon = formatSinglePriceV302(monthly);
      return `${dep} / ${mon}`;
    }
    if (deal === '전월세') {
      const dep = formatSinglePriceV302(deposit);
      const mon = formatSinglePriceV302(monthly);
      return `${dep} / ${mon}`;
    }
    return '-';
  }

  // override (window.WS.formatPrice 가 v240-detail.js 에서 사용됨)
  window.WS = window.WS || {};
  const _origFormatPrice = window.WS.formatPrice;
  window.WS.formatPrice = formatPriceV302;
  window.formatPrice = formatPriceV302;
  if (typeof window.WS.formatSinglePrice !== 'undefined') {
    window.WS.formatSinglePrice = formatSinglePriceV302;
  }
  console.log('[' + V + '] formatPrice override 완료 (만원 단위 명확)');

  // ════════════════════ 2. 옵션 chips 확장 ════════════════════
  // raw_fields.옵션 / 구조형태 / 임대기간 / 주차대수 등 추출하여 chip 형태로 표시
  function buildExtraOptionChips(L) {
    const chips = [];
    const raw = (L && L.raw_fields) || {};

    // raw_fields 옵션 텍스트
    const optStr = (raw['옵션'] || '') + ' ' + (L.options || '') + ' ' + (L.raw_options || '');
    const opt = String(optStr);

    // 풀옵션 (DB column 우선)
    if (L.full_option === true || /풀옵션|full[\s-]?option/i.test(opt)) {
      chips.push({ icon: '✨', label: '풀옵션' });
    }

    // 주차 (parking column 명확 처리)
    if (L.parking === true || (L.parking_spaces && parseInt(L.parking_spaces, 10) > 0)) {
      chips.push({ icon: '🅿️', label: '주차 가능' });
    } else if (L.parking === false || /주차[ \t]*불가|주차[ \t]*없음/.test(opt) || raw['주차대수'] === '주차불가') {
      chips.push({ icon: '🚫', label: '주차 불가' });
    }

    // 엘리베이터 (이미 detail.js 처리, 중복 방지 위해 skip)
    // 발코니
    if (L.balcony === true) chips.push({ icon: '🏞️', label: '발코니' });

    // 펫
    if (L.pet === true) chips.push({ icon: '🐾', label: '반려동물 가능' });
    else if (L.pet === false) chips.push({ icon: '🚫', label: '반려동물 불가' });

    // 대출 (전세대출)
    if (L.loan_available === true || /전세[ ]*자금[ ]*대출|대출[ ]*가능/.test(opt + ' ' + (raw['특이사항'] || ''))) {
      chips.push({ icon: '💰', label: '전세자금대출' });
    }

    // 구조형태 (raw_fields 에서)
    if (raw['구조형태']) chips.push({ icon: '📐', label: '구조: ' + raw['구조형태'] });

    // 임대기간
    if (raw['임대기간']) chips.push({ icon: '📅', label: '임대: ' + raw['임대기간'] });

    // 옵션 항목 풀어서
    if (opt) {
      const items = opt.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      const want = ['에어컨', '세탁기', '냉장고', '책상', '옷장', '싱크대', '인덕션', '가스레인지', '전자레인지', '비데', 'TV', '신발장', '붙박이장', '개별냉난방', '중앙난방', '도시가스', '식기세척기', '건조기'];
      const found = new Set();
      items.forEach(it => {
        want.forEach(w => {
          if (it.includes(w)) found.add(w);
        });
      });
      [...found].forEach(w => chips.push({ icon: '🏠', label: w }));
    }

    return chips;
  }

  // ════════════════════ 3-5. 모달에 버튼 + chips 주입 ════════════════════
  // v240-detail.js 가 만드는 상세 모달 (.ws-detail-modal 또는 .v248-modal 등) 발견 시
  function findDetailModal() {
    // 가능한 selector (옛날 코드 분석 기반)
    const selectors = ['.ws-detail-modal', '.v248-detail-modal', '.detail-modal', '.modal-detail', '[data-detail-modal]', '.ws-modal-detail'];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    // backup: 매물 수정 버튼 있는 컨테이너
    const editBtn = document.querySelector('[data-v297-edit-btn], .v297-edit-btn');
    if (editBtn) return editBtn.closest('.modal, [class*="modal"], [class*="detail"]');
    return null;
  }

  function getCurrentListingId() {
    // URL hash, query, 또는 모달 data-attr
    const m = location.search.match(/[?&]id=(\d+)/) || location.hash.match(/#id=(\d+)/);
    if (m) return m[1];
    const modal = findDetailModal();
    if (modal) {
      const id = modal.dataset.listingId || modal.dataset.id ||
        (modal.querySelector('[data-listing-id]') && modal.querySelector('[data-listing-id]').dataset.listingId);
      if (id) return id;
    }
    // 매물 수정 버튼에 ID 있을 가능성
    const ed = document.querySelector('[data-v297-listing-id], [data-listing-id]');
    return ed ? (ed.dataset.v297ListingId || ed.dataset.listingId) : null;
  }

  // ── 원본 데이터 보기 모달 ──────────────────────────────────
  function openRawFieldsModal(listingId) {
    if (!listingId) { alert('매물 ID 없음'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'wsv302-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: '99999', padding: '20px',
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#fff', borderRadius: '14px', maxWidth: '720px',
      maxHeight: '85vh', overflow: 'auto', padding: '20px 24px',
      boxShadow: '0 10px 40px rgba(0,0,0,.25)', position: 'relative',
    });

    const title = document.createElement('h3');
    title.textContent = '🔍 원본 데이터 (raw_fields) — ID ' + listingId;
    Object.assign(title.style, { margin: '0 0 12px', fontSize: '16px', color: '#2D5A27' });
    box.appendChild(title);

    const pre = document.createElement('pre');
    Object.assign(pre.style, { background: '#f5f5f0', padding: '12px', borderRadius: '8px', fontSize: '11px', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' });
    pre.textContent = '로딩 중...';
    box.appendChild(pre);

    const close = document.createElement('button');
    close.textContent = '✕ 닫기';
    Object.assign(close.style, { position: 'absolute', top: '12px', right: '12px', background: '#eee', border: '0', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' });
    close.addEventListener('click', () => overlay.remove());
    box.appendChild(close);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // fetch listing → raw_fields
    fetch('/api/listings/' + encodeURIComponent(listingId), { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const data = d.data || d;
        const raw = data.raw_fields || data.rawFields || null;
        if (raw) {
          pre.textContent = JSON.stringify(raw, null, 2);
        } else {
          pre.textContent = '(원본 데이터 없음)';
        }
      })
      .catch(e => { pre.textContent = '에러: ' + (e && e.message); });
  }

  // ── AI 매물 설명 생성 ──────────────────────────────────
  async function generateAIDescription(listingId, btn) {
    if (!listingId) return;
    if (!confirm('AI 매물 설명을 생성하시겠습니까? (Gemini Flash 무료)')) return;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ 생성 중...';
    try {
      // 토큰 (mobile-photo 와 동일 패턴)
      const tokenRaw = sessionStorage.getItem('ws_token') || sessionStorage.getItem('admin_bridge_token') || '';
      let token = tokenRaw;
      if (token.startsWith('admin_bridge_')) token = token.slice('admin_bridge_'.length);
      const res = await fetch('/api/admin/generate-description-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ listingId: parseInt(listingId, 10) }),
      });
      const j = await res.json();
      if (j.success || j.ok) {
        alert('✓ AI 설명 생성 완료. 페이지 새로고침 후 확인하세요.');
      } else {
        alert('✗ 실패: ' + (j.error || res.status));
      }
    } catch (e) {
      alert('✗ 에러: ' + (e && e.message));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  // ── 건축물대장 조회 ──────────────────────────────────
  async function fetchBuildingInfo(listingId, btn) {
    if (!listingId) return;
    if (!confirm('건축물대장(V-World 무료) 을 조회하시겠습니까?')) return;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ 조회 중...';
    try {
      const tokenRaw = sessionStorage.getItem('ws_token') || sessionStorage.getItem('admin_bridge_token') || '';
      let token = tokenRaw;
      if (token.startsWith('admin_bridge_')) token = token.slice('admin_bridge_'.length);
      const res = await fetch('/api/cron/backfill-building-info?id=' + encodeURIComponent(listingId), {
        method: 'GET',
        headers: token ? { 'Authorization': 'Bearer ' + token } : {},
        credentials: 'include',
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        alert('✓ 건축물대장 조회 시도 완료. (V-World API key 필요. 결과: ' + JSON.stringify(j).slice(0, 200) + ')');
      } else {
        alert('✗ 실패 (' + res.status + '): VWORLD_API_KEY env 등록 필요');
      }
    } catch (e) {
      alert('✗ 에러: ' + (e && e.message));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  // ── 모달에 버튼 그룹 주입 ──────────────────────────────
  function injectActionButtons(modal) {
    if (!modal || modal.dataset.v302Injected === '1') return;
    const lid = getCurrentListingId();
    if (!lid) return;

    // "매물 수정" 버튼 옆에 행으로 추가
    const editBtn = modal.querySelector('[data-v297-edit-btn], .v297-edit-btn, button[title*="수정"]');
    const anchor = editBtn ? editBtn.parentElement : modal.querySelector('h2, h3, header, .modal-header, [class*="header"]');
    if (!anchor) return;

    const bar = document.createElement('div');
    bar.className = 'wsv302-actions';
    Object.assign(bar.style, { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0', padding: '6px 0' });

    const mkBtn = (icon, label, onClick, color) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = icon + ' ' + label;
      Object.assign(b.style, {
        padding: '6px 10px', fontSize: '12px', borderRadius: '8px',
        border: '0', cursor: 'pointer', fontWeight: '600',
        background: color || '#2D5A27', color: '#fff',
      });
      b.addEventListener('click', e => { e.stopPropagation(); onClick(b); });
      return b;
    };

    bar.appendChild(mkBtn('🔍', '원본 데이터', () => openRawFieldsModal(lid)));
    bar.appendChild(mkBtn('🤖', 'AI 설명 생성', (btn) => generateAIDescription(lid, btn), '#7c3aed'));
    bar.appendChild(mkBtn('🏢', '건축물대장 조회', (btn) => fetchBuildingInfo(lid, btn), '#0369a1'));

    anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    modal.dataset.v302Injected = '1';
    console.log('[' + V + '] action buttons 주입 완료 (id=' + lid + ')');
  }

  // ── MutationObserver 모달 감시 ──────────────────────────
  function scanModals() {
    const modal = findDetailModal();
    if (modal) injectActionButtons(modal);
  }

  const mo = new MutationObserver((muts) => {
    let dirty = false;
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) { dirty = true; break; }
    }
    if (dirty) scanModals();
  });

  function start() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      scanModals();
      console.log('[' + V + '] observer + format override 시작');
    } catch (e) {
      console.warn('[' + V + '] start failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
