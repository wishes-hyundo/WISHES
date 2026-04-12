/**
 * 공실클럽(gc2.gongsilclub.com) 크롤러 v6.0
 * 실행: gc2.gongsilclub.com 에서 공실매물 > 전체 > 주소검색 > 지역 전체 검색 후
 *       Chrome DevTools Console에 붙여넣기
 * 전제: 로그인 상태
 *
 * v6.0 주요 변경:
 *   - Supabase 직접 호출 → wishes.co.kr 관리자 API 사용 (CORS 완벽 지원)
 *   - AJAX 페이지 로드 (page() 리로드 문제 해결, 자동 다중 페이지)
 *   - iframe 기반 상세페이지 추출 (JS 렌더링 대응)
 *   - VIP 매물 자동 건너뛰기
 *   - 이미지 추출 제거
 *   - 가격 단위: 만원 그대로 저장
 *   - features 배열 admin API에서 자동 처리
 */
(async function GSC_FULL_CRAWLER() {
  // ═══════════ 설정 ═══════════
  var API_URL = 'https://wishes.co.kr/api/admin/listings';
  var API_TOKEN = 'wishes2026';
  var LIMIT = 999999;
  var DELAY_MS = 800;
  var FETCH_DETAIL = true;       // false → 카드 정보만 (빠름), true → 상세페이지도 (느리지만 완전)
  var DETAIL_CONCURRENCY = 3;    // 동시 iframe 로딩 수
  var DETAIL_WAIT_MS = 2500;     // iframe JS 렌더링 대기 ms

  // ═══════════ 헬퍼 ═══════════
  function extractGu(addr) {
    var m = addr && addr.match(/([가-힣]+구)/);
    return m ? m[1] : '';
  }
  function extractDong(addr) {
    var m = addr && addr.match(/([가-힣]+(?:동|읍|면|리))/);
    return m ? m[1] : '';
  }
  function parseBool(val) {
    if (!val) return null;
    var v = String(val).trim();
    if (['가능','있음','있','무료','Y','y','예','풀옵션','O'].indexOf(v) !== -1) return true;
    if (['불가','없음','없','N','n','X','아니오'].indexOf(v) !== -1) return false;
    return null;
  }
  function numParse(str) {
    if (!str) return null;
    var n = parseFloat(String(str).replace(/[,\s]/g, ''));
    return isNaN(n) ? null : n;
  }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  // ═══════════ 기존 source_id 조회 (관리자 API) ═══════════
  async function getExistingIds() {
    try {
      console.log('[GSC] 기존 매물 ID 조회 중...');
      var r = await fetch(API_URL + '?token=' + API_TOKEN + '&fields=minimal', {
        headers: { 'Accept': 'application/json' }
      });
      if (!r.ok) { console.warn('[GSC] ID 조회 실패: HTTP ' + r.status); return new Set(); }
      var json = await r.json();
      if (!json.success || !json.data) return new Set();
      var allIds = new Set();
      json.data.forEach(function(item) {
        if (item.source_site === 'gongsilclub' && item.source_id) {
          allIds.add(String(item.source_id));
        }
      });
      console.log('[GSC] 기존 source_id: ' + allIds.size + '개');
      return allIds;
    } catch(e) {
      console.error('[GSC] ID 조회 오류:', e.message);
      return new Set();
    }
  }

  // ═══════════ AJAX 페이지 HTML 로드 ═══════════
  function buildPageUrl(pageNum) {
    var base = location.href.split('#')[0];
    if (/[?&]pg=/.test(base)) {
      return base.replace(/([?&])pg=\d+/, '$1pg=' + pageNum);
    }
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'pg=' + pageNum;
  }

  async function fetchPageCards(pageNum) {
    var url = buildPageUrl(pageNum);
    try {
      var r = await fetch(url, { credentials: 'include' });
      var html = await r.text();
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      var cards = doc.querySelectorAll('ul.it_list_wrap > li.it_list, li.it_list');
      if (cards.length > 0) return Array.from(cards);
    } catch(e) { console.warn('[GSC] 페이지 ' + pageNum + ' AJAX 로드 실패:', e.message); }

    // 1페이지는 현재 DOM에서 직접 읽기
    if (pageNum === 1) {
      var liveCards = document.querySelectorAll('ul.it_list_wrap > li.it_list, li.it_list');
      return Array.from(liveCards);
    }
    return [];
  }

  // ═══════════ 카드에서 기본 정보 추출 ═══════════
  function parseCard(li) {
    var el = li.querySelector('[onclick*="ItemViewDetail"], [onclick*="FreeItemViewDetail"]');
    var onclick = (el && el.getAttribute) ? el.getAttribute('onclick') : '';
    var codeM = onclick.match(/(?:Free)?ItemViewDetail\((\d+)/);
    if (!codeM) return null;
    var source_id = codeM[1];

    var titText = (li.querySelector('.tit') || {}).textContent || '';
    titText = titText.replace(/\s+/g, ' ').trim();
    var priceText = (li.querySelector('.fz15_b_000') || {}).textContent || '';
    priceText = priceText.replace(/\s+/g, ' ').trim();

    var d = { source_site: 'gongsilclub', source_id: source_id };
    d.source_url = 'https://gc2.gongsilclub.com/v4/item.asp?mn=1110&wm=F100&ItemCode=' + source_id;

    // 주소
    var clean = titText.replace(/VIP|PLUS|FREE|NEW|공실매물|\d{2}\.\d{2}\.\d{2}/g, '').replace(/\s+/g, ' ').trim();
    d.address = clean.split(/\s+(?=지하\d+층|[가-힣0-9]+층\b)/)[0].replace(/\([^)]*\)/g, '').trim().substring(0, 60);

    // 거래/가격 (만원 단위 그대로)
    var dealM = priceText.match(/^(월세|전세|매매|단기)/);
    if (dealM) d.deal = dealM[1];
    if (d.deal === '단기') d.deal = '월세';
    var prices = [];
    var pm;
    var priceRegex = /[\d.]+/g;
    while ((pm = priceRegex.exec(priceText.replace(/,/g, ''))) !== null) prices.push(parseFloat(pm[0]));
    if (d.deal === '월세') {
      d.deposit = Math.round(prices[0] || 0);
      d.monthly = Math.round(prices[1] || prices[0] || 0);
    } else if (d.deal === '전세') {
      d.deposit = Math.round(prices[0] || 0);
    } else if (d.deal === '매매') {
      d.price = Math.round(prices[0] || 0);
    }
    if (!d.deal) d.deal = '월세';

    // 카드 텍스트에서 추가 정보 추출 시도
    var allText = li.textContent || '';
    // 면적
    var areaM = allText.match(/([\d.]+)\s*(?:㎡|m²|평)/);
    if (areaM) {
      var areaVal = parseFloat(areaM[1]);
      if (allText.indexOf('평') !== -1 && areaM[0].indexOf('평') !== -1 && areaVal < 200) {
        d.area_m2 = Math.round(areaVal * 3.305785 * 100) / 100;
      } else {
        d.area_m2 = areaVal;
      }
    }
    // 층수
    var floorM = allText.match(/(\d+)\s*층\s*[\/~|]\s*(\d+)\s*층/);
    if (floorM) { d.floor_current = floorM[1]; d.floor_total = floorM[2]; }
    else {
      var singleFloor = allText.match(/(\d+)\s*층/);
      if (singleFloor) d.floor_current = singleFloor[1];
    }
    // 타입
    var typeM = allText.match(/(원룸|투룸|쓰리룸|오피스텔|아파트|상가|사무실)/);
    if (typeM) d.type = typeM[1];

    return d;
  }

  // ═══════════ iframe 상세페이지 로딩 ═══════════
  async function loadDetailViaIframe(sourceId) {
    return new Promise(function(resolve) {
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:1px;height:1px;position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;border:none';
      iframe.src = '/v4/item.asp?mn=1110&wm=F140&pg=1&rk=' + sourceId;

      var done = false;
      function finish(html) {
        if (done) return;
        done = true;
        try { document.body.removeChild(iframe); } catch(e) {}
        resolve(html || '');
      }

      iframe.onload = function() {
        setTimeout(function() {
          try {
            var doc = iframe.contentDocument || iframe.contentWindow.document;
            finish(doc.body ? doc.body.innerHTML : '');
          } catch(e) { finish(''); }
        }, DETAIL_WAIT_MS);
      };
      iframe.onerror = function() { finish(''); };
      setTimeout(function() { finish(''); }, DETAIL_WAIT_MS + 8000);
      document.body.appendChild(iframe);
    });
  }

  // 동시에 여러 상세페이지 로딩
  async function batchLoadDetails(sourceIds) {
    var results = {};
    for (var i = 0; i < sourceIds.length; i += DETAIL_CONCURRENCY) {
      var batch = sourceIds.slice(i, i + DETAIL_CONCURRENCY);
      var promises = batch.map(function(id) {
        return loadDetailViaIframe(id).then(function(html) { results[id] = html; });
      });
      await Promise.all(promises);
    }
    return results;
  }

  // ═══════════ 상세 HTML에서 필드 추출 ═══════════
  function parseDetailHtml(html, d) {
    if (!html || html.length < 100) return d;
    var parser = new DOMParser();
    var doc = parser.parseFromString('<div>' + html + '</div>', 'text/html');
    var text = doc.body.textContent || '';

    // 테이블 기반 파싱
    var rows = doc.querySelectorAll('tr');
    rows.forEach(function(tr) {
      var cells = tr.querySelectorAll('th, td');
      for (var i = 0; i < cells.length - 1; i++) {
        var label = cells[i].textContent.replace(/\s+/g, '').trim();
        var value = cells[i+1].textContent.replace(/\s+/g, ' ').trim();
        if (!label || !value || value === '-') continue;

        if (label.indexOf('전용면적') !== -1 || label.indexOf('전용') !== -1) {
          var am = value.match(/([\d.]+)/); if (am) d.area_m2 = parseFloat(am[1]);
        }
        else if (label.indexOf('공급면적') !== -1 || label.indexOf('계약면적') !== -1) {
          var asm = value.match(/([\d.]+)/); if (asm) d.area_supply_m2 = parseFloat(asm[1]);
        }
        else if (label.indexOf('해당층') !== -1) { d.floor_current = value.match(/\d+/) ? value.match(/\d+/)[0] : value; }
        else if (label.indexOf('총층') !== -1 || label.indexOf('전체층') !== -1) { d.floor_total = value.match(/\d+/) ? value.match(/\d+/)[0] : value; }
        else if (label.indexOf('방수') !== -1 || label === '방') { var rm = value.match(/(\d+)/); if (rm) d.rooms = parseInt(rm[1]); }
        else if (label.indexOf('욕실') !== -1 || label.indexOf('화장실') !== -1) { var bm = value.match(/(\d+)/); if (bm) d.bathrooms = parseInt(bm[1]); }
        else if (label.indexOf('방향') !== -1) { d.direction = value; }
        else if (label.indexOf('난방') !== -1) { d.heating_type = value; }
        else if (label.indexOf('관리비') !== -1 && label.indexOf('항목') === -1 && !d.maintenance_fee) {
          var mfm = value.match(/([\d.]+)/); if (mfm) d.maintenance_fee = Math.round(parseFloat(mfm[1]));
        }
        else if (label.indexOf('관리비항목') !== -1 || label.indexOf('관리비포함') !== -1) {
          d.maintenance_includes = value.split(/[,/·]/).map(function(s){return s.trim();}).filter(Boolean);
        }
        else if (label.indexOf('입주') !== -1) { d.available_date = value; }
        else if (label.indexOf('건축') !== -1 || label.indexOf('사용승인') !== -1 || label.indexOf('준공') !== -1) {
          var ym = value.match(/(\d{4})/); if (ym) d.built_year = ym[1];
          if (label.indexOf('사용승인') !== -1) d.usage_approved = value;
        }
        else if (label.indexOf('주차') !== -1 && label.indexOf('비') === -1 && label.indexOf('대수') === -1) {
          d.parking = parseBool(value);
          var pkm = value.match(/(\d+)/);
          if (pkm) { d.parking_spaces = parseInt(pkm[1]); if (d.parking === null) d.parking = parseInt(pkm[1]) > 0; }
        }
        else if (label.indexOf('주차비') !== -1) { var pfm = numParse(value); if (pfm !== null) d.parking_fee = Math.round(pfm); }
        else if (label.indexOf('주차대수') !== -1) { var psm = value.match(/(\d+)/); if (psm) d.parking_spaces = parseInt(psm[1]); }
        else if (label.indexOf('엘리베이터') !== -1 || label.indexOf('E/V') !== -1) {
          d.elevator = parseBool(value);
          if (d.elevator === null) d.elevator = value.indexOf('있') !== -1 || value.indexOf('O') !== -1;
        }
        else if (label.indexOf('반려') !== -1 || label.indexOf('펫') !== -1) { d.pet = parseBool(value); }
        else if (label.indexOf('발코니') !== -1 || label.indexOf('베란다') !== -1) { d.balcony = parseBool(value); }
        else if (label.indexOf('풀옵션') !== -1) { d.full_option = parseBool(value); }
        else if (label.indexOf('대출') !== -1) { d.loan_available = parseBool(value); }
        else if (label.indexOf('출입구') !== -1 || label.indexOf('현관') !== -1) { d.entrance_type = value; }
        else if (label.indexOf('건물용도') !== -1 || label.indexOf('용도') !== -1) { d.building_purpose = value; }
        else if (label.indexOf('건물명') !== -1 || label.indexOf('단지명') !== -1) { d.building_name = value; }
        else if (label.indexOf('지하철') !== -1 || label.indexOf('역') !== -1) {
          var sm = value.match(/(.+역)/); var dm = value.match(/(\d+)\s*m/);
          if (sm) d.station_name = sm[1]; if (dm) d.station_distance = parseInt(dm[1]);
        }
        else if (label.indexOf('권리금') !== -1 && label.indexOf('시설') === -1 && label.indexOf('굿윌') === -1) {
          var rfm = numParse(value); if (rfm !== null) d.rights_fee = Math.round(rfm);
        }
        else if (label.indexOf('굿윌') !== -1 || label.indexOf('시설비') !== -1 || label.indexOf('시설권리금') !== -1) {
          var gfm = numParse(value); if (gfm !== null) d.goodwill_fee = Math.round(gfm);
        }
        else if (label.indexOf('부가세') !== -1) { d.vat_included = value.indexOf('포함') !== -1; }
        else if (label.indexOf('권장업종') !== -1) { d.recommended_business = value; }
        else if (label.indexOf('제한업종') !== -1) { d.restricted_business = value; }
        else if (label.indexOf('이전업종') !== -1) { d.previous_business = value; }
        else if (label.indexOf('이전상호') !== -1) { d.previous_brand = value; }
        else if (label.indexOf('업종') !== -1 && !d.business_type) { d.business_type = value; }
        else if (label.indexOf('전기') !== -1) { d.electric_capacity = value; }
        else if (label.indexOf('간판') !== -1) { d.signage_available = parseBool(value); }
        else if (label.indexOf('수수료') !== -1 || label.indexOf('중개보수') !== -1) {
          var cfm = numParse(value); if (cfm !== null) d.commission_fee = Math.round(cfm);
        }
        else if (label.indexOf('임대기간') !== -1 || label.indexOf('계약기간') !== -1) { d.lease_period = value; }
        else if (label.indexOf('연락처') !== -1 || label.indexOf('전화') !== -1 || label.indexOf('문의') !== -1) {
          var phm = value.match(/0\d{1,2}[-)\s]?\d{3,4}[-\s]?\d{4}/);
          if (phm) d.contact = phm[0];
        }
        else if (label.indexOf('특이') !== -1 || label.indexOf('비고') !== -1) { d.special_notes = value; }
      }
    });

    // 설명 텍스트
    var descSels = ['.item_desc', '.desc_area', '.memo_area', '.view_desc', '.detail_memo', '#desc', '.detail_content'];
    for (var di = 0; di < descSels.length; di++) {
      var el = doc.querySelector(descSels[di]);
      if (el) { var t = el.textContent.trim(); if (t.length > 20) { d.description = t.substring(0, 2000); break; } }
    }

    // 옵션/시설
    var optionArea = doc.querySelector('.option_area, .option_wrap, .facility, .opt_wrap');
    if (optionArea) {
      var feats = [];
      optionArea.querySelectorAll('span, li, div, em').forEach(function(el) {
        var t = el.textContent.trim();
        if (t.length > 1 && t.length < 20 && feats.indexOf(t) === -1) feats.push(t);
      });
      if (feats.length > 0) d.features = feats;
    }

    // 좌표
    var latM = html.match(/lat['":\s]+(3[5-8]\.\d+)/);
    var lngM = html.match(/lng['":\s]+(12[5-8]\.\d+)/);
    if (!latM) latM = html.match(/latitude['":\s]+(3[5-8]\.\d+)/);
    if (!lngM) lngM = html.match(/longitude['":\s]+(12[5-8]\.\d+)/);
    if (!latM) latM = html.match(/y['":\s]+(3[5-8]\.\d+)/);
    if (!lngM) lngM = html.match(/x['":\s]+(12[5-8]\.\d+)/);
    if (latM) d.lat = parseFloat(latM[1]);
    if (lngM) d.lng = parseFloat(lngM[1]);

    return d;
  }

  // ═══════════ 업로드 (관리자 API) ═══════════
  async function uploadListing(data) {
    try {
      // 기본값 보정
      if (!data.gu) data.gu = extractGu(data.address);
      if (!data.dong) data.dong = extractDong(data.address);
      if (!data.dong) data.dong = '미입력';
      if (!data.area_m2 || data.area_m2 <= 0) data.area_m2 = 0;
      if (!data.type) data.type = '원룸';
      data.title = data.title || ((data.dong || '') + ' ' + (data.deal || '월세') + ' ' + (data.type || '원룸')).trim().substring(0, 30);
      data.status = '가용';

      // null/undefined 값 제거 (API boolean 필드 에러 방지)
      Object.keys(data).forEach(function(k) {
        if (data[k] === null || data[k] === undefined) delete data[k];
      });

      var r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_TOKEN },
        body: JSON.stringify(data)
      });
      var resp = await r.json();
      if (resp.success) return { ok: true, id: resp.data ? resp.data.id : null };
      return { ok: false, error: resp.error || resp.detail || 'Unknown' };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  }

  // ═══════════ 메인 실행 ═══════════
  console.log('╔═══════════════════════════════════════╗');
  console.log('║  GSC Full Crawler v6.0 (Admin API)    ║');
  console.log('║  DETAIL=' + FETCH_DETAIL + ' | LIMIT=' + LIMIT + '         ║');
  console.log('╚═══════════════════════════════════════╝');

  var existingIds = await getExistingIds();
  var results = [];
  var uploaded = 0, skipped = 0, failed = 0;
  var detailOk = 0, detailFail = 0;
  var pg = 1;
  var emptyPages = 0;

  while (results.length < LIMIT) {
    console.log('\n━━━ [페이지 ' + pg + '] ━━━');

    var cards;
    if (pg === 1) {
      // 첫 페이지는 현재 DOM에서 직접 읽기 (가장 확실)
      cards = Array.from(document.querySelectorAll('ul.it_list_wrap > li.it_list, li.it_list'));
      if (cards.length === 0) {
        // 대안 셀렉터
        cards = Array.from(document.querySelectorAll('.it_list, .lst_link, .item_list li'));
      }
    } else {
      cards = await fetchPageCards(pg);
    }

    console.log('  카드 수: ' + cards.length);
    if (cards.length === 0) {
      emptyPages++;
      if (emptyPages >= 2) { console.log('  연속 빈 페이지 → 종료'); break; }
      pg++; continue;
    }
    emptyPages = 0;

    // 1단계: 카드 파싱 (VIP 포함 — 모든 매물 수집)
    var pageItems = [];
    for (var ci = 0; ci < cards.length; ci++) {
      var cardData = parseCard(cards[ci]);
      if (!cardData || !cardData.source_id) { failed++; continue; }
      if (existingIds.has(cardData.source_id)) { skipped++; continue; }
      pageItems.push(cardData);
    }
    console.log('  신규: ' + pageItems.length + '건 (중복: ' + skipped + ')');

    if (pageItems.length === 0) { pg++; await sleep(DELAY_MS); continue; }

    // 2단계: 상세페이지 로딩 (iframe)
    if (FETCH_DETAIL && pageItems.length > 0) {
      console.log('  상세페이지 로딩 중 (' + DETAIL_CONCURRENCY + '개 동시)...');
      var sourceIds = pageItems.map(function(item) { return item.source_id; });
      var detailHtmls = await batchLoadDetails(sourceIds);

      for (var di = 0; di < pageItems.length; di++) {
        var html = detailHtmls[pageItems[di].source_id];
        if (html && html.length > 200) {
          pageItems[di] = parseDetailHtml(html, pageItems[di]);
          detailOk++;
        } else {
          detailFail++;
        }
      }
      console.log('  상세: 성공 ' + detailOk + ' / 실패 ' + detailFail);
    }

    // 3단계: 업로드
    for (var ui = 0; ui < pageItems.length; ui++) {
      if (results.length >= LIMIT) break;
      var item = pageItems[ui];
      var bn = item.building_name || '';
      var dn = item.dong || extractDong(item.address) || '';
      item.title = bn
        ? (dn + ' ' + bn + ' ' + (item.type || '원룸')).trim().substring(0, 30)
        : (dn + ' ' + (item.deal || '월세') + ' ' + (item.type || '원룸')).trim().substring(0, 30);
      var upResult = await uploadListing(item);
      if (upResult.ok) {
        uploaded++;
        existingIds.add(item.source_id);
        var fieldCount = Object.keys(item).filter(function(k) {
          return item[k] !== null && item[k] !== undefined && item[k] !== '';
        }).length;
        console.log('  ✓ [' + item.source_id + '] ' + fieldCount + '필드 | ' + (item.address || '').substring(0, 25));
      } else {
        failed++;
        console.log('  ✗ [' + item.source_id + '] ' + upResult.error);
      }
      results.push(item);
      await sleep(300);
    }
    console.log('  누적: 업로드=' + uploaded + ' 건너뜀=' + skipped + ' 실패=' + failed);
    pg++;
    await sleep(DELAY_MS);
  }
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  GSC Crawler v6.0 완료                ║');
  console.log('║  총 파싱: ' + results.length + '건                     ║');
  console.log('║  업로드: ' + uploaded + ' | 건너뜀: ' + skipped + ' | 실패: ' + failed + '  ║');
  console.log('║  상세 성공: ' + detailOk + ' | 상세 실패: ' + detailFail + '    ║');
  console.log('╚═══════════════════════════════════════╝');
  return results;
})();
