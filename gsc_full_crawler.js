/**
 * 공실클럽(gc2.gongsilclub.com) 크롤러 v5.0
 * 실행: gc2.gongsilclub.com 에서 공실매물 > 전체 > 주소검색 > 서울 전체 검색 후
 *       Chrome DevTools Console에 붙여넣기
 * 전제: 로그인 상태
 *
 * v5.0 변경사항:
 *   - getExistingIds() 페이지네이션 수정 (Supabase 1000행 제한 대응)
 *   - VIP 매물 자동 건너뛰기
 *   - 카드 셀렉터 li.it_list + ItemViewDetail() 패턴 적용
 *   - listing_images/listing_features await 추가
 *   - 이미지 추출 제거 (불필요)
 *   - 가격 단위: 만원 그대로 저장 (변환 없음)
 *   - page() 호출 시 페이지 리로드 → 단일 페이지 내 매물만 처리
 *     (여러 페이지 크롤링은 page(n) 후 스크립트 재실행 필요)
 */
(async function GSC_FULL_CRAWLER() {
  var SUPABASE_URL = 'https://xbjgdsyukjdkfvcbzmjc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhiamdkc3l1a2pka2Z2Y2J6bWpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzYxODcsImV4cCI6MjA4OTkxMjE4N30.htuaYUP5Z6UeMJQ-4heTyJ1YBLy9SSQYclMm7ZYR_-4';
  var LIMIT = 999999;
  var DELAY_MS = 1000;

  // --- 헬퍼 ---
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

  // --- 카드에서 기본 정보 + source_id 추출 ---
  function parseCard(li) {
    // v4.1: ItemViewDetail 또는 FreeItemViewDetail 둘 다 지원
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

    // 주소 (카드 제목에서)
    var clean = titText.replace(/VIP|PLUS|FREE|NEW|공실매물|\d{2}\.\d{2}\.\d{2}/g, '').replace(/\s+/g, ' ').trim();
    d.address = clean.split(/\s+(?=지하\d+층|[가-힣0-9]+층\b)/)[0].replace(/\([^)]*\)/g, '').trim().substring(0, 60);

    // 거래/가격 (카드에서 빠르게)
    var dealM = priceText.match(/^(월세|전세|매매|단기)/);
    if (dealM) d.deal = dealM[1];
    var prices = [];
    var pm;
    var priceRegex = /[\d.]+/g;
    while ((pm = priceRegex.exec(priceText.replace(/,/g, ''))) !== null) prices.push(parseFloat(pm[0]));
    if (d.deal === '월세' || d.deal === '단기') {
      d.deposit = Math.round(prices[0] || 0);
      d.monthly = Math.round(prices[1] || prices[0] || 0);
    } else if (d.deal === '전세') {
      d.deposit = Math.round(prices[0] || 0);
    } else if (d.deal === '매매') {
      d.price = Math.round(prices[0] || 0);
    }
    if (!d.deal) d.deal = '월세';

    return d;
  }

  // --- 상세페이지 fetch & 파싱 ---
  async function fetchDetail(source_id) {
    // 공실클럽 상세페이지 URL 패턴들 시도 (v4.1: wm=F140이 실제 상세뷰)
    var urls = [
      '/v4/item.asp?mn=1110&wm=F140&pg=1&rk=' + source_id,
      '/v4/item.asp?mn=1110&wm=F100&ItemCode=' + source_id
    ];

    var html = '';
    for (var ui = 0; ui < urls.length; ui++) {
      try {
        var r = await fetch(urls[ui], {
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (r.ok) {
          var text = await r.text();
          // 상세 정보가 포함된 응답인지 확인 (200자 이상이고 주요 키워드 포함)
          if (text.length > 200 && (text.indexOf('전용면적') !== -1 || text.indexOf('보증금') !== -1 || text.indexOf('월세') !== -1 || text.indexOf('ItemCode') !== -1)) {
            html = text;
            break;
          }
        }
      } catch(e) { /* try next URL */ }
    }

    // 프레임셋 방식인 경우: ItemViewDetail 함수를 직접 호출하여 프레임 DOM 접근
    if (!html && typeof ItemViewDetail === 'function') {
      try {
        ItemViewDetail(source_id);
        await new Promise(function(r) { setTimeout(r, 1500); });
        // 팝업이나 iframe에서 상세 DOM 가져오기
        var detailFrame = document.querySelector('iframe[name*="detail"], iframe[src*="ItemCode"], iframe[src*="item_view"]');
        if (detailFrame && detailFrame.contentDocument) {
          html = detailFrame.contentDocument.body.innerHTML;
        }
        // 팝업 윈도우 체크
        if (!html) {
          var popup = document.querySelector('.detail_popup, .item_detail, #itemDetail, .popup_wrap');
          if (popup) html = popup.innerHTML;
        }
        // 현재 페이지 DOM에 로드된 상세 영역
        if (!html) {
          var detailArea = document.querySelector('.item_view_wrap, .detail_wrap, .view_area, #viewArea');
          if (detailArea && detailArea.innerHTML.length > 300) html = detailArea.innerHTML;
        }
      } catch(e) { /* ignore */ }
    }

    return html;
  }

  // --- 상세 HTML에서 필드 추출 ---
  function parseDetailHtml(html, d) {
    if (!html) return d;
    var parser = new DOMParser();
    var doc = parser.parseFromString('<div>' + html + '</div>', 'text/html');
    var text = doc.body.textContent || '';

    // -- 테이블 기반 파싱 (공실클럽은 주로 <table>/<tr>/<td> 구조) --
    var rows = doc.querySelectorAll('tr');
    rows.forEach(function(tr) {
      var cells = tr.querySelectorAll('th, td');
      for (var i = 0; i < cells.length - 1; i++) {
        var label = cells[i].textContent.replace(/\s+/g, '').trim();
        var value = cells[i+1].textContent.replace(/\s+/g, ' ').trim();
        if (!label || !value || value === '-') continue;

        // 면적
        if (label.indexOf('전용면적') !== -1 || label.indexOf('전용') !== -1) {
          var am = value.match(/([\d.]+)/);
          if (am) d.area_m2 = parseFloat(am[1]);
        }
        else if (label.indexOf('공급면적') !== -1 || label.indexOf('계약면적') !== -1) {
          var asm = value.match(/([\d.]+)/);
          if (asm) d.area_supply_m2 = parseFloat(asm[1]);
        }
        // 층수
        else if (label.indexOf('해당층') !== -1) { d.floor_current = value; }
        else if (label.indexOf('총층') !== -1 || label.indexOf('전체층') !== -1) { d.floor_total = value; }
        // 방/욕실
        else if (label.indexOf('방수') !== -1 || label === '방') {
          var rm = value.match(/(\d+)/);
          if (rm) d.rooms = parseInt(rm[1]);
        }
        else if (label.indexOf('욕실') !== -1 || label.indexOf('화장실') !== -1) {
          var bm = value.match(/(\d+)/);
          if (bm) d.bathrooms = parseInt(bm[1]);
        }
        // 방향
        else if (label.indexOf('방향') !== -1) { d.direction = value; }
        // 난방
        else if (label.indexOf('난방') !== -1) { d.heating_type = value; }
        // 관리비
        else if (label.indexOf('관리비') !== -1 && label.indexOf('항목') === -1) {
          var mfm = value.match(/([\d.]+)/);
          if (mfm && !d.maintenance_fee) d.maintenance_fee = Math.round(parseFloat(mfm[1]));
        }
        else if (label.indexOf('관리비항목') !== -1 || label.indexOf('관리비포함') !== -1) {
          d.maintenance_includes = value;
        }
        // 입주가능일
        else if (label.indexOf('입주') !== -1) { d.available_date = value; }
        // 건축년도
        else if (label.indexOf('건축') !== -1 || label.indexOf('사용승인') !== -1 || label.indexOf('준공') !== -1) {
          var ym = value.match(/(\d{4})/);
          if (ym) d.built_year = ym[1];
          if (label.indexOf('사용승인') !== -1) d.usage_approved = value;
        }
        // 주차
        else if (label.indexOf('주차') !== -1 && label.indexOf('비') === -1) {
          var pkm = value.match(/(\d+)/);
          if (pkm) d.parking_spaces = parseInt(pkm[1]);
          d.parking = parseBool(value);
          if (d.parking === null && pkm) d.parking = parseInt(pkm[1]) > 0;
        }
        else if (label.indexOf('주차비') !== -1) {
          var pfm = numParse(value);
          if (pfm !== null) d.parking_fee = pfm;
        }
        // 엘리베이터
        else if (label.indexOf('엘리베이터') !== -1 || label.indexOf('E/V') !== -1) {
          d.elevator = parseBool(value);
          if (d.elevator === null) d.elevator = value.indexOf('있') !== -1 || value.indexOf('O') !== -1;
        }
        // 반려동물
        else if (label.indexOf('반려') !== -1 || label.indexOf('펫') !== -1) { d.pet = parseBool(value); }
        // 발코니
        else if (label.indexOf('발코니') !== -1 || label.indexOf('베란다') !== -1) { d.balcony = parseBool(value); }
        // 풀옵션
        else if (label.indexOf('풀옵션') !== -1) { d.full_option = parseBool(value); }
        // 대출
        else if (label.indexOf('대출') !== -1) { d.loan_available = parseBool(value); }
        // 출입구
        else if (label.indexOf('출입구') !== -1 || label.indexOf('현관') !== -1) { d.entrance_type = value; }
        // 건물용도
        else if (label.indexOf('건물용도') !== -1 || label.indexOf('용도') !== -1) { d.building_purpose = value; }
        // 건물명
        else if (label.indexOf('건물명') !== -1 || label.indexOf('단지명') !== -1) { d.building_name = value; }
        // 역세권
        else if (label.indexOf('지하철') !== -1 || label.indexOf('역') !== -1) {
          var sm = value.match(/(.+역)/);
          var dm = value.match(/(\d+)\s*m/);
          if (sm) d.station_name = sm[1];
          if (dm) d.station_distance = parseInt(dm[1]);
        }
        // 권리금
        else if (label.indexOf('권리금') !== -1) {
          var rfm = numParse(value);
          if (rfm !== null) d.rights_fee = rfm;
        }
        else if (label.indexOf('굿윌') !== -1 || label.indexOf('시설비') !== -1) {
          var gfm = numParse(value);
          if (gfm !== null) d.goodwill_fee = gfm;
        }
        // 부가세
        else if (label.indexOf('부가세') !== -1) { d.vat_included = value.indexOf('포함') !== -1; }
        // 업종 관련
        else if (label.indexOf('권장업종') !== -1) { d.recommended_business = value; }
        else if (label.indexOf('제한업종') !== -1) { d.restricted_business = value; }
        else if (label.indexOf('이전업종') !== -1) { d.previous_business = value; }
        else if (label.indexOf('이전상호') !== -1) { d.previous_brand = value; }
        else if (label.indexOf('업종') !== -1 && !d.business_type) { d.business_type = value; }
        // 전기용량
        else if (label.indexOf('전기') !== -1) { d.electric_capacity = value; }
        // 간판
        else if (label.indexOf('간판') !== -1) { d.signage_available = parseBool(value); }
        // 수수료
        else if (label.indexOf('수수료') !== -1 || label.indexOf('중개보수') !== -1) {
          var cfm = numParse(value);
          if (cfm !== null) d.commission_fee = cfm;
        }
        // 임대기간
        else if (label.indexOf('임대기간') !== -1 || label.indexOf('계약기간') !== -1) { d.lease_period = value; }
        // 연락처
        else if (label.indexOf('연락처') !== -1 || label.indexOf('전화') !== -1 || label.indexOf('문의') !== -1) {
          var phm = value.match(/0\d{1,2}[-)\s]?\d{3,4}[-\s]?\d{4}/);
          if (phm) d.contact = phm[0];
        }
        // 특이사항
        else if (label.indexOf('특이') !== -1 || label.indexOf('비고') !== -1) { d.special_notes = value; }
      }
    });

    // -- 설명/메모 텍스트 (상세 비고란) --
    var descSels = ['.item_desc', '.desc_area', '.memo_area', '.view_desc', '.detail_memo', '#desc'];
    for (var di = 0; di < descSels.length; di++) {
      var el = doc.querySelector(descSels[di]);
      if (el) {
        var t = el.textContent.trim();
        if (t.length > 20) { d.description = t.substring(0, 2000); break; }
      }
    }

    // (이미지 추출 제거 — v5.0)

    // -- 옵션/시설 --
    var optionArea = doc.querySelector('.option_area, .option_wrap, .facility');
    if (optionArea) {
      var feats = [];
      optionArea.querySelectorAll('span, li, div').forEach(function(el) {
        var t = el.textContent.trim();
        if (t.length > 1 && t.length < 20) feats.push(t);
      });
      if (feats.length > 0) d.features = feats;
    }

    // -- 좌표 (스크립트에서 추출) --
    var latM = html.match(/lat['":\s]+(3[67]\.\d+)/);
    var lngM = html.match(/lng['":\s]+(12[67]\.\d+)/);
    if (latM) d.lat = parseFloat(latM[1]);
    if (lngM) d.lng = parseFloat(lngM[1]);

    return d;
  }

  // --- 기존 source_id 조회 (페이지네이션: Supabase 1000행 제한 대응) ---
  async function getExistingIds() {
    try {
      var allIds = new Set();
      var offset = 0;
      while (true) {
        var r = await fetch(
          SUPABASE_URL + '/rest/v1/listings?source_site=eq.gongsilclub&select=source_id&limit=1000&offset=' + offset,
          { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
        );
        if (!r.ok) break;
        var data = await r.json();
        if (!data.length) break;
        data.forEach(function(x) { allIds.add(String(x.source_id)); });
        offset += data.length;
        if (data.length < 1000) break;
      }
      console.log('[GSC] 기존 source_id: ' + allIds.size + '개');
      return allIds;
    } catch(e) { return new Set(); }
  }

  // --- 업로드 ---
  async function uploadListing(data) {
    try {
      var featuresList = data.features || [];
      var listingData = {};
      for (var k in data) {
        if (k !== 'images' && k !== 'features') listingData[k] = data[k];
      }
      listingData.status = '가용';

      var r = await fetch(SUPABASE_URL + '/rest/v1/listings', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json', 'Prefer': 'return=representation'
        },
        body: JSON.stringify(listingData),
      });
      var resp = await r.json();
      if (!r.ok) return { ok: false, error: JSON.stringify(resp).substring(0, 100) };
      var dbId = resp[0] ? resp[0].id : null;
      if (!dbId) return { ok: true, id: null };

      // 이미지 업로드 제거 (v5.0)

      if (featuresList.length > 0) {
        var featInserts = featuresList.map(function(f) { return { listing_id: dbId, feature: String(f) }; });
        await fetch(SUPABASE_URL + '/rest/v1/listing_features', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(featInserts),
        });
      }
      return { ok: true, id: dbId };
    } catch(e) { return { ok: false, error: e.message }; }
  }

  // === 메인 실행 ===
  console.log('=== GSC Full Crawler v5.0 Start (LIMIT=' + LIMIT + ') ===');
  var existingIds = await getExistingIds();
  console.log('Existing: ' + existingIds.size);

  var results = [];
  var uploaded = 0, skipped = 0, failed = 0, detailOk = 0, detailFail = 0;
  var pg = 1;

  while (results.length < LIMIT) {
    console.log('\n[Page ' + pg + ']');
    // v4.1: page() 함수가 외부 정의 시 사용, 없으면 URL 직접 이동
    if (typeof page === 'function') {
      page(pg);
    } else if (typeof goPage === 'function') {
      goPage(pg);
    } else {
      // 페이지 번호 링크 클릭 시도
      var pageLink = document.querySelector('a[onclick*="page(' + pg + ')"], a[onclick*="goPage(' + pg + ')"], .paging a:nth-child(' + pg + ')');
      if (pageLink) pageLink.click();
    }
    await new Promise(function(r) { setTimeout(r, DELAY_MS); });

    var cards = document.querySelectorAll('li.it_list');
    console.log('  ' + cards.length + ' cards');
    if (cards.length === 0) { break; }

    var newInPage = 0;
    for (var ci = 0; ci < cards.length; ci++) {
      if (results.length >= LIMIT) break;
      // VIP 매물 건너뛰기
      var cardText = cards[ci].textContent || '';
      if (cardText.indexOf('VIP') !== -1) { skipped++; console.log('  [VIP] 건너뛰기'); continue; }

      var cardData = parseCard(cards[ci]);
      if (!cardData || !cardData.source_id) { failed++; continue; }
      if (existingIds.has(cardData.source_id)) { skipped++; continue; }

      // 상세페이지 크롤링
      var detailHtml = await fetchDetail(cardData.source_id);
      if (detailHtml && detailHtml.length > 100) {
        cardData = parseDetailHtml(detailHtml, cardData);
        detailOk++;
      } else {
        detailFail++;
      }
      await new Promise(function(r) { setTimeout(r, DELAY_MS); });

      // 기본값
      if (!cardData.gu) cardData.gu = extractGu(cardData.address);
      if (!cardData.dong) cardData.dong = extractDong(cardData.address);
      if (!cardData.area_m2) cardData.area_m2 = 0.1;
      if (!cardData.type) cardData.type = '원룸';
      var bn = (cardData.address || '').match(/[가-힣]+(?:동|읍|면)\s+[\d-]+\s+(.+)/);
      if (bn && bn[1].trim().length > 1 && !cardData.building_name) cardData.building_name = bn[1].trim();
      cardData.title = (cardData.building_name
        ? (cardData.dong || '') + ' ' + cardData.building_name + ' ' + cardData.type
        : (cardData.dong || '') + ' ' + cardData.deal + ' ' + cardData.type
      ).trim().substring(0, 30);

      var fieldCount = Object.keys(cardData).filter(function(k) {
        return ['source_site','source_id','source_url','title'].indexOf(k) === -1 && cardData[k] != null;
      }).length;
      console.log('  [' + cardData.source_id + '] ' + fieldCount + ' fields' + (detailHtml ? ' (detail OK)' : ' (card only)'));

      results.push(cardData);
      newInPage++;

      var upResult = await uploadListing(cardData);
      if (upResult.ok) {
        uploaded++;
      } else {
        failed++;
        console.log('    FAIL: ' + upResult.error);
      }
    }

    console.log('  New: ' + newInPage + ' | Up: ' + uploaded + ' | Skip: ' + skipped + ' | Detail: ' + detailOk + '/' + (detailOk+detailFail));
    if (newInPage === 0 && skipped === 0) { break; }
    pg++;
    await new Promise(function(r) { setTimeout(r, DELAY_MS); });
  }

  console.log('\n========================================');
  console.log('=== GSC Full Crawler v5.0 Done ===');
  console.log('Parsed: ' + results.length + ' | Upload: ' + uploaded);
  console.log('Detail success: ' + detailOk + ' | Detail fail: ' + detailFail);
  console.log('Skip: ' + skipped + ' | Fail: ' + failed);
  console.log('========================================');
  return results;
})()