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

  // ─── 타입 매핑 ───
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

  // ─── 기존 source_id 조회 (Supabase 직접) ───
  async function getExistingSourceIds() {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/listings?source_site=eq.onhouse&select=source_id&limit=10000`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (!r.ok) return new Set();
      const data = await r.json();
      const ids = new Set(data.map(x => String(x.source_id)));
      console.log(`[온하우스] 기존 업로드된 source_id: ${ids.size}개`);
      return ids;
    } catch { return new Set(); }
  }

  // ─── 매물 ID 목록 가져오기 ───
  async function fetchListingIds(page = 1) {
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
    const ids = [...new Set([...html.matchAll(/rent_view\/(\d+)/g)].map(m => m[1]))];

    // 총 개수 파악
    let totalCount = ids.length;
    const countM = html.match(/총\s*([\d,]+)\s*건/);
    if (countM) totalCount = parseInt(countM[1].replace(',', ''));

    return { ids, totalCount };
  }

  // ─── 상세 페이지 파싱 (100% 필드) ───
  async function parseDetail(listingId) {
    const url = `/index/rent_view/${listingId}`;
    let html;
    try {
      const r = await fetch(url, {
        headers: { 'Referer': 'https://www.onhouse.com/index/rent_map' },
        credentials: 'include',
      });
      html = await r.text();
    } catch(e) {
      return null;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const d = { source_site: 'onhouse', source_id: String(listingId) };

    // ─ 주소 ─
    const addrInput = doc.querySelector('input[name="addr"]');
    if (addrInput?.value?.trim()) {
      d.address = addrInput.value.trim();
    } else {
      for (const sel of ['.addr_title', '.title_addr', '.addr-text', '.room_addr', '.address']) {
        const el = doc.querySelector(sel);
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

    // ─ 상세주소 (동/호수) ─
    const phoneBox = doc.querySelector('.phoneViewBox, .phone_view_box, .phone-view-box');
    if (phoneBox) {
      phoneBox.querySelectorAll('h6').forEach(h => {
        const t = h.textContent.trim();
        if (t && t !== d.address && /\d+층|\d+호/.test(t)) {
          d.address_detail = t;
        }
      });
    }

    // ─ topMainBodyArea bodyBox 전체 순회 (핵심 정보) ─
    const topArea = doc.querySelector('.topMainBodyArea');
    if (topArea) {
      topArea.querySelectorAll('.bodyBox').forEach(box => {
        const titleEl = box.querySelector('.box_title');
        const descEl  = box.querySelector('.box_desc');
        const subEl   = box.querySelector('.box_sub');
        if (!titleEl || !descEl) return;

        const title = titleEl.textContent.trim();
        const desc  = descEl.textContent.trim();
        const sub   = subEl ? subEl.textContent.replace(/\s+/g, ' ').trim() : '';
        const classes = titleEl.className || '';

        // ─ 거래유형 (blue_bold) ─
        if (classes.includes('blue_bold')) {
          d.deal = title;
          const priceNums = desc.replace(/[,\s]/g, '').match(/[\d.]+/g);
          if (title === '전세' && priceNums) d.deposit = Math.round(parseFloat(priceNums[0]));
          else if (title === '매매' && priceNums) { d.price = Math.round(parseFloat(priceNums[0])); d.deposit = 0; }
          else if (title === '월세' && priceNums?.length >= 2) {
            d.deposit = Math.round(parseFloat(priceNums[0]));
            d.monthly = Math.round(parseFloat(priceNums[1]));
          } else if (title === '단기' && priceNums?.length >= 2) {
            d.deposit = Math.round(parseFloat(priceNums[0]));
            d.monthly = Math.round(parseFloat(priceNums[1]));
            d.lease_period = '단기';
          }
          // sub에서 타입 + 건축년도
          const typeM = sub.match(/(오픈형원룸|분리형원룸|1\.5룸|복층형원룸|투룸|쓰리룸|포룸이상|오피스텔|아파트|사무실|상가|원룸)/);
          if (typeM) d.type = mapType(typeM[1]);
          const yrM = sub.match(/(\d{4})년/);
          if (yrM) d.built_year = yrM[1];
        }
        // ─ 관리비 ─
        else if (title.includes('관리비') && title.includes('항목')) {
          d.maintenance_includes = desc.split(/[,/]/).map(s=>s.trim()).filter(Boolean);
          if (sub) d.maintenance_includes = [...new Set([...d.maintenance_includes, ...sub.split(/[,/]/).map(s=>s.trim()).filter(Boolean)])];
        }
        else if (title.includes('관리비') && !d.maintenance_fee) {
          const m = desc.match(/([\d.]+)/);
          if (m) d.maintenance_fee = Math.round(parseFloat(m[1]));
        }
        // ─ 면적 ─
        else if (title.includes('전용면적')) {
          const m = desc.match(/([\d.]+)/);
          if (m) d.area_m2 = parseFloat(m[1]);
        }
        else if (title.includes('공급면적') || title.includes('임대면적')) {
          const m = desc.match(/([\d.]+)/);
          if (m) d.area_supply_m2 = parseFloat(m[1]);
        }
        else if (title.includes('대지면적')) {
          const m = desc.match(/([\d.]+)/);
          if (m) d.area_land_m2 = parseFloat(m[1]);
        }
        // ─ 층 ─
        else if (title.includes('해당층') || (title.includes('층') && title.includes('전체'))) {
          const parts = desc.replace(/층/g, '').match(/(\w+)\s*[\/~\|]\s*(\w+)/);
          if (parts) { d.floor_current = parts[1]; d.floor_total = parts[2]; }
          else { const m = desc.match(/(\w+)/); if (m) d.floor_current = m[1]; }
        }
        // ─ 방/욕실 ─
        else if (title.includes('방수') && title.includes('욕실')) {
          const nums = desc.match(/(\d+)/g);
          if (nums) { d.rooms = parseInt(nums[0]); if (nums[1]) d.bathrooms = parseInt(nums[1]); }
        }
        // ─ 입주가능일 ─
        else if (title.includes('입주가능일') || title.includes('입주일')) {
          d.available_date = desc;
        }
        // ─ 임대기간 ─
        else if (title.includes('임대기간') && !d.lease_period) {
          d.lease_period = desc;
        }
        // ─ 옵션 ─
        else if (title.includes('옵션')) {
          d.features = desc.split(/[,/·\s]+/).map(s=>s.trim()).filter(s => s.length > 1);
        }
        // ─ 방향 ─
        else if (title.includes('방향')) {
          d.direction = desc;
        }
        // ─ 난방 ─
        else if (title.includes('난방')) {
          d.heating_type = desc;
        }
        // ─ 출입구 ─
        else if (title.includes('출입구') || title.includes('현관')) {
          d.entrance_type = desc;
        }
        // ─ 사용승인/건축년도 ─
        else if (title.includes('사용승인')) {
          d.usage_approved = desc.replace(/[-\s]/g, '');
          const yr = desc.match(/(\d{4})/);
          if (yr && !d.built_year) d.built_year = yr[1];
        }
        else if (title.includes('건물명') || title.includes('단지명')) {
          d.building_name = desc;
        }
        // ─ 지하철 ─
        else if (title.includes('역') || title.includes('지하철')) {
          const sm = desc.match(/(.+역)/);
          const dm = desc.match(/(\d+)m/);
          if (sm) d.station_name = sm[1];
          if (dm) d.station_distance = parseInt(dm[1]);
        }
        // ─ 권리금 ─
        else if (title.includes('시설권리금') || title.includes('굿윌')) {
          const m = desc.match(/([\d,]+)/);
          if (m) d.goodwill_fee = parseInt(m[1].replace(/,/g,''));
        }
        else if (title.includes('권리금') && !d.rights_fee) {
          const m = desc.match(/([\d,]+)/);
          if (m) d.rights_fee = parseInt(m[1].replace(/,/g,''));
        }
        // ─ 부가세 ─
        else if (title.includes('부가세')) {
          d.vat_included = desc.includes('포함');
        }
        // ─ 주차비 ─
        else if (title.includes('주차비')) {
          const m = desc.match(/([\d.]+)/);
          if (m) d.parking_fee = Math.round(parseFloat(m[1]));
        }
        else if (title.includes('주차대수')) {
          const m = desc.match(/(\d+)/);
          if (m) d.parking_spaces = parseInt(m[1]);
        }
        // ─ 건물용도 ─
        else if (title.includes('건물용도') || (title.includes('용도') && !title.includes('임대'))) {
          d.building_purpose = desc;
        }
        // ─ 업종 ─
        else if (title.includes('권장업종')) d.recommended_business = desc;
        else if (title.includes('제한업종')) d.restricted_business = desc;
        else if (title.includes('이전상호')) d.previous_brand = desc;
        else if (title.includes('이전업종')) d.previous_business = desc;
        // ─ 전기용량 ─
        else if (title.includes('전기용량') || title.includes('전기')) {
          const m = desc.match(/([\d.]+)/);
          if (m) d.electric_capacity = desc.trim();
        }
        // ─ 간판 ─
        else if (title.includes('간판')) {
          const b = parseBool(desc);
          if (b !== null) d.signage_available = b;
        }
        // ─ 회의실 ─
        else if (title.includes('회의실')) {
          const m = desc.match(/(\d+)/);
          if (m) d.meeting_room = parseInt(m[1]);
          else { const b = parseBool(desc); if (b === true) d.meeting_room = 1; }
        }
        // ─ 수수료 ─
        else if (title.includes('수수료')) {
          const m = desc.match(/([\d,]+)/);
          if (m) d.commission_fee = parseInt(m[1].replace(/,/g,''));
        }
        // ─ 특이사항 ─
        else if (title.includes('특이사항')) {
          d.special_notes = desc;
        }
        // ─ 업종(상업) ─
        else if (title.includes('업종') && !title.includes('이전') && !title.includes('권장') && !title.includes('제한')) {
          d.business_type = desc;
        }
      });
    }

    // ─ bodyBottom 백업 (방/욕실/옵션) ─
    const bottom = doc.querySelector('.bodyBottom');
    if (bottom) {
      bottom.querySelectorAll('.bodyBox').forEach(box => {
        const titleEl = box.querySelector('.box_title');
        const descEl  = box.querySelector('.box_desc');
        if (!titleEl || !descEl) return;
        const title = titleEl.textContent.trim();
        const desc  = descEl.textContent.trim();
        if (title.includes('방수') && title.includes('욕실') && !d.rooms) {
          const nums = desc.match(/(\d+)/g);
          if (nums) { d.rooms = parseInt(nums[0]); if (nums[1]) d.bathrooms = parseInt(nums[1]); }
        } else if (title.includes('옵션') && !d.features) {
          d.features = desc.split(/[,/·\s]+/).map(s=>s.trim()).filter(s => s.length > 1);
        }
      });
    }

    // ─ flex 섹션 (주차/엘리베이터/대출/반려동물/발코니/풀옵션) ─
    doc.querySelectorAll('.flex_title').forEach(ft => {
      const label = ft.textContent.trim();
      let fd = ft.nextElementSibling;
      if (!fd?.classList.contains('flex_desc')) {
        fd = ft.parentElement?.querySelector('.flex_desc');
      }
      const val = fd ? fd.textContent.trim() : '';

      if (label.includes('주차') && !label.includes('비') && !label.includes('대수')) {
        const b = parseBool(val); if (b !== null) d.parking = b;
      } else if (label.includes('엘리베이터')) {
        const b = parseBool(val); if (b !== null) d.elevator = b;
      } else if (label.includes('전세대출') || label.includes('대출')) {
        if (val === '가능') d.loan_available = true;
        else if (val === '불가') d.loan_available = false;
      } else if (label.includes('반려동물')) {
        const b = parseBool(val); if (b !== null) d.pet = b;
      } else if (label.includes('발코니')) {
        const b = parseBool(val); if (b !== null) d.balcony = b;
      } else if (label.includes('풀옵션')) {
        const b = parseBool(val); if (b !== null) d.full_option = b;
      }
    });

    // ─ 설명 텍스트 ─
    for (const sel of ['.detail-desc', '.room-desc', '.content-desc', '#divDesc', '.desc_area', '.view_desc', '.memo', '.item_desc', '.detail_content', '.info_desc']) {
      const el = doc.querySelector(sel);
      if (el) {
        const t = el.textContent.trim();
        if (t.length > 30) { d.description = t.substring(0, 2000); break; }
      }
    }

    // ─ 이미지 ─
    const imgs = [];
    doc.querySelectorAll('img[src*="listing"], img[src*="photo"], img[src*="rent"]').forEach(img => {
      const src = img.src;
      if (src && !src.includes('thumb_s') && (src.endsWith('.jpg') || src.endsWith('.png') || src.endsWith('.webp'))) {
        if (!imgs.includes(src)) imgs.push(src);
      }
    });
    // onhouse photo URLs
    [...html.matchAll(/https:\/\/[^"']+(?:listing|photo|rent)[^"']*\.(?:jpg|png|webp)/gi)].forEach(m => {
      if (!imgs.includes(m[0])) imgs.push(m[0]);
    });
    if (imgs.length > 0) d.images = imgs.slice(0, 20);

    // ─ 연락처 ─
    const phones = html.match(/050\d[-]\d{3,4}[-]\d{4}|0\d{1,2}[-]\d{3,4}[-]\d{4}/g);
    if (phones) d.contact_number = phones[0];

    // ─ source_url ─
    d.source_url = `https://www.onhouse.com/index/rent_view/${listingId}`;

    // ─ contact alias ─
    if (d.contact_number && !d.contact) d.contact = d.contact_number;

    // ─ 기본값 정리 ─
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

    // ─ title 생성 ─
    const dn = d.dong || '';
    const dealStr = d.deal === '월세' ? '월세' : d.deal === '전세' ? '전세' : '매매';
    d.title = d.building_name
      ? `${dn} ${d.building_name} ${d.type}`
      : `${dn} ${dealStr} ${d.type}`;
    if (d.title.length > 30) d.title = d.title.substring(0, 30);

    return d;
  }

  // ─── 업로드 (Supabase 직접 INSERT + listing_images + listing_features) ───
  async function uploadListing(data) {
    try {
      const images = data.images || [];
      const featuresList = data.features || [];
      const { images: _img, ...listingData } = data;

      // Step 1: INSERT listing
      const r = await fetch(`${SUPABASE_URL}/rest/v1/listings`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ ...listingData, status: '가용' }),
      });
      const resp = await r.json();
      if (!r.ok) return { ok: false, error: JSON.stringify(resp).substring(0, 100) };
      const dbId = resp[0]?.id;
      if (!dbId) return { ok: true, id: null };

      // Step 2: INSERT images → listing_images
      if (images.length > 0) {
        const imgInserts = images.slice(0, 20).map((url, idx) => ({
          listing_id: dbId, url, alt: `${listingData.title || ''} ${idx+1}`,
          sort_order: idx, is_thumbnail: idx === 0,
        }));
        fetch(`${SUPABASE_URL}/rest/v1/listing_images`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(imgInserts),
        }).catch(e => console.warn('⚠️ 이미지 저장 실패:', e.message));
      }

      // Step 3: INSERT features → listing_features
      if (featuresList.length > 0) {
        const featInserts = featuresList.map(f => ({ listing_id: dbId, feature: String(f) }));
        fetch(`${SUPABASE_URL}/rest/v1/listing_features`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(featInserts),
        }).catch(e => console.warn('⚠️ 옵션 저장 실패:', e.message));
      }

      return { ok: true, id: dbId };
    } catch(e) { return { ok: false, error: e.message }; }
  }

  // ─── 메인 실행 ───
  console.log('=== 온하우스 전체 필드 크롤러 시작 ===');
  console.log(`설정: UPLOAD=${UPLOAD}, LIMIT=${LIMIT}`);

  const existingIds = UPLOAD ? await getExistingSourceIds() : new Set();
  const allResults = [];
  let uploaded = 0, skipped = 0, failed = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore && allResults.length < LIMIT) {
    console.log(`\n[페이지 ${page}] 목록 로딩...`);
    let ids = [];
    try {
      const result = await fetchListingIds(page);
      ids = result.ids;
      console.log(`  ${ids.length}개 ID 발견`);
      if (ids.length === 0) { hasMore = false; break; }
    } catch(e) {
      console.error(`  목록 로딩 실패: ${e.message}`);
      hasMore = false;
      break;
    }

    for (const id of ids) {
      if (allResults.length >= LIMIT) break;
      if (existingIds.has(String(id))) { skipped++; continue; }

      const data = await parseDetail(id);
      await new Promise(r => setTimeout(r, DELAY_MS));

      if (!data || !data.deal) {
        console.log(`  [${id}] 파싱 실패`);
        failed++;
        continue;
      }

      const fieldCount = Object.keys(data).filter(k => !['source_site','source_id','source_url','title'].includes(k) && data[k] !== null && data[k] !== undefined).length;
      console.log(`  [${id}] ${fieldCount}개 필드 | ${data.address?.substring(0,25)} | ${data.deal} ${data.deposit}/${data.monthly}`);
      allResults.push(data);

      if (UPLOAD) {
        const upResult = await uploadListing(data);
        if (upResult.ok) {
          uploaded++;
          const newSaved = NEW_FIELDS.filter(f => data[f] !== undefined && data[f] !== null);
          conso