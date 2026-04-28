/* ════════════════════════════════════════════════════════════════════════════
 * /search content-v301 — 위시스 매물 뱃지 자동 추가 (저작권 안전)
 * 작성: 2026-04-28 사장님 명령 — 위시스 직접 촬영/편집 사진 있는 매물 차별화 노출
 *
 * 정책:
 *   - 매물에 위시스 사진/영상 ≥1장 (has_wishes_media=true) → "🌟 위시스 직접" 뱃지
 *   - /api/listings 응답에 이미 has_wishes_media 포함 (DB 트리거 자동 갱신)
 *   - /search HTML/CSS 손대지 않고 vanilla JS 만으로 뱃지 추가
 *
 * 기술:
 *   - window.fetch 인터셉트 → /api/listings 응답 캡처 → ID→has_wishes_media 매핑
 *   - MutationObserver → 매물 카드 DOM 발견 시 자동 뱃지 추가
 *   - data-wishes-curated="true" attribute (CSS 셀렉터 향후 확장 가능)
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── ID → { has_wishes_media, wishes_photo_count, wishes_video_count } 매핑 ──
  const wishesMap = new Map();

  // ── fetch 인터셉트 ────────────────────────────────────────────────
  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const res = await origFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      // 매물 목록 / 단건 / 검색 모두 캐치
      if (url && /\/api\/(listings|search)/.test(url) && res.ok) {
        const cloned = res.clone();
        cloned.json().then((j) => {
          const items = (j && (j.items || j.data || j.listings)) || [];
          const arr = Array.isArray(items) ? items : (Array.isArray(j) ? j : []);
          arr.forEach((it) => {
            if (it && it.id != null) {
              wishesMap.set(String(it.id), {
                hasWishes: !!it.has_wishes_media,
                photoCnt: it.wishes_photo_count || 0,
                videoCnt: it.wishes_video_count || 0,
              });
            }
          });
          // 새 데이터 받은 후 즉시 뱃지 갱신
          scanAndDecorate();
        }).catch(() => {});
      }
    } catch (_) {}
    return res;
  };

  // ── 뱃지 DOM 생성 ─────────────────────────────────────────────────
  function makeBadge(info) {
    const b = document.createElement('div');
    b.className = 'wishes-curated-badge';
    b.setAttribute('aria-label', '위시스 직접 촬영/편집 매물');
    b.dataset.wishesCurated = 'true';
    const icon = document.createElement('span');
    icon.textContent = '🌟';
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = 'margin-right:3px;';
    b.appendChild(icon);
    const txt = document.createElement('span');
    txt.textContent = '위시스 직접';
    b.appendChild(txt);
    if (info && (info.photoCnt > 0 || info.videoCnt > 0)) {
      const cnt = document.createElement('span');
      cnt.style.cssText = 'margin-left:4px;opacity:.85;';
      cnt.textContent = '(' +
        (info.photoCnt > 0 ? info.photoCnt + '📷' : '') +
        (info.photoCnt > 0 && info.videoCnt > 0 ? ' ' : '') +
        (info.videoCnt > 0 ? info.videoCnt + '🎬' : '') +
        ')';
      b.appendChild(cnt);
    }
    Object.assign(b.style, {
      position: 'absolute', top: '6px', left: '6px', zIndex: '5',
      background: 'linear-gradient(135deg,#2D5A27 0%,#4a7c2e 100%)',
      color: '#fff', fontSize: '10px', fontWeight: '700',
      padding: '3px 8px', borderRadius: '10px',
      boxShadow: '0 2px 6px rgba(45,90,39,.35)',
      pointerEvents: 'none', userSelect: 'none',
      letterSpacing: '0.2px',
    });
    return b;
  }

  // ── 카드 DOM 에 뱃지 부착 (idempotent) ────────────────────────────
  function decorateCard(card) {
    if (!card || card.dataset.wishesCuratedDecorated === '1') return;
    // 매물 ID 추출 시도 (다양한 셀렉터)
    const id =
      card.dataset.id || card.dataset.listingId ||
      (card.querySelector('[data-id]') && card.querySelector('[data-id]').dataset.id) ||
      (card.querySelector('[data-listing-id]') && card.querySelector('[data-listing-id]').dataset.listingId) ||
      '';
    if (!id) return;
    const info = wishesMap.get(String(id));
    if (!info || !info.hasWishes) return;
    // 기존 position 보존
    const cs = window.getComputedStyle(card);
    if (cs.position === 'static') card.style.position = 'relative';
    card.appendChild(makeBadge(info));
    card.dataset.wishesCuratedDecorated = '1';
    card.dataset.wishesCurated = 'true';
  }

  // ── 카드 셀렉터 (옛 /search content.js 의 카드 클래스 후보) ──────
  const CARD_SELECTORS = [
    '.listing-card', '.list-item', '.search-result-item', '.property-card',
    '[data-listing-id]', '[data-id][data-type="listing"]',
  ].join(',');

  function scanAndDecorate() {
    try {
      const cards = document.querySelectorAll(CARD_SELECTORS);
      cards.forEach(decorateCard);
    } catch (_) {}
  }

  // ── MutationObserver 로 동적 카드 감시 ────────────────────────────
  const mo = new MutationObserver((mutations) => {
    let dirty = false;
    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
        dirty = true; break;
      }
    }
    if (dirty) scanAndDecorate();
  });

  function start() {
    try {
      mo.observe(document.body, { childList: true, subtree: true });
      scanAndDecorate();
      console.log('[wishes-curated v301] badge observer 시작');
    } catch (e) {
      console.warn('[wishes-curated v301] start failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
