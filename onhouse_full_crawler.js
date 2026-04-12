/**
 * 온하우스(www.onhouse.com) 크롤러 v3.2
 * 실행: www.onhouse.com/index/rent_map 탭에서 Chrome DevTools Console에 붙여넣기
 * 전제: 로그인 상태
 *
 * v3.2 주요 변경:
 *   - 상세설명: .item_view_detail.detail h6 셀렉터 추가 (실제 구조 반영)
 *   - 방향: 전용면적 box_sub에서 추출
 *   - 관리비/포함항목 복합 타이틀: desc=금액, sub=포함항목 정확 분리
 *   - 가격 단위: 만원 그대로 저장
 */
(async function ONHOUSE_CRAWLER() {
  // ═══════════ 설정 ═══════════
  var API_URL = 'https://wishes.co.kr/api/admin/listings';
  var API_TOKEN = 'wishes2026';
  var LIMIT = 999999;
  var DELAY_MS = 600;

  // ═══════════ 타입 매핑 ═══════════
  var TYPE_MAP = {
    '오픈형원룸': '원룸', '분리형원룸': '원룸', '1.5룸': '원룸', '복층형원룸': '원룸', '원룸': '원룸',
    '투룸': '투룸', '쓰리룸': '쓰리룸', '포룸이상': '쓰리룸',
    '오피스텔': '오피스텔', '아파트': '아파트', '사무실': '사무실', '상가': '상가',
  };
  function mapType(raw) {
    if (!raw) return '원룸';
    for (var k in TYPE_MAP) { if (raw.indexOf(k) !== -1) return TYPE_MAP[k]; }
    return raw;
  }

  function parseBool(val) {
    if (!val) return null;
    var v = String(val).trim();
    if (['가능','있음','있','무료','Y','y','예','풀옵션','대출가능','O'].indexOf(v) !== -1) return true;
    if (['불가','없음','없','N','n','아니오','X'].indexOf(v) !== -1) return false;
    return null;
  }
  function extractDong(addr) { var m = addr && addr.match(/([가-힣]+(?:동|읍|면|리))/); return m ? m[1] : ''; }
  function extractGu(addr) { var m = addr && addr.match(/([가-힣]+구)/); return m ? m[1] : ''; }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  // ═══════════ 기존 source_id 조회 (관리자 API) ═══════════
  async function getExistingSourceIds() {
    try {
      console.log('[온하우스] 기존 매물 ID 조회 중...');
      var r = await fetch(API_URL + '?token=' + API_TOKEN + '&fields=minimal', {
        headers: { 'Accept': 'application/json' }
      });
      if (!r.ok) { console.warn('[온하우스] ID 조회 실패: HTTP ' + r.status); return new Set(); }
      var json = await r.json();
      if (!json.success || !json.data) return new Set();
      var allIds = new Set();
      json.data.forEach(function(item) {
        if (item.source_site === 'onhouse' && item.source_id) {
          allIds.add(String(item.source_id));
        }
      });
      console.log('[온하우스] 기존 source_id: ' + allIds.size + '개');
      return allIds;
    } catch(e) {
      console.error('[온하우스] ID 조회 오류:', e.message);
      return new Set();
    }
  }

  // ═══════════ 매물 ID 목록 가져오기 ═══════════
  async function fetchListingIds(page) {
    page = page || 1;
    var params = new URLSearchParams({
      device: 'pc', showType: '확인일', text: '',
      buildingIdx: '', dongCode: '', bunjiCode: '',
      roomType: 'all', saleType: 'all', structure: 'all',
      tradeType: '', shortTermYn: '', referMinPrice: '', referMaxPrice: '',
      minPrice: '', maxPrice: '', minMonthPrice: '', maxMonthPrice: '',
      managementFeeYn: '', minArea: '', maxArea: '',
      minFloor: '', maxFloor: '', floorArray: '', rooftop: '',
      compYear: 'all', img: 'all', noDeposit: '', fulloption: '',
      noSemiBasement: '', noFirstFloor: '', elevator: '', interior: '',
      noPremiumPrice: '', pet: '', parking: '', roomCnt: 'all',
      cfLoan: '', moveInType: '',
      level: '7', swLat: '37.35', neLat: '37.75', swLng: '126.6', neLng: '127.3',
      status: '거래가능', refer_page: '', is_ins_office: '', zerooption: '',
      view_type: 'hori', from_page: 'rent_map',
      phone: '', jibun_end: '', is_pnu_group: '0', page: String(page),
    });

    var r = await fetch('/index.php/dataFunction/rentMapList', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.onhouse.com/index/rent_map',
      },
      body: params.toString(),
      credentials: 'include',
    });
    var html = await r.text();
    var idMatches = html.matchAll(/rent_view\/(\d+)/g);
    var idArr = [];
    for (var m of idMatches) { if (idArr.indexOf(m[1]) === -1) idArr.push(m[1]); }
    var totalCount = idArr.length;
    var countM = html.match(/총\s*([\d,]+)\s*건/);
    if (countM) totalCount = parseInt(countM[1].replace(',', ''));
    return { ids: idArr, totalCount: totalCount };
  }

  // ═══════════ 상세 페이지 파싱 ═══════════
  async function parseDetail(listingId) {
    var url = '/index/rent_view/' + listingId;
    var html;
    try {
      var r = await fetch(url, {
        headers: { 'Referer': 'https://www.onhouse.com/index/rent_map' },
        credentials: 'include',
      });
      html = await r.text();
    } catch(e) { return null; }

    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var d = { source_site: 'onhouse', source_id: String(listingId) };

    // ── 주소 (층/호수 포함 주소 우선) ──
    // .addr_title에 "관악구 봉천동 972-17  2층 202호" 형태로 층/호 포함됨
    var addrTitleEl = doc.querySelector('.addr_title');
    var addrInput = doc.querySelector('input[name="addr"]');
    var fullAddr = '';
    if (addrTitleEl && addrTitleEl.textContent.trim().length > 5) {
      fullAddr = addrTitleEl.textContent.replace(/\s+/g, ' ').trim();
    }
    var baseAddr = (addrInput && addrInput.value) ? addrInput.value.trim() : '';

    // fullAddr에 층/호 정보가 있으면 사용, 없으면 baseAddr
    if (fullAddr && /\d+층|\d+호/.test(fullAddr)) {
      d.address = fullAddr;
    } else if (baseAddr) {
      d.address = baseAddr;
    } else if (fullAddr) {
      d.address = fullAddr;
    } else {
      var addrSels = ['.title_addr', '.addr-text', '.room_addr', '.address', 'h2.addr', '.info_addr'];
      for (var si = 0; si < addrSels.length; si++) {
        var el = doc.querySelector(addrSels[si]);
        if (el && el.textContent.trim().length > 5) { d.address = el.textContent.trim(); break; }
      }
    }
    if (d.address) { d.dong = extractDong(d.address); d.gu = extractGu(d.address); }

    // ── 상세주소 (별도 층/호 정보) ──
    var phoneBox = doc.querySelector('.phoneViewBox, .phone_view_box, .phone-view-box');
    if (phoneBox) {
      phoneBox.querySelectorAll('h6').forEach(function(h) {
        var t = h.textContent.trim();
        if (t && t !== d.address && /\d+층|\d+호/.test(t)) d.address_detail = t;
      });
    }

    // ── topMainBodyArea 전체 순회 ──
    var topArea = doc.querySelector('.topMainBodyArea');
    if (topArea) {
      topArea.querySelectorAll('.bodyBox').forEach(function(box) {
        var titleEl = box.querySelector('.box_title');
        var descEl = box.querySelector('.box_desc');
        var subEl = box.querySelector('.box_sub');
        if (!titleEl || !descEl) return;
        var title = titleEl.textContent.trim();
        var desc = descEl.textContent.trim();
        var sub = subEl ? subEl.textContent.replace(/\s+/g, ' ').trim() : '';
        var classes = titleEl.className || '';

        // 거래유형 (blue_bold)
        if (classes.indexOf('blue_bold') !== -1) {
          d.deal = title;
          if (d.deal === '단기') d.deal = '월세';
          var priceNums = desc.replace(/[,\s]/g, '').match(/[\d.]+/g);
          if (title === '전세' && priceNums) d.deposit = Math.round(parseFloat(priceNums[0]));
          else if (title === '매매' && priceNums) { d.price = Math.round(parseFloat(priceNums[0])); d.deposit = 0; }
          else if ((title === '월세' || title === '단기') && priceNums && priceNums.length >= 2) {
            d.deposit = Math.round(parseFloat(priceNums[0]));
            d.monthly = Math.round(parseFloat(priceNums[1]));
          }
          var typeM = sub.match(/(오픈형원룸|분리형원룸|1\.5룸|복층형원룸|투룸|쓰리룸|포룸이상|오피스텔|아파트|사무실|상가|원룸)/);
          if (typeM) d.type = mapType(typeM[1]);
          var yrM = sub.match(/(\d{4})년/);
          if (yrM) d.built_year = yrM[1];
          if (title === '단기') d.lease_period = '단기';
        }
        // 관리비 (복합 타이틀 "관리비 / 포함항목" 처리)
        else if (title.indexOf('관리비') !== -1 && title.indexOf('항목') !== -1) {
          // 복합 타이틀: desc = 금액, sub = 포함항목
          var mfM = desc.match(/([\d.]+)/);
          if (mfM) d.maintenance_fee = Math.round(parseFloat(mfM[1]));
          if (sub) {
            d.maintenance_includes = sub.split(/[,/·ㆍ]/).map(function(s){return s.trim();}).filter(function(s){return s.length > 0;});
          }
        }
        else if (title.indexOf('관리비') !== -1 && !d.maintenance_fee) {
          var mfM2 = desc.match(/([\d.]+)/);
          if (mfM2) d.maintenance_fee = Math.round(parseFloat(mfM2[1]));
        }
        // 면적 + 방향 (sub에 "남", "동" 등 방향 포함)
        else if (title.indexOf('전용면적') !== -1) {
          var aM = desc.match(/([\d.]+)/); if (aM) d.area_m2 = parseFloat(aM[1]);
          // sub에서 방향 추출 (예: "남", "동남" 등)
          if (sub) {
            var dirM = sub.match(/(남|북|동|서|남동|남서|북동|북서|정남|정북)/);
            if (dirM) d.direction = dirM[1] + '향';
          }
        }
        else if (title.indexOf('공급면적') !== -1 || title.indexOf('임대면적') !== -1) {
          var asM = desc.match(/([\d.]+)/); if (asM) d.area_supply_m2 = parseFloat(asM[1]);
        }
        else if (title.indexOf('대지면적') !== -1) {
          var alM = desc.match(/([\d.]+)/); if (alM) d.area_land_m2 = parseFloat(alM[1]);
        }
        // 층
        else if (title.indexOf('해당층') !== -1 || (title.indexOf('층') !== -1 && title.indexOf('전체') !== -1)) {
          var parts = desc.replace(/층/g, '').match(/(\w+)\s*[\/~|]\s*(\w+)/);
          if (parts) { d.floor_current = parts[1]; d.floor_total = parts[2]; }
          else { var flM = desc.match(/(\w+)/); if (flM) d.floor_current = flM[1]; }
        }
        // 방/욕실
        else if (title.indexOf('방수') !== -1 && title.indexOf('욕실') !== -1) {
          var nums = desc.match(/(\d+)/g);
          if (nums) { d.rooms = parseInt(nums[0]); if (nums[1]) d.bathrooms = parseInt(nums[1]); }
        }
        // 입주가능일
        else if (title.indexOf('입주가능일') !== -1 || title.indexOf('입주일') !== -1) { d.available_date = desc; }
        // 임대기간
        else if (title.indexOf('임대기간') !== -1 && !d.lease_period) { d.lease_period = desc; }
        // 옵션
        else if (title.indexOf('옵션') !== -1) {
          d.features = desc.split(/[,/·\s]+/).map(function(s){return s.trim();}).filter(function(s){return s.length > 1;});
        }
        // 방향
        else if (title.indexOf('방향') !== -1) { d.direction = desc; }
        // 난방
        else if (title.indexOf('난방') !== -1) { d.heating_type = desc; }
        // 출입구
        else if (title.indexOf('출입구') !== -1 || title.indexOf('현관') !== -1) { d.entrance_type = desc; }
        // 사용승인
        else if (title.indexOf('사용승인') !== -1) {
          d.usage_approved = desc.replace(/[-\s]/g, '');
          var yr2 = desc.match(/(\d{4})/); if (yr2 && !d.built_year) d.built_year = yr2[1];
        }
        // 건물명
        else if (title.indexOf('건물명') !== -1 || title.indexOf('단지명') !== -1) { d.building_name = desc; }
        // 지하철
        else if (title.indexOf('역') !== -1 || title.indexOf('지하철') !== -1) {
          var sm = desc.match(/(.+역)/); var dm = desc.match(/(\d+)m/);
          if (sm) d.station_name = sm[1]; if (dm) d.station_distance = parseInt(dm[1]);
        }
        // 권리금
        else if (title.indexOf('시설권리금') !== -1 || title.indexOf('굿윌') !== -1) {
          var gm = desc.match(/([\d,]+)/); if (gm) d.goodwill_fee = parseInt(gm[1].replace(/,/g,''));
        }
        else if (title.indexOf('권리금') !== -1 && !d.rights_fee) {
          var rfm = desc.match(/([\d,]+)/); if (rfm) d.rights_fee = parseInt(rfm[1].replace(/,/g,''));
        }
        // 부가세
        else if (title.indexOf('부가세') !== -1) { d.vat_included = desc.indexOf('포함') !== -1; }
        // 주차비
        else if (title.indexOf('주차비') !== -1) {
          var pfm = desc.match(/([\d.]+)/); if (pfm) d.parking_fee = Math.round(parseFloat(pfm[1]));
        }
        // 주차대수
        else if (title.indexOf('주차대수') !== -1) {
          var psm = desc.match(/(\d+)/); if (psm) d.parking_spaces = parseInt(psm[1]);
        }
        // 건물용도
        else if (title.indexOf('건물용도') !== -1 || (title.indexOf('용도') !== -1 && title.indexOf('임대') === -1)) { d.building_purpose = desc; }
        // 업종
        else if (title.indexOf('권장업종') !== -1) d.recommended_business = desc;
        else if (title.indexOf('제한업종') !== -1) d.restricted_business = desc;
        else if (title.indexOf('이전상호') !== -1) d.previous_brand = desc;
        else if (title.indexOf('이전업종') !== -1) d.previous_business = desc;
        // 전기용량
        else if (title.indexOf('전기용량') !== -1 || title.indexOf('전기') !== -1) { d.electric_capacity = desc.trim(); }
        // 간판
        else if (title.indexOf('간판') !== -1) { var b = parseBool(desc); if (b !== null) d.signage_available = b; }
        // 회의실
        else if (title.indexOf('회의실') !== -1) {
          var mrm = desc.match(/(\d+)/);
          if (mrm) d.meeting_room = parseInt(mrm[1]);
          else { var b2 = parseBool(desc); if (b2 === true) d.meeting_room = 1; }
        }
        // 수수료
        else if (title.indexOf('수수료') !== -1) {
          var cm = desc.match(/([\d,]+)/); if (cm) d.commission_fee = parseInt(cm[1].replace(/,/g,''));
        }
        // 특이사항
        else if (title.indexOf('특이사항') !== -1) { d.special_notes = desc; }
        // 업종(일반)
        else if (title.indexOf('업종') !== -1 && title.indexOf('이전') === -1 && title.indexOf('권장') === -1 && title.indexOf('제한') === -1) {
          d.business_type = desc;
        }
      });
    }

    // ── bodyBottom 백업 ──
    var bottom = doc.querySelector('.bodyBottom');
    if (bottom) {
      bottom.querySelectorAll('.bodyBox').forEach(function(box) {
        var titleEl = box.querySelector('.box_title');
        var descEl = box.querySelector('.box_desc');
        if (!titleEl || !descEl) return;
        var title = titleEl.textContent.trim();
        var desc = descEl.textContent.trim();
        if (title.indexOf('방수') !== -1 && title.indexOf('욕실') !== -1 && !d.rooms) {
          var nums = desc.match(/(\d+)/g);
          if (nums) { d.rooms = parseInt(nums[0]); if (nums[1]) d.bathrooms = parseInt(nums[1]); }
        } else if (title.indexOf('옵션') !== -1 && !d.features) {
          d.features = desc.split(/[,/·\s]+/).map(function(s){return s.trim();}).filter(function(s){return s.length > 1;});
        }
      });
    }

    // ── flex 섹션 (주차/엘리베이터/대출 등) ──
    doc.querySelectorAll('.flex_title').forEach(function(ft) {
      var label = ft.textContent.trim();
      var fd = ft.nextElementSibling;
      if (!fd || !fd.classList || !fd.classList.contains('flex_desc')) {
        fd = ft.parentElement ? ft.parentElement.querySelector('.flex_desc') : null;
      }
      var val = fd ? fd.textContent.trim() : '';

      if (label.indexOf('주차') !== -1 && label.indexOf('비') === -1 && label.indexOf('대수') === -1) {
        var b = parseBool(val); if (b !== null) d.parking = b;
      } else if (label.indexOf('엘리베이터') !== -1) {
        var b2 = parseBool(val); if (b2 !== null) d.elevator = b2;
      } else if (label.indexOf('전세대출') !== -1 || label.indexOf('대출') !== -1) {
        if (val === '가능') d.loan_available = true; else if (val === '불가') d.loan_available = false;
      } else if (label.indexOf('반려동물') !== -1) {
        var b3 = parseBool(val); if (b3 !== null) d.pet = b3;
      } else if (label.indexOf('발코니') !== -1) {
        var b4 = parseBool(val); if (b4 !== null) d.balcony = b4;
      } else if (label.indexOf('풀옵션') !== -1) {
        var b5 = parseBool(val); if (b5 !== null) d.full_option = b5;
      }
    });

    // ── 설명 텍스트 ──
    // 온하우스 상세설명: .item_view_detail.detail 내 h6 태그
    var detailSection = doc.querySelector('.item_view_detail.detail');
    if (detailSection) {
      var descH6 = detailSection.querySelector('h6');
      if (descH6) {
        var descText = descH6.textContent.trim();
        if (descText.length > 2) d.description = descText.substring(0, 2000);
      }
    }
    // 폴백: 기존 셀렉터
    if (!d.description) {
      var descSels = ['.detail-desc', '.room-desc', '.content-desc', '#divDesc', '.desc_area', '.view_desc', '.memo', '.item_desc', '.detail_content', '.info_desc'];
      for (var di = 0; di < descSels.length; di++) {
        var descEl = doc.querySelector(descSels[di]);
        if (descEl) { var t = descEl.textContent.trim(); if (t.length > 10) { d.description = t.substring(0, 2000); break; } }
      }
    }

    // ── 연락처 (050 안심번호 우선) ──
    var phones050 = html.match(/050\d[-]?\d{3,4}[-]?\d{4}/g);
    if (phones050) {
      d.contact = phones050[0];
    } else {
      // 프린트 페이지에서 연락처 가져오기
      try {
        var printR = await fetch('/index/rent_view_print/' + listingId + '?phone=Y', {
          headers: { 'Referer': 'https://www.onhouse.com/index/rent_view/' + listingId },
          credentials: 'include',
        });
        var printHtml = await printR.text();
        var printPhones = printHtml.match(/050\d[-]?\d{3,4}[-]?\d{4}/g);
        if (printPhones) d.contact = printPhones[0];
        // 프린트 페이지에서 추가 정보도 추출
        if (!d.contact) {
          var anyPhones = printHtml.match(/0\d{1,2}[-)\s]?\d{3,4}[-\s]?\d{4}/g);
          if (anyPhones) d.contact = anyPhones[0];
        }
      } catch(e) { /* 프린트 페이지 접근 실패 무시 */ }
    }

    // ── source_url ──
    d.source_url = 'https://www.onhouse.com/index/rent_view/' + listingId;

    // ── 위치 좌표 (lat/lng) — 다중 패턴 ──
    // 1) JSON 패턴
    var latM = html.match(/"lat(?:itude)?"\s*:\s*"?(3[5-8]\.\d+)"?/);
    var lngM = html.match(/"ln?g(?:itude)?"\s*:\s*"?(12[5-8]\.\d+)"?/);
    // 2) input hidden 패턴
    if (!latM) { var latInput = doc.querySelector('input[name="lat"], input[name="latitude"], input[id*="lat"]'); if (latInput && latInput.value) latM = latInput.value.match(/(3[5-8]\.\d+)/); }
    if (!lngM) { var lngInput = doc.querySelector('input[name="lng"], input[name="longitude"], input[id*="lng"]'); if (lngInput && lngInput.value) lngM = lngInput.value.match(/(12[5-8]\.\d+)/); }
    // 3) data-* 속성
    if (!latM) { var mapEl = doc.querySelector('[data-lat], [data-latitude]'); if (mapEl) { var v = mapEl.getAttribute('data-lat') || mapEl.getAttribute('data-latitude'); if (v) latM = v.match(/(3[5-8]\.\d+)/); } }
    if (!lngM) { var mapEl2 = doc.querySelector('[data-lng], [data-longitude]'); if (mapEl2) { var v2 = mapEl2.getAttribute('data-lng') || mapEl2.getAttribute('data-longitude'); if (v2) lngM = v2.match(/(12[5-8]\.\d+)/); } }
    // 4) 스크립트 내 변수 패턴
    if (!latM) latM = html.match(/(?:var|let|const)\s+lat\w*\s*=\s*['"]?(3[5-8]\.\d+)/);
    if (!lngM) lngM = html.match(/(?:var|let|const)\s+l(?:n|o)g\w*\s*=\s*['"]?(12[5-8]\.\d+)/);
    // 5) 네이버/카카오 지도 initMap 패턴
    if (!latM) latM = html.match(/LatLng\(\s*(3[5-8]\.\d+)/);
    if (!lngM) lngM = html.match(/LatLng\(\s*3[5-8]\.\d+\s*,\s*(12[5-8]\.\d+)/);
    // 6) 일반 숫자 패턴 (마지막 수단)
    if (!latM) latM = html.match(/['"]?(3[5-8]\.\d{4,})['"]?\s*,\s*['"]?(12[5-8]\.\d{4,})/);
    if (!lngM && latM) { var afterLat = html.substring(html.indexOf(latM[0])); lngM = afterLat.match(/(12[5-8]\.\d{4,})/); }

    if (latM) d.lat = parseFloat(latM[1] || latM[0]);
    if (lngM) d.lng = parseFloat(lngM[1] || lngM[0]);

    // ── 기본값 정리 ──
    if (!d.deal) {
      if (d.monthly && d.monthly > 0) d.deal = '월세';
      else if (d.deposit && !d.monthly) d.deal = '전세';
      else d.deal = '월세';
    }
    if (d.deal === '단기') d.deal = '월세';
    if (!d.type) d.type = '원룸';
    if (!d.area_m2) {
      if (d.area_supply_m2) d.area_m2 = Math.round(d.area_supply_m2 * 0.8 * 100) / 100;
      else d.area_m2 = 0;
    }

    // title 생성
    var dn = d.dong || '';
    d.title = d.building_name
      ? (dn + ' ' + d.building_name + ' ' + d.type)
      : (dn + ' ' + d.deal + ' ' + d.type);
    if (d.title.length > 30) d.title = d.title.substring(0, 30);

    return d;
  }

  // ═══════════ 업로드 (관리자 API) ═══════════
  async function uploadListing(data) {
    try {
      data.status = '가용';
      if (!data.dong) data.dong = extractDong(data.address) || '미입력';

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
  console.log('║  온하우스 크롤러 v3.2 (Admin API)     ║');
  console.log('║  LIMIT=' + LIMIT + '                         ║');
  console.log('╚═══════════════════════════════════════╝');

  var existingIds = await getExistingSourceIds();
  var allResults = [];
  var uploaded = 0, skipped = 0, failed = 0;
  var page = 1;
  var hasMore = true;
  var emptyPages = 0;

  while (hasMore && allResults.length < LIMIT) {
    console.log('\n━━━ [페이지 ' + page + '] 목록 로딩... ━━━');
    var ids = [];
    try {
      var result = await fetchListingIds(page);
      ids = result.ids;
      console.log('  ' + ids.length + '개 ID 발견 (총 ' + result.totalCount + '건)');
      if (ids.length === 0) {
        emptyPages++;
        if (emptyPages >= 2) { hasMore = false; break; }
        page++; continue;
      }
      emptyPages = 