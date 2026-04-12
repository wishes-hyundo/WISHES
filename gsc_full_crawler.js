/**
 * 공실클럽(gsc.gongsilclub.com) DOM 카드 기반 크롤러 v3
 * 실행: gsc.gongsilclub.com/v4/item.asp?mn=1110&wm=F100 탭에서 Console에 붙여넣기
 * 전제: 로그인 상태, F100(지도+리스트) 뷰
 *
 * ※ 공실클럽은 ASP 프레임셋 구조로 detail 페이지 직접 fetch 불가.
 *    page() 함수로 페이지 전환하며 DOM 카드에서 필드 추출.
 *    가용 신규 필드: gu, features (detail 전용 필드는 수집 불가)
 */
(async function GSC_DOM_CRAWLER() {
  const SUPABASE_URL = 'https://xbjgdsyukjdkfvcbzmjc.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhiamdkc3l1a2pka2Z2Y2J6bWpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzYxODcsImV4cCI6MjA4OTkxMjE4N30.htuaYUP5Z6UeMJQ-4heTyJ1YBLy9SSQYclMm7ZYR_-4';
  const NEW_FIELDS = ['gu', 'entrance_type', 'features', 'parking_fee', 'building_purpose', 'previous_brand', 'commission_fee', 'special_notes'];
  const LIMIT = 9999; // 테스트: 10, 전체: 9999
  const DELAY_MS = 800;

  // ─── 헬퍼 ───
  function extractGu(addr) {
    const m = addr?.match(/([가-힣]+구)/);
    return m ? m[1] : '';
  }
  function extractDong(addr) {
    const m = addr?.match(/([가-힣]+(?:동|읍|면|리))/);
    return m ? m[1] : '';
  }

  // ─── 카드 파싱 ───
  function parseCard(li) {
    const onclick = li.querySelector('[onclick*="ItemViewDetail"]')?.getAttribute('onclick') || '';
    const codeM = onclick.match(/ItemViewDetail\((\d+)/);
    if (!codeM) return null;
    const source_id = codeM[1];

    const titText = li.querySelector('.tit')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const infoText = li.querySelector('.info')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const optionText = li.querySelector('.option')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const priceText = li.querySelector('.fz15_b_000')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const maintText = li.querySelector('.fz13_464d50')?.textContent.replace(/\s+/g, ' ').trim() || '';

    const d = { source_site: 'gongsilclub', source_id };
    d.source_url = `https://gsc.gongsilclub.com/v4/item.asp?mn=1110&wm=F100&ItemCode=${source_id}`;

    // 주소: 날짜/등급 태그 제거
    const clean = titText.replace(/VIP|PLUS|FREE|NEW|공실매물|\d{2}\.\d{2}\.\d{2}/g, '').replace(/\s+/g, ' ').trim();
    // 층수 이전까지 주소로 간주
    d.address = clean.split(/\s+(?=지하\d+층|[가-힣0-9]+층\b)/)[0].replace(/\([^)]*\)/g, '').trim().substring(0, 60);
    // 건물명 추출 (번지 뒤)
    const bnM = d.address.match(/[가-힣]+(?:동|읍|면)\s+[\d-]+\s+(.+)/);
    if (bnM && bnM[1].trim().length > 1) d.building_name = bnM[1].trim();

    // gu/dong: 주소에서 추출 (한국어 \b 무시)
    d.gu = extractGu(d.address);
    d.dong = extractDong(d.address);
    if (!d.gu) { d.gu = extractGu(clean); }
    if (!d.dong) { d.dong = extractDong(clean); }

    // 층수
    const floorM = clean.match(/([^\s]+층)\s*~\s*([^\s(]+층)/);
    if (floorM) { d.floor_current = floorM[1]; d.floor_total = floorM[2]; }
    else {
      const fm = clean.match(/([^\s]+층)/);
      if (fm) d.floor_current = fm[1];
    }

    // 면적
    const supM = infoText.match(/공급\s*([\d.]+)m²/);
    const prvM = infoText.match(/전용\s*([\d.]+)m²/);
    if (supM) d.area_supply_m2 = parseFloat(supM[1]);
    if (prvM) d.area_m2 = parseFloat(prvM[1]);
    if (!d.area_m2 && d.area_supply_m2) d.area_m2 = Math.round(d.area_supply_m2 * 0.8 * 10) / 10;
    if (!d.area_m2) d.area_m2 = 0.1;

    // 타입
    const typeMap = [['사무실','사무실'],['상가','상가'],['오피스텔','오피스텔'],['아파트','아파트'],['투룸','투룸'],['쓰리룸','쓰리룸'],['원룸','원룸']];
    for (const [k, v] of typeMap) { if (infoText.includes(k)) { d.type = v; break; } }
    if (!d.type) d.type = '원룸';

    // 거래/가격
    const dealM = priceText.match(/^(월세|전세|매매|단기)/);
    if (dealM) d.deal = dealM[1];
    const prices = [...priceText.replace(/,/g, '').matchAll(/[\d.]+/g)].map(m => parseFloat(m[0]));
    if (d.deal === '월세' || d.deal === '단기') {
      d.deposit = Math.round(prices[0] || 0);
      d.monthly = Math.round(prices[1] || prices[0] || 0);
    } else if (d.deal === '전세') {
      d.deposit = Math.round(prices[0] || 0);
    } else if (d.deal === '매매') {
      d.price = Math.round(prices[0] || 0);
    }
    if (!d.deal) d.deal = '월세';

    // 관리비
    const mM = maintText.match(/([\d,]+)만원/);
    if (mM) d.maintenance_fee = parseInt(mM[1].replace(/,/g, ''));

    // features (신규 필드 - option 텍스트 전체)
    if (optionText) {
      d.features = optionText.split(/[,·]+/).map(s => s.trim()).filter(s => s.length > 0 && s.length < 25);
    }

    // 기타 옵션
    const pkM = optionText.match(/주차\s*(\d+)/);
    if (pkM) d.parking_spaces = parseInt(pkM[1]);
    if (optionText.includes('주차')) d.parking = true;
    if (optionText.includes('E/V') || optionText.includes('엘리베이터')) d.elevator = true;

    // title
    d.title = (d.building_name
      ? `${d.dong} ${d.building_name} ${d.type}`
      : `${d.dong} ${d.deal} ${d.type}`).trim().substring(0, 30);

    return d;
  }

  // ─── 기존 source_id 조회 (Supabase 직접) ───
  async function getExistingIds() {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/listings?source_site=eq.gongsilclub&select=source_id&limit=10000`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (!r.ok) return new Set();
      const data = await r.json();
      return new Set(data.map(x => String(x.source_id)));
    } catch(e) { return new Set(); }
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

  // ─── 메인 ───
  console.log(`=== 공실클럽 DOM 크롤러 시작 (LIMIT=${LIMIT}) ===`);
  const existingIds = await getExistingIds();
  console.log(`기존 업로드: ${existingIds.size}개`);

  const results = [];
  let uploaded = 0, skipped = 0, failed = 0, pg = 1;

  while (results.length < LIMIT) {
    console.log(`\n[페이지 ${pg}] 로딩...`);
    page(pg);
    await new Promise(r => setTimeout(r, DELAY_MS));

    const cards = document.querySelectorAll('li.it_list');
    console.log(`  ${cards.length}개 카드`);
    if (cards.length === 0) { console.log('  카드 없음 - 종료'); break; }

    let newInPage = 0;
    for (const li 