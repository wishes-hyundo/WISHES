/**
 * /search content-v306 — 건축물대장 전유부 (호실) 정보 표시
 * 작성: 2026-04-28
 *
 * v240-detail.js 의 v243OpenBldgRegister 가 표제부만 표시 → 사장님 매물의
 * 실제 호실 (전유부) 정보가 안 보였음. v306 가:
 *   1. 건축물대장 모달이 열릴 때 listing.id 를 query 에 자동 첨부
 *   2. 응답에 selected_unit / units 있으면 모달 body 에 새 섹션 inject
 *      - 📐 [202호] 전유부: 전용면적 / 공용면적 / 주용도 / 층
 *      - 🏠 같은 동 다른 호실 (top 10): 호실 번호 + 면적 그리드
 *
 * 정책: HTML/CSS 무손상 (vanilla patch). v240/v294 의 fetch wrap 위에 추가.
 */
(function () {
  'use strict';
  const V = 'v306-bldg-unit';

  // ────────── 마지막으로 열린 매물 ID 추적 ──────────
  // detail 모달이 열릴 때 listing.id 를 캐시 → building-registry fetch 시 자동 첨부
  let _currentLid = '';
  function captureLidFromDom() {
    try {
      // content.js 의 "매물번호 58099" 같은 텍스트 또는 v240 의 data-listing-id
      const lblEl = document.querySelector('[data-listing-id]');
      if (lblEl) {
        const lid = lblEl.getAttribute('data-listing-id');
        if (lid && /^\d+$/.test(lid)) { _currentLid = lid; return; }
      }
      // 매물번호 58099 패턴
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const t = el.textContent || '';
        const m = t.match(/매물번호\s*(\d+)/);
        if (m) { _currentLid = m[1]; return; }
      }
    } catch (_) {}
  }

  // ────────── window.fetch intercept (v294 의 wrap 위에 추가) ──────────
  const _origFetch = window.fetch;
  const RE_BLDG_FULL = /\/api\/admin\/building-registry-full(?:\?|$)/;

  window.fetch = function (input, init) {
    try {
      let url = typeof input === 'string' ? input : (input && input.url) || '';
      if (RE_BLDG_FULL.test(url) && _currentLid) {
        // lid 자동 첨부 (이미 있으면 skip)
        if (url.indexOf('lid=') < 0 && url.indexOf('listing_id=') < 0) {
          const sep = url.indexOf('?') >= 0 ? '&' : '?';
          url += sep + 'lid=' + encodeURIComponent(_currentLid);
          if (typeof input === 'string') {
            input = url;
          } else if (input && input.url) {
            try {
              input = new Request(url, input);
            } catch (_) {}
          }
        }

        // 응답 가로채기 — 모달에 unit 섹션 inject
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

  // ────────── 모달 body 에 전유부 섹션 inject ──────────
  function renderUnitSection(payload) {
    try {
      const body = document.getElementById('v245-bldg-body');
      if (!body) return;
      // 이미 inject 됐으면 skip
      if (body.querySelector('.v306-unit-section')) return;

      const sel = payload.selected_unit;
      const units = Array.isArray(payload.units) ? payload.units : [];
      const reqHo = (payload.query && payload.query.requestedHo) || '';

      const root = document.createElement('div');
      root.className = 'v306-unit-section';
      root.style.cssText = 'margin-top:16px;border-top:1px solid #e5e5e5;padding-top:14px';

      let html = '';
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
                '⚠️ 매물 호실 (' + escHtml(reqHo) + '호) 의 전유부를 찾을 수 없습니다.<br>' +
                '<span style="color:#666;font-size:11px">건물명 일치 안 함 / 단독·다가구 (전유부 미발급) / 호번호 형식 차이.</span></div>';
      } else {
        html += '<div style="color:#888;font-size:12px;background:#f5f5f5;padding:8px;border-radius:6px">' +
                'ℹ️ 매물에 호실 정보가 없습니다 (단독·다가구 추정 또는 호번호 미추출).</div>';
      }

      // 같은 동 다른 호실 (top 10)
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

      // ────────── Layer 5: 위반건축물 경고 ──────────
      try {
        var d = payload.data || {};
        var isIllegal = d.illegalBuilding === 'Y' || d.illegalBuilding === '1';
        if (isIllegal) {
          html += '<div style="margin-top:14px;padding:10px;background:#fff5f0;border:1px solid #f0c0a0;border-radius:8px">' +
                  '<div style="font-weight:700;color:#a04;font-size:13px;margin-bottom:4px">⚠️ 위반건축물 등록</div>' +
                  '<div style="font-size:11.5px;color:#555;line-height:1.5">' +
                  (d.illegalLawName ? '법령: ' + escHtml(d.illegalLawName) + '<br>' : '') +
                  (d.illegalLawArticle ? '조항: ' + escHtml(d.illegalLawArticle) + '<br>' : '') +
                  (d.illegalBuildingDate ? '표시일: ' + escHtml(d.illegalBuildingDate) + '<br>' : '') +
                  '<span style="color:#a04;font-weight:600">중개 시 임차인에게 고지 의무 (공인중개사법 §25)</span>' +
                  '</div></div>';
        }
      } catch (_e) {}

      // ────────── Layer 6: RTMS 실거래가 시세 ──────────
      try {
        var rt = payload.rtms;
        if (rt && rt.available && rt.count > 0) {
          var fmtMan = function(n) {
            if (n >= 10000) return (n/10000).toFixed(1) + '억 (' + n.toLocaleString() + '만)';
            return n.toLocaleString() + '만';
          };
          html += '<div style="margin-top:14px;padding:12px;background:#f0f7ff;border:1px solid #c5dcff;border-radius:8px">' +
                  '<div style="font-weight:700;color:#1a4480;font-size:13px;margin-bottom:8px">' +
                  '💹 동일 단지 실거래가 (최근 6개월, ' + rt.count + '건)</div>' +
                  '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px 10px;font-size:11.5px">' +
                  '<div><span style="color:#888">평균</span> <strong style="margin-left:6px">' + fmtMan(rt.avg) + '</strong></div>' +
                  '<div><span style="color:#888">중간값</span> <strong style="margin-left:6px">' + fmtMan(rt.median) + '</strong></div>' +
                  '<div><span style="color:#888">최저</span> <strong style="margin-left:6px;color:#1a8050">' + fmtMan(rt.min) + '</strong></div>' +
                  '<div><span style="color:#888">최고</span> <strong style="margin-left:6px;color:#a04">' + fmtMan(rt.max) + '</strong></div>';
          if (rt.recent_3m_avg > 0) {
            html += '<div style="grid-column:span 2;margin-top:4px;padding-top:6px;border-top:1px solid #c5dcff">' +
                    '<span style="color:#888">최근 3개월 평균</span> <strong style="margin-left:6px;color:#1a4480">' + fmtMan(rt.recent_3m_avg) + '</strong></div>';
          }
          html += '</div></div>';
        }
      } catch (_e3) {}

      // ────────── Layer 8: 같은 건물 다른 wishes 매물 ──────────
      try {
        var sb = Array.isArray(payload.same_building) ? payload.same_building : [];
        if (sb.length > 0) {
          html += '<div style="margin-top:14px"><div style="font-weight:700;font-size:13px;color:#2D5A27;margin-bottom:8px">' +
                  '🏘️ 같은 건물 다른 매물 (' + sb.length + '개)</div>';
          html += '<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow:auto">';
          for (var i = 0; i < sb.length; i++) {
            var L = sb[i];
            var dealLabel = L.deal === '월세' ? (L.deposit + '/' + L.monthly + '만') :
                            L.deal === '전세' ? (L.deposit + '만') :
                            L.deal === '매매' ? (L.price + '만') : '-';
            html += '<a href="/search?lid=' + encodeURIComponent(L.id) + '" target="_blank" ' +
                    'style="display:flex;justify-content:space-between;padding:8px 10px;font-size:11.5px;background:#f9fbf7;border:1px solid #e5eee5;border-radius:6px;text-decoration:none;color:#333">' +
                    '<span><strong>#' + L.id + '</strong> ' + escHtml(L.building_dong ? L.building_dong + ' ' : '') + escHtml(L.building_ho || L.address_detail || '-') + '호</span>' +
                    '<span style="color:#2D5A27;font-weight:600">' + escHtml(L.type || '') + ' · ' + escHtml(L.deal || '') + ' ' + escHtml(dealLabel) + '</span>' +
                    '</a>';
          }
          html += '</div></div>';
        }
      } catch (_e2) {}

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

  // ────────── DOM 변화 감지 (모달 열릴 때 lid 캡처) ──────────
  try {
    const obs = new MutationObserver(function () {
      // ai 모달 또는 detail 모달 새로 mount 시 lid 재캡처
      if (document.querySelector('.v240-ai-modal')) {
        captureLidFromDom();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  console.log('[' + V + '] 건축물대장 전유부 표시 활성 (lid 자동첨부 + selected_unit 섹션)');
})();
