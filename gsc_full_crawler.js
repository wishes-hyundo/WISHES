/**
 * 공실클럽(gc2.gongsilclub.com) 크롤러 v7.0
 * 실행: gc2.gongsilclub.com 에서 공실매물 > 전체 > 주소검색 > 지역 전체 검색 후
 *       Chrome DevTools Console에 붙여넣기
 * 전제: 로그인 상태
 *
 * v7.0 주요 변경:
 *   - 상세페이지 파싱 완전 재작성: CSS 클래스 기반 (detail_info_td1~td4)
 *   - 실제 라벨명 매칭: 면적정보, 해당층/총층, 룸/욕실수, 월관리비 등
 *   - 특이사항 → description 매핑
 *   - 옵션 → features 배열 매핑
 *   - 모든 필드 정상 추출 확인
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

    // 주소 + 건물명 추출
    var clean = titText.replace(/VIP|PLUS|FREE|NEW|공실매물|\d{2}\.\d{2}\.\d{2}/g, '').replace(/\s+/g, ' ').trim();
    var addrPart = clean.split(/\s+(?=지하\d+층|[가-힣0-9]+층\b)/)[0];
    d.address = addrPart.replace(/\([^)]*\)/g, '').trim().substring(0, 60);
    // 건물명: 주소 뒤의 한글+숫자 조합 (예: "방화샤르망2오피스텔")
    var bldgM = addrPart.match(/\d+[-\d]*\s+([가-힣]+\d*[가-힣]*(?:오피스텔|빌딩|타워|아파트|빌라|맨션|센터|플라자|파크|팰리스|하이츠|타운))/);
    if (bldgM) d.building_name = bldgM[1];

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
    // 보증금 조정가능
    if (/보증금\s*조정/.test(allText)) {
      d.special_notes = (d.special_notes ? d.special_notes + ' / ' : '') + '보증금 조정가능';
    }

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

  // ═══════════ 상세 HTML에서 필드 추출 (v7.0 CSS 클래스 기반) ═══════════
  function parseDetailHtml(html, d) {
    if (!html || html.length < 100) return d;
    var parser = new DOMParser();
    var doc = parser.parseFromString('<div>' + html + '</div>', 'text/html');

    // ── CSS 클래스 기반 라벨-값 매핑 ──
    // 공실클럽 상세페이지 구조:
    //   detail_info_td1 = 라벨(섹션1), detail_info_td2 = 값(섹션1)
    //   detail_info_td3 = 라벨(섹션2), detail_info_td4 = 값(섹션2)
    var infoMap = {};

    // 섹션1: td1→td2 쌍
    doc.querySelectorAll('.detail_info_td1').forEach(function(td1) {
      var label = td1.textContent.replace(/\s+/g, '').trim();
      var next = td1.nextElementSibling;
      if (next && next.classList && next.classList.contains('detail_info_td2')) {
        var value = next.textContent.replace(/\s+/g, ' ').trim();
        if (label && value && value !== '-') infoMap[label] = value;
      }
    });

    // 섹션2: td3→td4 쌍
    doc.querySelectorAll('.detail_info_td3').forEach(function(td3) {
      var label = td3.textContent.replace(/\s+/g, '').trim();
      var next = td3.nextElementSibling;
      if (next && next.classList && next.classList.contains('detail_info_td4')) {
        var value = next.textContent.replace(/\s+/g, ' ').trim();
        if (label && value && value !== '-') infoMap[label] = value;
      }
    });

    // 파싱된 라벨-값 디버그 출력
    var mapKeys = Object.keys(infoMap);
    console.log('[GSC] 상세 infoMap (' + mapKeys.length + '개):', mapKeys.join(', '));

    // ── 면적정보: "공급(계약): 67m²(20.3P) 전용: 39.2m²(11.9P) ..." ──
    var areaInfo = infoMap['면적정보'] || '';
    if (areaInfo) {
      var exclusiveM = areaInfo.match(/전용[:\s]*([\d.]+)\s*(?:㎡|m²|m2)/);
      if (exclusiveM) d.area_m2 = parseFloat(exclusiveM[1]);
      // 공급(계약) 또는 공급 면적
      var supplyM = areaInfo.match(/공급(?:\([^)]*\))?[:\s]*([\d.]+)\s*(?:㎡|m²|m2)/);
      if (supplyM) d.area_supply_m2 = parseFloat(supplyM[1]);
      // 계약면적 패턴도 체크
      if (!d.area_supply_m2) {
        var contractM = areaInfo.match(/계약[:\s]*([\d.]+)\s*(?:㎡|m²|m2)/);
        if (contractM) d.area_supply_m2 = parseFloat(contractM[1]);
      }
      if (!d.area_m2) {
        var anyArea = areaInfo.match(/([\d.]+)\s*(?:㎡|m²|m2)/);
        if (anyArea) d.area_m2 = parseFloat(anyArea[1]);
      }
      // 평수만 있는 경우
      if (!d.area_m2) {
        var pyM = areaInfo.match(/([\d.]+)\s*(?:평|P)/);
        if (pyM) d.area_m2 = Math.round(parseFloat(pyM[1]) * 3.305785 * 100) / 100;
      }
    }

    // ── 해당층/총층: "1층 / 6층" ──
    var floorInfo = infoMap['해당층/총층'] || infoMap['해당층'] || '';
    if (floorInfo) {
      var floorM = floorInfo.match(/(지하)?(\d+)\s*층\s*[\/~|]\s*(\d+)\s*층/);
      if (floorM) {
        d.floor_current = (floorM[1] ? 'B' : '') + floorM[2];
        d.floor_total = floorM[3];
      } else {
        var singleF = floorInfo.match(/(지하)?(\d+)\s*층/);
        if (singleF) d.floor_current = (singleF[1] ? 'B' : '') + singleF[2];
      }
    }

    // ── 룸/욕실수 ──
    var roomInfo = infoMap['룸/욕실수'] || infoMap['방수'] || infoMap['방/욕실'] || '';
    if (roomInfo) {
      var roomNums = roomInfo.match(/(\d+)/g);
      if (roomNums && roomNums.length >= 1) d.rooms = parseInt(roomNums[0]);
      if (roomNums && roomNums.length >= 2) d.bathrooms = parseInt(roomNums[1]);
    }

    // ── 구조형태 ──
    // 구조형태 → entrance_type 필드에 매핑 (DB에 structure_type 없음)
    if (infoMap['구조형태']) d.entrance_type = infoMap['구조형태'];

    // ── 월관리비: "10만원, 공과금 별도" or "관리비 별도, 퇴실비18만" ──
    var maintInfo = infoMap['월관리비'] || infoMap['관리비'] || '';
    if (maintInfo) {
      // "관리비 별도"인 경우 → 금액 0, special_notes에 원문 기록
      if (/관리비\s*별도/.test(maintInfo)) {
        d.maintenance_fee = null;
        d.special_notes = (d.special_notes ? d.special_notes + ' / ' : '') + '관리비별도';
        var extraInfo = maintInfo.replace(/관리비\s*별도/, '').replace(/^[\s,，]+|[\s,，]+$/g, '').trim();
        if (extraInfo) d.special_notes += ', ' + extraInfo;
      } else {
        // 관리비 금액 추출 - "10만원" 패턴
        var maintM = maintInfo.match(/(\d+)\s*만\s*원?/);
        if (maintM) {
          d.maintenance_fee = Math.round(parseFloat(maintM[1]));
        } else {
          var maintN = maintInfo.match(/^(\d+)$/);
          if (maintN) d.maintenance_fee = Math.round(parseFloat(maintN[1]));
        }
      }
      // 부가세 정보
      if (maintInfo.indexOf('부가세') !== -1) {
        d.vat_included = maintInfo.indexOf('포함') !== -1;
      }
      // 관리비 부가내용 추출: "10만원, 공과금 별도" → ["공과금 별도"]
      // 콤마로 분리 후 금액 부분 제외한 나머지를 maintenance_includes에 저장
      var maintParts = maintInfo.split(/[,，]/).map(function(s) { return s.trim(); }).filter(function(s) {
        return s.length > 1 && !/^\d+\s*만?\s*원?$/.test(s);
      });
      if (maintParts.length > 0) {
        d.maintenance_includes = maintParts;
      }
    }

    // ── 관리비항목 ──
    var maintItems = infoMap['관리비항목'] || infoMap['관리비포함'] || '';
    if (maintItems) {
      d.maintenance_includes = maintItems.split(/[,/·ㆍ、]/).map(function(s) { return s.trim(); }).filter(Boolean);
    }

    // ── 주차대수: "유료 1대, 주차비: 1대당 12만원" or "무료 4대" or "개별확인" ──
    var parkInfo = infoMap['주차대수'] || infoMap['주차'] || '';
    if (parkInfo) {
      var parkNum = parkInfo.match(/(\d+)\s*대/);
      if (parkNum) {
        d.parking_spaces = parseInt(parkNum[1]);
        d.parking = parseInt(parkNum[1]) > 0;
      }
      if (parkInfo.indexOf('무료') !== -1 || parkInfo.indexOf('가능') !== -1) d.parking = true;
      if (parkInfo.indexOf('불가') !== -1 || parkInfo.indexOf('없') !== -1) d.parking = false;
      // 주차비 추출: "주차비: 1대당 12만원" or "주차비 10만"
      var parkFeeM = parkInfo.match(/주차비[:\s]*(?:1대당\s*)?(\d+)\s*만/);
      if (parkFeeM) d.parking_fee = parseInt(parkFeeM[1]);
      // 주차 상세정보는 parking_fee/parking_spaces 필드에 이미 저장되므로 special_notes에 중복 기록하지 않음
    }

    // ── 준공년도: "2010년 5월 6일" ──
    var builtInfo = infoMap['준공년도'] || infoMap['준공일'] || infoMap['사용승인일'] || '';
    if (builtInfo) {
      var builtM = builtInfo.match(/(\d{4})/);
      if (builtM) d.built_year = builtM[1];
    }

    // ── 입주가능일 ──
    var moveIn = infoMap['입주가능일'] || infoMap['입주일'] || '';
    if (moveIn) d.available_date = moveIn;

    // ── 임대기간 ──
    if (infoMap['임대기간']) d.lease_period = infoMap['임대기간'];

    // ── 용도 ──
    var usage = infoMap['용도'] || infoMap['건물용도'] || '';
    if (usage) d.building_purpose = usage;

    // ── 권리금 ──
    var rightsInfo = infoMap['권리금'] || '';
    if (rightsInfo && rightsInfo !== '무' && rightsInfo !== '없음') {
      var rightsM = rightsInfo.match(/([\d,.]+)/);
      if (rightsM) d.rights_fee = Math.round(parseFloat(rightsM[1].replace(/,/g, '')));
    }

    // ── 현업종/상호 또는 이전업종/상호 ──
    var bizInfo = infoMap['현업종/상호'] || infoMap['이전업종/상호'] || infoMap['현업종'] || infoMap['이전업종'] || '';
    if (bizInfo) d.previous_business = bizInfo;

    // ── 권장업종 / 제한업종 ──
    if (infoMap['권장업종']) d.recommended_business = infoMap['권장업종'];
    if (infoMap['제한업종']) d.restricted_business = infoMap['제한업종'];

    // ── 방향 ──
    if (infoMap['방향']) d.direction = infoMap['방향'];

    // ── 난방 ──
    if (infoMap['난방'] || infoMap['난방방식']) d.heating_type = infoMap['난방'] || infoMap['난방방식'];

    // ── 출입구/현관 ──
    if (infoMap['출입구'] || infoMap['현관구조']) d.entrance_type = infoMap['출입구'] || infoMap['현관구조'];

    // ── 건물명 ──
    if (infoMap['건물명'] || infoMap['단지명']) d.building_name = infoMap['건물명'] || infoMap['단지명'];

    // ── 옵션: "엘리베이터, 개별냉난방, 천장형 냉ㆍ난방 시스템" ──
    var optionInfo = infoMap['옵션'] || infoMap['시설옵션'] || '';
    if (optionInfo) {
      var feats = optionInfo.split(/[,，、·ㆍ]/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
      if (feats.length > 0) d.features = feats;
      // 옵션에서 boolean 필드 자동 추출
      if (optionInfo.indexOf('엘리베이터') !== -1) d.elevator = true;
      if (optionInfo.indexOf('풀옵션') !== -1) d.full_option = true;
      if (optionInfo.indexOf('반려') !== -1 || optionInfo.indexOf('펫') !== -1) d.pet = true;
      if (optionInfo.indexOf('발코니') !== -1 || optionInfo.indexOf('베란다') !== -1) d.balcony = true;
    }

    // ── 특이사항 → description + 추가 정보 추출 ──
    var special = infoMap['특이사항'] || infoMap['상세설명'] || infoMap['메모'] || '';
    if (special && special.length > 3) {
      d.description = special.substring(0, 2000);
      // 특이사항에서 반려동물 정보 추출
      if (!d.pet && (special.indexOf('애완동물') !== -1 || special.indexOf('반려동물') !== -1 || special.indexOf('펫') !== -1)) {
        d.pet = special.indexOf('안됨') !== -1 || special.indexOf('불가') !== -1 || special.indexOf('금지') !== -1 ? false : true;
      }
      // 특이사항에서 방향 추출
      if (!d.direction) {
        var dirM = special.match(/(남향|북향|동향|서향|남동향|남서향|북동향|북서향|정남향|정북향)/);
        if (dirM) d.direction = dirM[1];
      }
    }

    // ── 연락처: parseDetailHtml에서는 설정하지 않음 ──
    // 연락처는 별도 AJAX API로 가져옴 (fetchContactForListing 함수)
    // 상세 HTML에 있는 번호는 대부분 사이트 대표번호이므로 무시

    // ── 부가세 ──
    if (infoMap['부가세']) d.vat_included = infoMap['부가세'].indexOf('포함') !== -1;

    // ── 전기용량 ──
    if (infoMap['전기용량'] || infoMap['전기']) d.electric_capacity = infoMap['전기용량'] || infoMap['전기'];

    // ── 수수료/중개보수 ──
    var commInfo = infoMap['수수료'] || infoMap['중개보수'] || '';
    if (commInfo) {
      var cfm = commInfo.match(/([\d,]+)/);
      if (cfm) d.commission_fee = Math.round(parseFloat(cfm[1].replace(/,/g, '')));
      // 숫자 없이 "협의", "별도" 등 텍스트인 경우 commission_note에 저장
      if (!cfm && commInfo.length > 0) d.commission_note = commInfo;
    }

    // ── 엘리베이터 (별도 라벨인 경우) ──
    if (infoMap['엘리베이터'] || infoMap['E/V']) {
      var evVal = infoMap['엘리베이터'] || infoMap['E/V'];
      d.elevator = parseBool(evVal);
      if (d.elevator === null) d.elevator = evVal.indexOf('있') !== -1 || evVal.indexOf('O') !== -1;
    }

    // ── 반려동물 (별도 라벨) ──
    if (infoMap['반려동물'] || infoMap['반려']) {
      var petVal = infoMap['반려동물'] || infoMap['반려'];
      d.pet = parseBool(petVal);
    }

    // ── 대출 ──
    if (infoMap['대출'] || infoMap['전세대출']) {
      var loanVal = infoMap['대출'] || infoMap['전세대출'];
      d.loan_available = parseBool(loanVal);
    }

    // ── 좌표 (raw HTML에서) ──
    var latM = html.match(/lat['":\s]+(3[5-8]\.\d+)/);
    var lngM = html.match(/lng['":\s]+(12[5-8]\.\d+)/);
    if (!latM) latM = html.match(/latitude['":\s]+(3[5-8]\.\d+)/);
    if (!lngM) lngM = html.match(/longitude['":\s]+(12[5-8]\.\d+)/);
    if (!latM) latM = html.match(/y['":\s]+(3[5-8]\.\d+)/);
    if (!lngM) lngM = html.match(/x['":\s]+(12[5-8]\.\d+)/);
    if (!latM) latM = html.match(/center\s*:\s*\{\s*lat\s*:\s*(3[5-8]\.\d+)/);
    if (!lngM) lngM = html.match(/center\s*:\s*\{[^}]*lng\s*:\s*(12[5-8]\.\d+)/);
    if (!latM) latM = html.match(/LatLng\(\s*(3[5-8]\.\d+)/);
    if (!lngM) lngM = html.match(/LatLng\(\s*3[5-8]\.\d+\s*,\s*(12[5-8]\.\d+)/);
    if (!latM) latM = html.match(/['"]?(3[5-8]\.\d{4,})['"]?\s*,\s*['"]?(12[5-8]\.\d{4,})/);
    if (!lngM && latM && latM[2]) lngM = [null, latM[2]];
    if (latM) d.lat = parseFloat(latM[1]);
    if (lngM) d.lng = parseFloat(lngM[1]);

    return d;
  }

  // ═══════════ 연락처 AJAX 조회 (연락처보기 버튼과 동일) ═══════════
  // 반환: { phone: '050x-xxxx-xxxx', role: '임대인' } or null
  async function fetchContactForListing(sourceId) {
    try {
      var url = '/v4/ajax/ajax_contact_info_gongsil.asp?Ridx=' + sourceId + '&Gubun=101&Refill=0';
      var resp = await fetch(url, { credentials: 'include' });
      var html = await resp.text();
      // 역할 추출: "임대인", "관리사무소", "중개사", "담당자" 등
      var role = '임대인'; // 기본값
      var roleM = html.match(/(임대인|관리인|관리사무소|담당자|중개사|사장|관리실|소유자|건물주)/);
      if (roleM) role = roleM[1];
      // 050 안심번호 우선
      var safe050 = html.match(/050\d[-]?\d{3,4}[-]?\d{4}/);
      if (safe050) return { phone: safe050[0], role: role };
      // 일반 연락처 (대표번호 제외)
      var GSC_GENERIC = ['025486056', '0215339580', '16445510'];
      var phones = html.match(/0\d{1,3}[-)\s]?\d{3,4}[-\s]?\d{4}/g);
      if (phones) {
        for (var i = 0; i < phones.length; i++) {
          var norm = phones[i].replace(/[-\s)]/g, '');
          var isGeneric = GSC_GENERIC.some(function(g) { return norm === g; });
          if (!isGeneric) return { phone: phones[i], role: role };
        }
      }
      return null;
    } catch(e) {
      console.log('[GSC] 연락처 조회 실패 (' + sourceId + '):', e.message);
      return null;
    }
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
      data.status = '공개';

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
  console.log('║  GSC Full Crawler v7.0 (Admin API)    ║');
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

      // 2.5단계: 연락처 AJAX 조회 (연락처보기 API)
      console.log('  연락처 조회 중...');
      for (var ci2 = 0; ci2 < pageItems.length; ci2++) {
        var contactInfo = await fetchContactForListing(pageItems[ci2].source_id);
        if (contactInfo) {
          pageItems[ci2].contact = contactInfo.phone;
          pageItems[ci2].contact_role = contactInfo.role || '임대인';
          console.log('    [' + pageItems[ci2].source_id + '] 연락처: ' + contactInfo.phone + ' (' + contactInfo.role + ')');
        } else {
          console.log('    [' + pageItems[ci2].source_id + '] 연락처 없음');
        }
        await sleep(300);
      }
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
  console.log('║  GSC Crawler v7.0 완료                ║');
  console.log('║  총 파싱: ' + results.length + '건                     ║');
  console.log('║  업로드: ' + uploaded + ' | 건너뜀: ' + skipped + ' | 실패: ' + failed + '  ║');
  console.log('║  상세 성공: ' + detailOk + ' | 상세 실패: ' + detailFail + '    ║');
  console.log('╚═══════════════════════════════════════╝');
  return results;
})();
