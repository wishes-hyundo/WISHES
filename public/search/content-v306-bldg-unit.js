/**
 * /search content-v306 — 건축물대장 전유부 + Layer 5/6/8 통합
 * 작성: 2026-04-28, 업데이트: 2026-04-29
 *
 * Layer 4: selected_unit + 같은 건물 호실 표시 (기본)
 * Layer 5: 위반건축물 등재 경고 (vlitnYn)
 * Layer 6: RTMS 최근 실거래가 비교 (?withRtms=1 자동 추가)
 * Layer 8: 같은 주소의 다른 활성 매물 cross-link
 *
 * 정책: HTML/CSS 무손상 (vanilla patch). v240/v294 fetch wrap 위에 추가.
 */
(function () {
  'use strict';
  const V = 'v306-bldg-unit';

  // ────────── 마지막으로 열린 매물 ID 추적 ──────────
  let _currentLid = '';
  function captureLidFromDom() {
    try {
      const lblEl = document.querySelector('[data-listing-id]');
      if (lblEl) {
        const lid = lblEl.getAttribute('data-listing-id');
        if (lid && /^\d+$/.test(lid)) { _currentLid = lid; return; }
      }
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const t = el.textContent || '';
        const m = t.match(/매물번호\s*(\d+)/);
        if (m) { _currentLid = m[1]; return; }
      }
    } catch (_) {}
  }

  // ────────── window.fetch intercept (v294 wrap 위에 추가) ──────────
  const _origFetch = window.fetch;
  const RE_BLDG_FULL = /\/api\/admin\/building-registry-full(?:\?|$)/;

  window.fetch = function (input, init) {
    try {
      let url = typeof input === 'string' ? input : (input && input.url) || '';
      if (RE_BLDG_FULL.test(url) && _currentLid) {
        let urlChanged = false;
        if (url.indexOf('lid=') < 0 && url.indexOf('listing_id=') < 0) {
          const sep = url.indexOf('?') >= 0 ? '&' : '?';
          url += sep + 'lid=' + encodeURIComponent(_currentLid);
          urlChanged = true;
        }
        // L-Layer6: RTMS 자동 활성화
        if (url.indexOf('withRtms=') < 0) {
          const sep2 = url.indexOf('?') >= 0 ? '&' : '?';
          url += sep2 + 'withRtms=1';
          urlChanged = true;
        }
        if (urlChanged) {
          if (typeof input === 'string') {
            input = url;
          } else if (input && input.url) {
            try { input = new Request(url, input); } catch (_) {}
          }
        }

        return _origFetch.call(this, input, init).then(async function (res) {
          try {
            const cloned = res.clone();
            const body = await cloned.json();
            if (body && body.success) {
              setTimeout(function () { renderUnitSection(body); }, 100);
            }
          } catch (_) {}
          return res;
        });
      }
    } catch (_) {}
    return _origFetch.call(this, input, init);
  };

  function renderUnitSection(payload) {
    try {
      const body = document.getElementById('v245-bldg-body');
      if (!body) return;
      if (body.querySelector('.v306-unit-section')) return;

      const sel = payload.selected_unit;
      const units = Array.isArray(payload.units) ? payload.units : [];
      const reqHo = (payload.query && payload.query.requestedHo) || '';
      const data = payload.data || {};

      const root = document.createElement('div');
      root.className = 'v306-unit-section';
      root.style.cssText = 'margin-top:16px;border-top:1px solid #e5e5e5;padding-top:14px';

      let html = '';

      // ───── 전유부 (selected_unit) ─────
      if (sel) {
        html += '<div style="font-weight:700;font-size:14px;color:#2D5A27;margin-bottom:10px">' +
                '📐 ' + escHtml(sel.dongNm ? sel.dongNm + ' ' : '') + escHtml(sel.hoNm) + '호 전유부</div>';
        const r = [
          ['전용면적', sel.exclusiveArea ? sel.exclusiveArea.toFixed(2) + ' m²' : '-'],
          ['공용면적', sel.commonArea ? sel.commonArea.toFixed(2) + ' m²' : '-'],
          ['총면적', sel.totalArea ? sel.totalArea.toFixed(2) + ' m²' : '-'],
          ['층', sel.flrNoNm || (sel.flrNo + '층') || '-'],
          ['주용도', sel.mainPurpsCdNm || sel.etcPurps || '-'],
          ['구조', sel.strctCdNm || '-'],
        ];
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;font-size:12px;background:#f4f9f1;padding:10px;border-radius:6px">';
        for (const x of r) {
          html += '<div><span style="color:#888">' + escHtml(x[0]) + '</span> ' +
                  '<span style="font-weight:600;color:#222;margin-left:6px">' + escHtml(x[1]) + '</span></div>';
        }
        html += '</div>';
      } else if (reqHo) {
        html += '<div style="color:#a04;font-size:12px;background:#fff5f0;padding:8px;border-radius:6px">' +
                '⚠️ 매물 호실 (' + escHtml(reqHo) + '호) 의 전유부를 찾을 수 없습니다.</div>';
      } else {
        html += '<div style="color:#888;font-size:12px;background:#f5f5f5;padding:8px;border-radius:6px">' +
                'ℹ️ 매물에 호실 정보가 없습니다.</div>';
      }

      // ───── 같은 건물 호실 (units) ─────
      if (units.length > 1) {
        html += '<div style="font-weight:700;font-size:13px;color:#2D5A27;margin:14px 0 8px">' +
                '🏠 같은 건물 호실 (' + units.length + '개)</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;max-height:200px;overflow:auto">';
        for (const u of units.slice(0, 50)) {
          const isSel = sel && u.dongNm === sel.dongNm && u.hoNm === sel.hoNm;
          html += '<div style="padding:6px 8px;font-size:11px;border:1px solid ' +
                  (isSel ? '#2D5A27' : '#e5e5e5') + ';' +
                  'background:' + (isSel ? '#e8f5e3' : '#fff') + ';border-radius:4px">' +
                  '<div style="font-weight:600">' + escHtml(u.dongNm ? u.dongNm + ' ' : '') + escHtml(u.hoNm) + '호</div>' +
                  '<div style="color:#666">' + (u.exclusiveArea ? u.exclusiveArea.toFixed(1) : '-') + 'm²' +
                  (u.flrNoNm ? ' · ' + escHtml(u.flrNoNm) : '') + '</div>' +
                  '</div>';
        }
        html += '</div>';
      }

      // ───── L-Layer5: 위반건축물 경고 ─────
      if (data.illegalBuilding === 'Y' || data.illegalBuilding === 'y') {
        html += '<div style="margin-top:14px;background:#fff0f0;border:2px solid #d04040;border-radius:8px;padding:12px">' +
                '<div style="font-weight:700;color:#d04040;font-size:13px;margin-bottom:6px">🚨 위반건축물 — 등재됨</div>' +
                '<div style="font-size:11px;color:#666;line-height:1.6">' +
                (data.illegalBuildingDate ? '등재일: ' + escHtml(data.illegalBuildingDate) + '<br>' : '') +
                (data.illegalLawName ? '법령: ' + escHtml(data.illegalLawName) + '<br>' : '') +
                (data.illegalLawArticle ? '조항: ' + escHtml(data.illegalLawArticle) : '') +
                '</div></div>';
      }

      // ───── L-Layer8: 같은 주소 다른 매물 ─────
      const sameBuilding = Array.isArray(payload.same_building) ? payload.same_building : [];
      if (sameBuilding.length > 0) {
        html += '<div style="margin-top:14px;border-top:1px dashed #d0e0c8;padding-top:10px">' +
                '<div style="font-weight:700;font-size:13px;color:#2D5A27;margin-bottom:8px">' +
                '🏘️ 같은 건물 다른 매물 (' + sameBuilding.length + '건)</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto">';
        for (const m of sameBuilding) {
          const dealLabel = m.deal_type === 'sale' ? '매매' : (m.deal_type === 'rent' ? '월세' : '전세');
          const priceTxt = m.deal_type === 'sale'
            ? formatKrw(m.price)
            : (formatKrw(m.deposit) + (m.monthly_rent ? ' / ' + formatKrw(m.monthly_rent) : ''));
          html += '<a href="/search?lid=' + encodeURIComponent(m.id) + '" target="_blank" rel="noopener" ' +
                  'style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid #e0e7d8;border-radius:6px;text-decoration:none;color:inherit;background:#fafefa">' +
                  '<div>' +
                    '<div style="font-size:11px;color:#888">매물 #' + escHtml(m.listing_id || m.id) + '</div>' +
                    '<div style="font-weight:600;font-size:12px;color:#2D5A27">' +
                      escHtml(dealLabel) + ' ' + (m.building_dong ? escHtml(m.building_dong) + ' ' : '') +
                      (m.building_ho ? escHtml(m.building_ho) + '호 · ' : '') +
                      (m.area_m2 ? Number(m.area_m2).toFixed(1) + 'm² · ' : '') +
                      (m.floor_current != null ? escHtml(m.floor_current) + '층' : '') +
                    '</div>' +
                  '</div>' +
                  '<div style="font-weight:700;font-size:13px;color:#2D5A27">' + priceTxt + '</div>' +
                  '</a>';
        }
        html += '</div></div>';
      }

      // ───── L-Layer6: RTMS 실거래가 ─────
      const rtms = payload.rtms;
      if (rtms && rtms.totalCount > 0 && rtms.stats) {
        const unit = rtms.stats.unit === 'krw_10k' ? '만원' : '만원';
        html += '<div style="margin-top:14px;border-top:1px dashed #d0e0c8;padding-top:10px">' +
                '<div style="font-weight:700;font-size:13px;color:#2D5A27;margin-bottom:8px">' +
                '💹 RTMS 최근 실거래 (' + escHtml(rtms.dealType === 'sale' ? '매매' : '전월세') +
                ' · ' + rtms.totalCount + '건 · 최근 3개월)</div>' +
                '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:11px">' +
                statBox('중간값', rtms.stats.median, unit) +
                statBox('평균', rtms.stats.avg, unit) +
                statBox('최저', rtms.stats.min, unit) +
                statBox('최고', rtms.stats.max, unit) +
                '</div>';
        if (Array.isArray(rtms.recent) && rtms.recent.length > 0) {
          html += '<div style="margin-top:8px;font-size:11px;color:#666">최근 거래:</div>' +
                  '<div style="display:flex;flex-direction:column;gap:3px;font-size:11px;margin-top:4px">';
          for (const t of rtms.recent.slice(0, 5)) {
            const date = (t.dealYear && t.dealMonth) ? t.dealYear + '.' + String(t.dealMonth).padStart(2, '0') : '-';
            const amt = rtms.dealType === 'sale' ? t.dealAmount : t.deposit;
            html += '<div style="display:flex;justify-content:space-between;padding:3px 6px;background:#f7faf5;border-radius:4px">' +
                    '<span>' + escHtml(date) +
                    (t.exclusiveArea ? ' · ' + Number(t.exclusiveArea).toFixed(1) + 'm²' : '') +
                    (t.floor ? ' · ' + escHtml(t.floor) + '층' : '') + '</span>' +
                    '<span style="font-weight:600">' + (amt ? Number(amt).toLocaleString() + '만' : '-') + '</span>' +
                    '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }

      // 캐시 표시
      if (payload.cache && payload.cache !== 'none') {
        html += '<div style="margin-top:8px;font-size:10px;color:#aaa;text-align:right">cache: ' +
                escHtml(payload.cache) + '</div>';
      }

      root.innerHTML = html;
      body.appendChild(root);
    } catch (e) {
      console.warn('[' + V + '] render error', e);
    }
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatKrw(v) {
    if (v == null || v === '') return '-';
    const n = Number(v);
    if (!isFinite(n) || n === 0) return '-';
    if (n >= 10000) {
      const eok = Math.floor(n / 10000);
      const man = n % 10000;
      return eok + '억' + (man ? ' ' + man.toLocaleString() : '');
    }
    return n.toLocaleString() + '만';
  }
  function statBox(label, val, unit) {
    return '<div style="background:#f4f9f1;padding:6px 8px;border-radius:5px;text-align:center">' +
           '<div style="color:#888;font-size:10px">' + escHtml(label) + '</div>' +
           '<div style="font-weight:700;color:#2D5A27;font-size:12px">' +
           (val != null && isFinite(val) ? Number(val).toLocaleString() + (unit ? ' ' + escHtml(unit) : '') : '-') +
           '</div></div>';
  }

  // ────────── DOM 변화 감지 ──────────
  try {
    const obs = new MutationObserver(function () {
      if (document.querySelector('.v240-ai-modal')) {
        captureLidFromDom();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  console.log('[' + V + '] 건축물대장 전유부 + Layer5/6/8 통합 활성');
})();
