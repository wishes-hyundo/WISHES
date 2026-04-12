/**
 * 온하우스(www.onhouse.com) 전체 필드 크롤러
 * 실행: www.onhouse.com 탭에서 Chrome DevTools Console에 붙여넣기
 * 전제: 로그인 상태
 */
(async function ONHOUSE_CRAWLER() {
  const UPLOAD = true;
  const LIMIT = 9999;
  const DELAY_MS = 600;

  // Supabase 직접 접근 (8개 신규 필드용)
  const SUPABASE_URL = 'https://xbjgdsyukjdkfvcbzmjc.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhiamdkc3l1a2pka2Z2Y2J6bWpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzYxODcsImV4cCI6MjA4OTkxMjE4N30.htuaYUP5Z6UeMJQ-4heTyJ1YBLy9SSQYclMm7ZYR_-4';
  const NEW_FIELDS = ['gu', 'entrance_type', 'features', 'parking_fee', 'building_purpose', 'previous_brand', 'commission_fee', 'special_notes'];

  // --- 타입 매핑 ---
  const TYPE_MAP = {
    '오픈형원룸': '원룸', '분리형원룸': '원룸', '1.5룸': '원룸', '복층형원룸': '원룸', '원룸': '원룸',
    '투룸': '투룸',
    '쓰리룸': '쓰리룸', '포룸이상': '쓰리룸',
    '오피스텔': '오피스텔', '아파트': '아파트',
    '사무실': '사무실', '상가': '상가',
  };

  function mapType(raw) {
    if (!raw) return '원룸';
    for (const [k, v] of Object.entries(TYPE_MAP)) {
      if (raw.includes(k)) return v;
    }
    return raw;
  }

  function parseBool(val) {
    if (!val) return null;
    const v = String(val).trim();
    if (['가능','있음','있','무료','Y','y','예','풀옵션','대출가능'].includes(v)) return true;
    if (['불가','없음','없','N','n','아니오'].includes(v)) return false;
    return null;
  }

  function extractDong(addr) {
    const m = addr && addr.match(/([가-힣]+(?:동|읍|면|리))/);
    return m ? m[1] : '';
  }

  function extractGu(addr) {
    const m = addr && addr.match(/([가-힣]+구)/);
    return m ? m[1] : '';
  }

  // --- 기존 source_id 조회 (Supabase 직접) ---
  async function getExistingSourceIds() {
    try {
      const r = await fetch(
        SUPABASE_URL + '/rest/v1/listings?source_site=eq.onhouse&select=source_id&limit=10000',
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
      );
      if (!r.ok) return new Set();
      const data = await r.json();
      const ids = new Set(data.map(function(x) { return String(x.source_id); }));
      console.log('[온하우스] 기존 업로드된 source_id: ' + ids.size + '개');
      return ids;
    } catch(e) { return new Set(); }
  }

  // --- 매물 ID 목록 가져오기 ---
  async function fetchListingIds(page) {
    page = page || 1;
    const params = new URLSearchParams({
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

    const r = await fetch('/index.php/dataFunction/rentMapList', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.onhouse.com/index/rent_map',
      },
      body: params.toString(),
      credentials: 'include',
    });

    const html = await r.text();
    var idMatches = html.matchAll(/rent_view\/(\d+)/g);
    var idArr = [];
    for (var m of idMatches) { if (idArr.indexOf(m[1]) === -1) idArr.push(m[1]); }

    // 총 개수 파악
    var totalCount = idArr.length;
    var countM = html.match(/총\s*([\d,]+)\s*건/);
    if (countM) totalCount = parseInt(countM[1].replace(',', ''));

    return { ids: idArr, totalCount: totalCount };
  }

  // --- 상세 페이지 파싱 (100% 필드) ---
  async function parseDetail(listingId) {
    var url = '/index/rent_view/' + listingId;
    var html;
    try {
      var r = await fetch(url, {
        headers: { 'Referer': 'https://www.onhouse.com/index/rent_map' },
        credentials: 'include',
      });
      html = await r.text();
    } catch(e) {
      return null;
    }

    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var d = { source_site: 'onhouse', source_id: String(listingId) };

    // -- 주소 --
    var addrInput = doc.querySelector('input[name="addr"]');
    if (addrInput && addrInput.value && addrInput.value.trim()) {
      d.address = addrInput.value.trim();
    } else {
      var addrSels = ['.addr_title', '.title_addr', '.addr-text', '.room_addr', '.address'];
      for (var si = 0; si < addrSels.length; si++) {
        var el = doc.querySelector(addrSels[si]);
        if (el && el.textContent.trim().length > 5) {
          d.address = el.textContent.trim();
          break;
        }
      }
    }
    if (d.address) {
      d.dong = extractDong(d.address);
      d.gu = extractGu(d.address);
    }

    // -- 상세주소 (동/호수) --
    var phoneBox = doc.querySelector('.phoneViewBox, .phone_view_box, .phone-view-box');
    if (phoneBox) {
      phoneBox.querySelectorAll('h6').forEach(function(h) {
        var t = h.textContent.trim();
        if (t && t !== d.address && /\d+층|\d+호/.test(t)) {
          d.address_detail = t;
        }
      });
    }

    // -- topMainBodyArea bodyBox 전체 순회 (핵심 정보) --
    var topArea = doc.querySelector('.topMainBodyArea');
    if (topArea) {
      topArea.querySelectorAll('.bodyBox').forEach(function(box) {
        var titleEl = box.querySelector('.box_title');
        var descEl  = box.querySelector('.box_desc');
        var subEl   = box.querySelector('.box_sub');
        if (!titleEl || !descEl) return;

        var title = titleEl.textContent.trim();
        var desc  = descEl.textContent.trim();
        var sub   = subEl ? subEl.textContent.replace(/\s+/g, ' ').trim() : '';
        var classes = titleEl.className || '';

        // -- 거래유형 (blue_bold) --
        if (classes.indexOf('blue_bold') !== -1) {
          d.deal = title;
          var priceNums = desc.replace(/[,\s]/g, '').match(/[\d.]+/g);
          if (title === '전세' && priceNums) d.deposit = Math.round(parseFloat(priceNums[0]));
          else if (title === '매매' && priceNums) { d.price = Math.round(parseFloat(priceNums[0])); d.deposit = 0; }
          else if (title === '월세' && priceNums && priceNums.length >= 2) {
            d.deposit = Math.round(parseFloat(priceNums[0]));
            d.monthly = Math.round(parseFloat(priceNums[1]));
          } else if (title === '단기' && priceNums && priceNums.length >= 2) {
            d.deposit = Math.round(parseFloat(priceNums[0]));
            d.monthly = Math.round(parseFloat(priceNums[1]));
            d.lease_period = '단기';
          }
          var typeM = sub.match(/(오픈형원룸|분리형원룸|1\.5룸|복층형원룸|투룸|쓰리룸|포룸이상|오피스텔|아파트|사무실|상가|원룸)/);
          if (typeM) d.type = mapType(typeM[1]);
          var yrM = sub.match(/(\d{4})년/);
          if (yrM) d.built_year = yrM[1];
        }
        // -- 관리비 --
        else if (title.indexOf('관리비') !== -1 && title.indexOf('항목') !== -1) {
          d.maintenance_includes = desc.split(/[,/]/).map(function(s){return s.trim();}).filter(Boolean);
          if (sub) {
            var subItems = sub.split(/[,/]/).map(function(s){return s.trim();}).filter(Boolean);
            d.maintenance_includes = d.maintenance_includes.concat(subItems);
            d.maintenance_includes = d.maintenance_includes.filter(function(v, i, a) { return a.indexOf(v) === i; });
          }
        }
        else if (title.indexOf('관리비') !== -1 && !d.maintenance_fee) {
          var mfM = desc.match(/([\d.]+)/);
          if (mfM) d.maintenance_fee = Math.round(parseFloat(mfM[1]));
        }
        // -- 면적 --
        else if (title.indexOf('전용면적') !== -1) {
          var aM = desc.match(/([\d.]+)/);
          if (aM) d.area_m2 = parseFloat(aM[1]);
        }
        else if (title.indexOf('공급면적') !== -1 || title.indexOf('임대면적') !== -1) {
          var asM = desc.match(/([\d.]+)/);
          if (asM) d.area_supply_m2 = parseFloat(asM[1]);
        }
        else if (title.indexOf('대지면적') !== -1) {
          var alM = desc.match(/([\d.]+)/);
          if (alM) d.area_land_m2 = parseFloat(alM[1]);
        }
        // -- 층 --
        else if (title.indexOf('해당층') !== -1 || (title.indexOf('층') !== -1 && title.indexOf('전체') !== -1)) {
          var parts = desc.replace(/층/g, '').match(/(\w+)\s*[\/~|]\s*(\w+)/);
          if (parts) { d.floor_current = parts[1]; d.floor_total = parts[2]; }
          else { var flM = desc.match(/(\w+)/); if (flM) d.floor_current = flM[1]; }
        }
        // -- 방/욕실 --
        else if (title.indexOf('방수') !== -1 && title.indexOf('욕실') !== -1) {
          var nums = desc.match(/(\d+)/g);
          if (nums) { d.rooms = parseInt(nums[0]); if (nums[1]) d.bathrooms = parseInt(nums[1]); }
        }
        // -- 입주가능일 --
        else if (title.indexOf('입주가능일') !== -1 || title.indexOf('입주일') !== -1) {
          d.available_date = desc;
        }
        // -- 임대기간 --
        else if (title.indexOf('임대기간') !== -1 && !d.lease_period) {
          d.lease_period = desc;
        }
        // -- 옵션 --
        else if (title.indexOf('옵션') !== -1) {
          d.features = desc.split(/[,/·\s]+/).map(function(s){return s.trim();}).filter(function(s){return s.length > 1;});
        }
        // -- 방향 --
        else if (title.indexOf('방향') !== -1) { d.direction = desc; }
        // -- 난방 --
        else if (title.indexOf('난방') !== -1) { d.heating_type = desc; }
        // -- 출입구 --
        else if (title.indexOf('출입구') !== -1 || title.indexOf('현관') !== -1) { d.entrance_type = desc; }
        // -- 사용승인/건축년도 --
        else if (title.indexOf('사용승인') !== -1) {
          d.usage_approved = desc.replace(/[-\s]/g, '');
          var yr2 = desc.match(/(\d{4})/);
          if (yr2 && !d.built_year) d.built_year = yr2[1];
        }
        else if (title.indexOf('건물명') !== -1 || title.indexOf('단지명') !== -1) { d.building_name = desc; }
        // -- 지하철 --
        else if (title.indexOf('역') !== -1 || title.indexOf('지하철') !== -1) {
          var sm = desc.match(/(.+역)/);
          var dm = desc.match(/(\d+)m/);
          if (sm) d.station_name = sm[1];
          if (dm) d.station_distance = parseInt(dm[1]);
        }
        // -- 권리금 --
        else if (title.indexOf('시설권리금') !== -1 || title.indexOf('굿윌') !== -1) {
          var gm = desc.match(/([\d,]+)/);
          if (gm) d.goodwill_fee = parseInt(gm[1].replace(/,/g,''));
        }
        else if (title.indexOf('권리금') !== -1 && !d.rights_fee) {
          var rm = desc.match(/([\d,]+)/);
          if (rm) d.rights_fee = parseInt(rm[1].replace(/,/g,''));
        }
        // -- 부가세 --
        else if (title.indexOf('부가세') !== -1) { d.vat_included = desc.indexOf('포함') !== -1; }
        // -- 주차비 --
        else if (title.indexOf('주차비') !== -1) {
          var pfm = desc.match(/([\d.]+)/);
          if (pfm) d.parking_fee = Math.round(parseFloat(pfm[1]));
        }
        else if (title.indexOf('주차대수') !== -1) {
          var psm = desc.match(/(\d+)/);
          if (psm) d.parking_spaces = parseInt(psm[1]);
        }
        // -- 건물용도 --
        else if (title.indexOf('건물용도') !== -1 || (title.indexOf('용도') !== -1 && title.indexOf('임대') === -1)) {
          d.building_purpose = desc;
        }
        // -- 업종 --
        else if (title.indexOf('권장업종') !== -1) d.recommended_business = desc;
        else if (title.indexOf('제한업종') !== -1) d.restricted_business = desc;
        else if (title.indexOf('이전상호') !== -1) d.previous_brand = desc;
        else if (title.indexOf('이전업종') !== -1) d.previous_business = desc;
        // -- 전기용량 --
        else if (title.indexOf('전기용량') !== -1 || title.indexOf('전기') !== -1) {
          d.electric_capacity = desc.trim();
        }
        // -- 간판 --
        else if (title.indexOf('간판') !== -1) {
          var b = parseBool(desc); if (b !== null) d.signage_available = b;
        }
        // -- 회의실 --
        else if (title.indexOf('회의실') !== -1) {
          var mrm = desc.match(/(\d+)/);
          if (mrm) d.meeting_room = parseInt(mrm[1]);
          else { var b2 = parseBool(desc); if (b2 === true) d.meeting_room = 1; }
        }
        // -- 수수료 --
        else if (title.indexOf('수수료') !== -1) {
          var cm = desc.match(/([\d,]+)/);
          if (cm) d.commission_fee = parseInt(cm[1].replace(/,/g,''));
        }
        // -- 특이사항 --
        else if (title.indexOf('특이사항') !== -1) { d.special_notes = desc; }
        // -- 업종(상업) --
        else if (title.indexOf('업종') !== -1 && title.indexOf('이전') === -1 && title.indexOf('권장') === -1 && title.indexOf('제한') === -1) {
          d.business_type = desc;
        }
      });
    }

    // -- bodyBottom 백업 (방/욕실/옵션) --
    var bottom = doc.querySelector('.bodyBottom');
    if (bottom) {
      bottom.querySelectorAll('.bodyBox').forEach(function(box) {
        var titleEl = box.querySelector('.box_title');
        var descEl  = box.querySelector('.box_desc');
        if (!titleEl || !descEl) return;
        var title = titleEl.textContent.trim();
        var desc  = descEl.textContent.trim();
        if (title.indexOf('방수') !== -1 && title.indexOf('욕실') !== -1 && !d.rooms) {
          var nums = desc.match(/(\d+)/g);
          if (nums) { d.rooms = parseInt(nums[0]); if (nums[1]) d.bathrooms = parseInt(nums[1]); }
        } else if (title.indexOf('옵션') !== -1 && !d.features) {
          d.features = desc.split(/[,/·\s]+/).map(function(s){return s.trim();}).filter(function(s){return s.length > 1;});
        }
      });
    }

    // -- flex 섹션 (주차/엘리베이터/대출/반려동물/발코니/풀옵션) --
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
        if (val === '가능') d.loan_available = true;
        else if (val === '불가') d.loan_available = false;
      } else if (label.indexOf('반려동물') !== -1) {
        var b3 = parseBool(val); if (b3 !== null) d.pet = b3;
      } else if (label.indexOf('발코니') !== -1) {
        var b4 = parseBool(val); if (b4 !== null) d.balcony = b4;
      } else if (label.indexOf('풀옵션') !== -1) {
        var b5 = parseBool(val); if (b5 !== null) d.full_option = b5;
      }
    });

    // -- 설명 텍스트 --
    var descSels = ['.detail-desc', '.room-desc', '.content-desc', '#divDesc', '.desc_area', '.view_desc', '.memo', '.item_desc', '.detail_content', '.info_desc'];
    for (var di = 0; di < descSels.length; di++) {
      var el = doc.querySelector(descSels[di]);
      if (el) {
        var t = el.textContent.trim();
        if (t.length > 30) { d.description = t.substring(0, 2000); break; }
      }
    }

    // -- 이미지 --
    var imgs = [];
    doc.querySelectorAll('img[src*="listing"], img[src*="photo"], img[src*="rent"]').forEach(function(img) {
      var src = img.src;
      if (src && src.indexOf('thumb_s') === -1 && (src.indexOf('.jpg') !== -1 || src.indexOf('.png') !== -1 || src.indexOf('.webp') !== -1)) {
        if (imgs.indexOf(src) === -1) imgs.push(src);
      }
    });
    // onhouse photo URLs from raw HTML
    var imgRegex = /https:\/\/[^"']+(?:listing|photo|rent)[^"']*\.(?:jpg|png|webp)/gi;
    var imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      if (imgs.indexOf(imgMatch[0]) === -1) imgs.push(imgMatch[0]);
    }
    if (imgs.length > 0) d.images = imgs.slice(0, 20);

    // -- 연락처 --
    var phones = html.match(/050\d[-]\d{3,4}[-]\d{4}|0\d{1,2}[-]\d{3,4}[-]\d{4}/g);
    if (phones) d.contact = phones[0];

    // -- source_url --
    d.source_url = 'https://www.onhouse.com/index/rent_view/' + listingId;

    // -- 위치 좌표 (lat/lng) --
    var latM = html.match(/"lat(?:itude)?"\s*:\s*"?(3[67]\.\d+)"?/);
    var lngM = html.match(/"ln?g(?:itude)?"\s*:\s*"?(12[67]\.\d+)"?/);
    if (latM) d.lat = parseFloat(latM[1]);
    if (lngM) d.lng = parseFloat(lngM[1]);

    // -- 기본값 정리 --
    if (!d.deal) {
      if (d.monthly && d.monthly > 0) d.deal = '월세';
      else if (d.deposit && !d.monthly) d.deal = '전세';
      else d.deal = '월세';
    }
    if (!d.type) d.type = '원룸';
    if (!d.area_m2) {
      if (d.area_supply_m2) d.area_m2 = d.area_supply_m2 * 0.8;
      else d.area_m2 = 0.1;
    }

    // -- title 생성 --
    var dn = d.dong || '';
    var dealStr = d.deal === '월세' ? '월세' : d.deal === '전세' ? '전세' : '매매';
    d.title = d.building_name
      ? (dn + ' ' + d.building_name + ' ' + d.type)
      : (dn + ' ' + dealStr + ' ' + d.type);
    if (d.title.length > 30) d.title = d.title.substring(0, 30);

    return d;
  }

  // --- 업로드 (Supabase 직접 INSERT + listing_images + listing_features) ---
  async function uploadListing(data) {
    try {
      var images = data.images || [];
      var featuresList = data.features || [];
      var listingData = {};
      for (var k in data) { if (k !== 'images') listingData[k] = data[k]; }
      listingData.status = '가용';

      // Step 1: INSERT listing
      var r = await fetch(SUPABASE_URL + '/rest/v1/listings', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(listingData),
      });
      var resp = await r.json();
      if (!r.ok) return { ok: false, error: JSON.stringify(resp).substring(0, 100) };
      var dbId = resp[0] ? resp[0].id : null;
      if (!dbId) return { ok: true, id: null };

      // Step 2: INSERT images
      if (images.length > 0) {
        var imgInserts = images.slice(0, 20).map(function(url, idx) {
          return {
            listing_id: dbId, url: url, alt: (listingData.title || '') + ' ' + (idx+1),
            sort_order: idx, is_thumbnail: idx === 0,
          };
        });
        fetch(SUPABASE_URL + '/rest/v1/listing_images', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(imgInserts),
        }).catch(function(e) { console.warn('이미지 저장 실패:', e.message); });
      }

      // Step 3: INSERT features
      if (featuresList.length > 0) {
        var featInserts = featuresList.map(function(f) { return { listing_id: dbId, feature: String(f) }; });
        fetch(SUPABASE_URL + '/rest/v1/listing_features', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(featInserts),
        }).catch(function(e) { console.warn('옵션 저장 실패:', e.message); });
      }

      return { ok: true, id: dbId };
    } catch(e) { return { ok: false, error: e.message }; }
  }

  // --- 메인 실행 ---
  console.log('=== 온하우스 전체 필드 크롤러 시작 ===');
  console.log('설정: UPLOAD=' + UPLOAD + ', LIMIT=' + LIMIT);

  var existingIds = UPLOAD ? await getExistingSourceIds() : new Set();
  var allResults = [];
  var uploaded = 0, skipped = 0, failed = 0;
  var page = 1;
  var hasMore = true;

  while (hasMore && allResults.length < LIMIT) {
    console.log('\n[페이지 ' + page + '] 목록 로딩...');
    var ids = [];
    try {
      var result = await fetchListingIds(page);
      ids = result.ids;
      console.log('  ' + ids.length + '개 ID 발견');
      if (ids.length === 0) { hasMore = false; break; }
    } catch(e) {
      console.error('  목록 로딩 실패: ' + e.message);
      hasMore = false;
      break;
    }

    for (var ii = 0; ii < ids.length; ii++) {
      var id = ids[ii];
      if (allResults.length >= LIMIT) break;
      if (existingIds.has(String(id))) { skipped++; continue; }

      var data = await parseDetail(id);
      await new Promise(function(resolve) { setTimeout(resolve, DELAY_MS); });

      if (!data || !data.deal) {
        console.log('  [' + id + '] 파싱 실패');
        failed++;
        continue;
      }

      var fieldCount = Object.keys(data).filter(function(k) {
        return ['source_site','source_id','source_url','title'].indexOf(k) === -1 && data[k] !== null && data[k] !== undefined;
      }).length;
      console.log('  [' + id + '] ' + fieldCount + ' fields | ' + (data.address || '').substring(0,25) + ' | ' + data.deal + ' ' + data.deposit + '/' + data.monthly);
      allResults.push(data);

      if (UPLOAD) {
        var upResult = await uploadListing(data);
        if (upResult.ok) {
          uploaded++;
          var newSaved = NEW_FIELDS.filter(function(f) { return data[f] !== undefined && data[f] !== null; });
          console.log('    OK (id=' + upResult.id + ') new: ' + (newSaved.join(', ') || 'none'));
        } else {
          failed++;
          console.log('    FAIL: ' + upResult.error);
        }
      }
    }

    page++;
    if (ids.length < 10) { hasMore = false; }
  }

  console.log('\n========================================');
  console.log('=== onhouse crawler done ===');
  console.log('Parsed: ' + allResults.length);
  console.log('Upload: ' + uploaded + ' | Skip: ' + skipped + ' | Fail: ' + failed);
  console.log('========================================');
  return allResults;
})();
