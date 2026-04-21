/**
 * 공실클럽(gc2.gongsilclub.com) 크롤러 v10.1
 * 실행: gc2.gongsilclub.com 에서 공실매물 > 전체 > 지역 검색 후
 *       Chrome DevTools Console에 붙여넣기
 * 전제: 로그인 상태
 *
 * v10.0 주요 변경 (v9 대비):
 *   - [치명적] EUC-KR 인코딩 처리 추가 (fetch → arrayBuffer + TextDecoder)
 *     → v9까지 모든 한글이 깨져서 infoMap 키 매칭 전부 실패하고 있었음
 *   - cleanAddress: 주소 끝 " |" 제거, 층정보 패턴 보강
 *   - 관리비 "별도" 헤더 파싱 추가
 *   - 층 파싱: "반지하 / N층", "옥탑 / N층" 패턴 추가
 *   - 옵션 필드에서 난방 타입 추출 (개별/중앙/지역)
 *
 * v9.0 변경사항 유지:
 *   - parseCard: checkbox value로 sourceId 추출 (onclick 폴백)
 *   - parseCard: CSS클래스 의존 제거 → 텍스트 패턴 기반 추출
 *   - 상세페이지 헤더에서 거래유형+가격+주소+관리비 추출
 *   - 좌표 regex에 '=' 추가 (iframe src lat=37.xxx 매칭)
 *   - 상세페이지 hidden input에서 전화번호 직접 추출 (AJAX 폴백)
 *   - 면적: 공급/전용 분리 추출 (카드+상세)
 *   - 건물명 추출 보강
 */
(async function GSC_FULL_CRAWLER() {
  // ═══════════ 설정 ═══════════
  var API_URL = 'https://wishes.co.kr/api/admin/listings';
  var API_TOKEN = 'wishes2026';
  var LIMIT = 999999;
  var DELAY_MS = 800;
  var DETAIL_CONCURRENCY = 3;

  // ═══════════ 헬퍼 ═══════════
  function extractGu(addr) {
    if (!addr) return '';
    // "서울특별시 강남구 ..." or "강남구 역삼동 ..." 패턴
    var m = addr.match(/([가-힣]+구)/);
    return m ? m[1] : '';
  }
  function extractDong(addr) {
    if (!addr) return '';
    // 구 뒤의 동 우선: "강남구 역삼동" → "역삼동"
    var m1 = addr.match(/(?:구)\s+([가-힣]+동)/);
    if (m1) return m1[1];
    // 시/군 뒤의 동/읍/면/리
    var m2 = addr.match(/(?:시|군)\s+([가-힣]+(?:동|읍|면|리))/);
    if (m2) return m2[1];
    // 일반 "OO동" 패턴 (단, "구"로 끝나는 건 제외)
    var m3 = addr.match(/([가-힣]{2,}(?:동|읍|면|리))(?:\s|\d)/);
    if (m3 && !m3[1].endsWith('구')) return m3[1];
    return '';
  }
  function cleanAddress(addr) {
    if (!addr) return '';
    // 주소에서 건물 전체 층수 정보 제거: "지하1층~지상5층 (단독)", "지하1층~5층 (단독)" 등
    return addr
      .replace(/\s*지하?\d+층?\s*~?\s*(?:지상)?\d+층?\s*(?:\(단독\))?/g, '')
      .replace(/\s*\|\s*$/, '')    // 끝의 " |" 제거
      .replace(/\s*\|.*$/, '')     // "| 기타정보" 제거
      .replace(/\s+/g, ' ')
      .trim();
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

  // ═══════════ EUC-KR 디코딩 fetch (공실클럽은 EUC-KR 인코딩) ═══════════
  async function fetchAsText(url, options) {
    var resp = await fetch(url, options || {});
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var buf = await resp.arrayBuffer();
    return new TextDecoder('euc-kr').decode(buf);
  }

  // ═══════════ 기존 source_id 조회 ═══════════
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

  // ═══════════ 페이지 카드 로드 ═══════════
  // v10.1: 사이트는 page(N) JS 함수로 페이지네이션 (AJAX → DOM 갱신)
  //   → URL fetch 방식은 카드를 가져올 수 없음
  //   → live DOM에서 카드를 읽고, page(N) 호출로 다음 페이지 이동

  function readLiveCards() {
    var cards = document.querySelectorAll('li.it_list');
    if (cards.length > 0) return Array.from(cards);
    // 폴백: checkbox 기반 탐색
    var allLis = document.querySelectorAll('ul > li');
    var matched = [];
    allLis.forEach(function(li) {
      var cb = li.querySelector('input[type="checkbox"]');
      if (cb && cb.value && /^\d{4,}$/.test(cb.value)) {
        matched.push(li);
      }
    });
    return matched;
  }

  async function fetchPageCards(pageNum) {
    if (pageNum === 1) {
      // 페이지 1은 현재 로드된 DOM에서 바로 읽기
      return readLiveCards();
    }

    // 페이지 2+: page() 함수 호출 후 DOM 갱신 대기
    if (typeof page === 'function') {
      // 현재 카드 첫 번째 ID 기록 (변경 감지용)
      var beforeCards = readLiveCards();
      var beforeId = '';
      if (beforeCards.length > 0) {
        var bcb = beforeCards[0].querySelector('input[type="checkbox"]');
        if (bcb) beforeId = bcb.value;
      }

      page(pageNum);

      // DOM 갱신 대기 (최대 5초)
      for (var wait = 0; wait < 25; wait++) {
        await sleep(200);
        var afterCards = readLiveCards();
        if (afterCards.length > 0) {
          var acb = afterCards[0].querySelector('input[type="checkbox"]');
          var afterId = acb ? acb.value : '';
          if (afterId !== beforeId) {
            console.log('[GSC] 페이지 ' + pageNum + ' 로드 완료: ' + afterCards.length + '건');
            return afterCards;
          }
        }
      }
      console.warn('[GSC] 페이지 ' + pageNum + ' DOM 갱신 타임아웃');
      // 타임아웃이어도 현재 카드 반환 시도
      var finalCards = readLiveCards();
      return finalCards.length > 0 ? finalCards : [];
    }

    console.warn('[GSC] page() 함수 없음 — 페이지네이션 불가');
    return [];
  }

  // ═══════════ 카드에서 기본 정보 추출 ═══════════
  // v9.0: 실제 gc2.gongsilclub.com DOM 구조 대조 결과에 맞춰 재작성
  //   카드 구조: <li> > checkbox[value=sourceId], links, generic text spans
  //   주소: 두 번째 <a> 안의 텍스트 (VIP/PLUS 등급 + 주소)
  //   가격: "월세 20,000 / 2,100" 텍스트 요소
  //   면적: "공급 667.1m²(201.8P) / 전용..." 텍스트 요소
  function parseCard(li) {
    // ── source_id: checkbox value가 가장 안정적 ──
    var checkbox = li.querySelector('input[type="checkbox"]');
    var source_id = null;

    if (checkbox && checkbox.value && /^\d{4,}$/.test(checkbox.value)) {
      source_id = checkbox.value;
    }
    // 폴백: onclick 속성에서 추출
    if (!source_id) {
      var el = li.querySelector('[onclick*="ItemViewDetail"], [onclick*="FreeItemViewDetail"], [onclick*="Detail"]');
      var onclick = (el && el.getAttribute) ? el.getAttribute('onclick') : '';
      var codeM = onclick.match(/(?:Free)?(?:Item)?(?:View)?(?:Popup)?Detail[_\d]*\((\d+)/i);
      if (codeM) source_id = codeM[1];
    }
    if (!source_id) return null;

    var d = { source_site: 'gongsilclub', source_id: source_id };
    d.source_url = 'https://gc2.gongsilclub.com/v4/item.asp?mn=1110&wm=F140&pg=1&rk=' + source_id;

    // ── 카드 전체 텍스트 기반 추출 (CSS 클래스 의존 제거) ──
    var allText = (li.textContent || '').replace(/\s+/g, ' ').trim();

    // ── 등록일: "공실매물 26.04.10" 패턴 ──
    var regDateM = allText.match(/공실매물\s*(\d{2}\.\d{2}\.\d{2})/);
    if (regDateM) d.registered_date = '20' + regDateM[1].replace(/\./g, '-');

    // ── 등급: VIP/PLUS/FREE ──
    var links = li.querySelectorAll('a');
    var addrText = '';
    for (var ai = 0; ai < links.length; ai++) {
      var linkText = (links[ai].textContent || '').replace(/\s+/g, ' ').trim();
      // VIP/PLUS 등급 추출
      var gradeM = linkText.match(/^(VIP|PLUS|FREE)/);
      if (gradeM && !d.grade) d.grade = gradeM[1];
      // 구/동이 있는 링크 = 주소 링크
      if (/[가-힣]+구\s+[가-힣]+동/.test(linkText) || /[가-힣]+시\s+[가-힣]+구/.test(linkText)) {
        addrText = linkText.replace(/^(VIP|PLUS|FREE|NEW)\s*/, '').trim();
        break;
      }
    }
    if (addrText) {
      d.address = cleanAddress(addrText).substring(0, 80);
    }

    // 건물명 (주소 텍스트에서 추출: "번지 건물명 층정보")
    if (addrText) {
      var bldgM = addrText.match(/\d+[-\d]*\s+([가-힣A-Za-z0-9]+(?:오피스텔|빌딩|타워|아파트|빌라|맨션|센터|플라자|파크|팰리스|하이츠|타운|파트너스[가-힣]*))/);
      if (bldgM) d.building_name = bldgM[1];
    }

    // ── 가격 추출: "월세 20,000 / 2,100" 패턴 ──
    var priceM = allText.match(/(월세|전세|매매|단기)\s+([\d,]+)\s*\/?\s*([\d,]*)/);
    if (priceM) {
      d.deal = priceM[1] === '단기' ? '월세' : priceM[1];
      var num1 = numParse(priceM[2]);
      var num2 = numParse(priceM[3]);
      if (d.deal === '매매') {
        d.price = Math.round(num1 || 0);
      } else if (d.deal === '전세') {
        d.deposit = Math.round(num1 || 0);
      } else {
        // 월세: "보증금 / 월세"
        d.deposit = Math.round(num1 || 0);
        d.monthly = Math.round(num2 || 0);
      }
    }

    // ── 타입 (카드 텍스트에서) ──
    var typeM = allText.match(/(원룸|투룸|쓰리룸|오피스텔|아파트|상가|사무실)/);
    if (typeM) d.type = typeM[1];

    // ── 면적: "공급 667.1m²(201.8P) / 전용667.1m²" 패턴 ──
    var supplyAreaM = allText.match(/공급\s*([\d,.]+)\s*m²/);
    if (supplyAreaM) d.area_supply_m2 = parseFloat(supplyAreaM[1].replace(/,/g, ''));
    var exclusiveAreaM = allText.match(/전용\s*([\d,.]+)\s*m²/);
    if (exclusiveAreaM) d.area_m2 = parseFloat(exclusiveAreaM[1].replace(/,/g, ''));
    if (!d.area_m2) {
      var anyAreaM = allText.match(/([\d,.]+)\s*(?:㎡|m²)/);
      if (anyAreaM) d.area_m2 = parseFloat(anyAreaM[1].replace(/,/g, ''));
    }

    // ── 관리비 ──
    var maintM = allText.match(/관리비\s*(없음|[\d,]+)/);
    if (maintM) {
      if (maintM[1] === '없음') d.maintenance_fee = 0;
      else { var mf = numParse(maintM[1]); if (mf !== null) d.maintenance_fee = Math.round(mf); }
    }

    // ── 층 (카드 fallback) ──
    var floorM = allText.match(/(\d+)\s*층\s*[\/~|,]\s*(\d+)\s*층?/);
    if (floorM) { d.floor_current = floorM[1]; d.floor_total = floorM[2]; }

    // ── 특징 텍스트 (E/V, 주차, 년도 등) ──
    var featureM = allText.match(/(?:단독|복층)?\/?\d+층[,\s]+(.+?)(?=\s*(?:월세|전세|매매|관리비))/);
    if (featureM) {
      var feats = featureM[1];
      if (/E\/V/.test(feats)) d.elevator = true;
      var parkCntM = feats.match(/주차\s*(\d+)/);
      if (parkCntM) { d.parking_spaces = parseInt(parkCntM[1]); d.parking = true; }
      var yearM = feats.match(/(\d{4})년/);
      if (yearM) d.built_year = yearM[1];
    }

    return d;
  }

  // ═══════════ 상세페이지 fetch 직접 호출 (iframe 대신) ═══════════
  async function fetchDetailHtml(sourceId) {
    try {
      var url = '/v4/item.asp?mn=1110&wm=F140&pg=1&rk=' + sourceId;
      return await fetchAsText(url, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
    } catch(e) {
      console.warn('[GSC] 상세페이지 fetch 실패 (' + sourceId + '):', e.message);
      return '';
    }
  }

  // 동시 N개 상세페이지 로딩
  async function batchFetchDetails(sourceIds) {
    var results = {};
    for (var i = 0; i < sourceIds.length; i += DETAIL_CONCURRENCY) {
      var batch = sourceIds.slice(i, i + DETAIL_CONCURRENCY);
      var promises = batch.map(function(id) {
        return fetchDetailHtml(id).then(function(html) { results[id] = html; });
      });
      await Promise.all(promises);
      if (i + DETAIL_CONCURRENCY < sourceIds.length) await sleep(400);
    }
    return results;
  }

  // ═══════════ 상세 HTML 파싱 (CSS 클래스 기반) ═══════════
  function parseDetailHtml(html, d) {
    if (!html || html.length < 100) return d;
    var parser = new DOMParser();
    var doc = parser.parseFromString('<div>' + html + '</div>', 'text/html');

    // CSS 클래스 기반 라벨-값 매핑
    var infoMap = {};

    doc.querySelectorAll('.detail_info_td1').forEach(function(td1) {
      var label = td1.textContent.replace(/\s+/g, '').trim();
      var next = td1.nextElementSibling;
      if (next && next.classList && next.classList.contains('detail_info_td2')) {
        var value = next.textContent.replace(/\s+/g, ' ').trim();
        if (label && value && value !== '-') infoMap[label] = value;
      }
    });

    doc.querySelectorAll('.detail_info_td3').forEach(function(td3) {
      var label = td3.textContent.replace(/\s+/g, '').trim();
      var next = td3.nextElementSibling;
      if (next && next.classList && next.classList.contains('detail_info_td4')) {
        var value = next.textContent.replace(/\s+/g, ' ').trim();
        if (label && value && value !== '-') infoMap[label] = value;
      }
    });

    console.log('[GSC] #' + d.source_id + ' infoMap (' + Object.keys(infoMap).length + '키): ' + Object.keys(infoMap).join(', '));

    // ═══ 상세 페이지 헤더 파싱 (v9.0 추가) ═══
    // 헤더 구조 (실제 사이트 확인):
    //   "매물번호 982651"
    //   "서울 서초구 반포동" (주소 앞부분)
    //   "731-30 빌드업파트너스반포 지하1층~지상5층 (단독)" (주소 뒷부분)
    //   "사무실/상가  월세" (타입 + 거래유형)
    //   "월세 20,000 / 2,100만원" (가격)
    //   "관리비 없음" or "관리비 50만원"
    //   "기준가 230,000만원"
    var headerText = html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');

    // ── 주소 (헤더에서 추출 — 가장 정확) ──
    // 헤더에 "서울 XX구 XX동" + "번지 건물명 층정보" 가 연속으로 있음
    var addrHeaderM = headerText.match(/(서울[^\n]*?[가-힣]+구\s+[가-힣]+동)\s+([\d-]+\s*[^\n]*?)(?=\s*(?:사무실|원룸|오피스텔|상가|아파트|투룸|쓰리룸|풀옵션|일반|주택))/);
    if (addrHeaderM) {
      var fullAddr = (addrHeaderM[1] + ' ' + addrHeaderM[2]).trim();
      d.address = cleanAddress(fullAddr).substring(0, 80);
    } else {
      // 폴백: 매물번호 뒤의 주소 패턴
      var addrFallbackM = headerText.match(/매물번호\s*\d+\s+(서울[^\n]*?[가-힣]+구\s+[가-힣]+동[^\n]*?\d+[-\d]*[^\n]*?)(?=\s*(?:사무실|원룸|오피스텔|상가|아파트))/);
      if (addrFallbackM) {
        d.address = cleanAddress(addrFallbackM[1]).substring(0, 80);
      }
    }

    // ── 매물유형 (헤더에서 추출: "사무실/상가 월세" 패턴) ──
    // 주거용은 "풀옵션 월세", 상업용은 "사무실/상가 월세" 형태
    var typeHeaderM = headerText.match(/(사무실|상가|원룸|투룸|쓰리룸|오피스텔|아파트|주택|빌라|빌딩|건물|토지|지식산업센터|풀옵션|일반)(?:\s*[\/·]\s*(사무실|상가|원룸|투룸|쓰리룸|오피스텔|아파트|주택|빌라|주거용?))?\s+(?:월세|전세|매매|단기)/);
    if (typeHeaderM && !d.type) {
      d.type = typeHeaderM[2] ? typeHeaderM[1] + '/' + typeHeaderM[2] : typeHeaderM[1];
    }

    // ── 거래유형 + 가격 (헤더에서 추출 — infoMap에는 이 라벨이 없음!) ──
    // 패턴: "월세 20,000 / 2,100만원" or "전세 15,000만원" or "매매 80,000만원"
    var headerPriceM = headerText.match(/(월세|전세|매매|단기)\s+([\d,]+)\s*\/?\s*([\d,]*)\s*만원/);
    if (headerPriceM) {
      d.deal = headerPriceM[1] === '단기' ? '월세' : headerPriceM[1];
      var hp1 = numParse(headerPriceM[2]);
      var hp2 = numParse(headerPriceM[3]);
      if (d.deal === '매매') {
        if (hp1) d.price = Math.round(hp1);
      } else if (d.deal === '전세') {
        if (hp1) d.deposit = Math.round(hp1);
      } else {
        if (hp1) d.deposit = Math.round(hp1);
        if (hp2) d.monthly = Math.round(hp2);
      }
    }

    // 기준가 (헤더)
    var basePriceM = headerText.match(/기준가\s+([\d,]+)\s*만원/);
    if (basePriceM) d.base_price = Math.round(numParse(basePriceM[1]) || 0);

    // 관리비 (헤더 — infoMap보다 헤더가 더 간결)
    var headerMaintM = headerText.match(/관리비\s+(없음|별도|[\d,]+\s*만원?)/);
    if (headerMaintM) {
      if (headerMaintM[1] === '없음') d.maintenance_fee = 0;
      else if (headerMaintM[1] === '별도') {
        d.maintenance_fee = null;
        d.special_notes = (d.special_notes ? d.special_notes + ' / ' : '') + '관리비별도';
      }
      else { var hmf = numParse(headerMaintM[1]); if (hmf !== null) d.maintenance_fee = Math.round(hmf); }
    }

    // ── 면적정보 ──
    var areaInfo = infoMap['면적정보'] || infoMap['면적'] || '';
    if (areaInfo) {
      var exclusiveM = areaInfo.match(/전용[:\s]*([\d.]+)\s*(?:㎡|m²|m2)/);
      if (exclusiveM) d.area_m2 = parseFloat(exclusiveM[1]);
      var supplyM = areaInfo.match(/공급(?:\([^)]*\))?[:\s]*([\d.]+)\s*(?:㎡|m²|m2)/);
      if (supplyM) d.area_supply_m2 = parseFloat(supplyM[1]);
      if (!d.area_supply_m2) {
        var contractM = areaInfo.match(/계약[:\s]*([\d.]+)\s*(?:㎡|m²|m2)/);
        if (contractM) d.area_supply_m2 = parseFloat(contractM[1]);
      }
      if (!d.area_m2) {
        var anyArea = areaInfo.match(/([\d.]+)\s*(?:㎡|m²|m2)/);
        if (anyArea) d.area_m2 = parseFloat(anyArea[1]);
      }
      if (!d.area_m2) {
        var pyM = areaInfo.match(/([\d.]+)\s*(?:평|P)/);
        if (pyM) d.area_m2 = Math.round(parseFloat(pyM[1]) * 3.305785 * 100) / 100;
      }
    }

    // ── 해당층/총층 ──
    var floorInfo = infoMap['해당층/총층'] || infoMap['해당층'] || infoMap['층수'] || '';
    if (floorInfo) {
      var floorM = floorInfo.match(/(지하)?(\d+)\s*층?\s*[\/~|]\s*(\d+)\s*층?/);
      if (floorM) {
        d.floor_current = (floorM[1] ? 'B' : '') + floorM[2];
        d.floor_total = floorM[3];
      } else {
        // "반지하 / 3층", "옥탑 / 5층", "단독 / 5층" 패턴
        var specialFloorM = floorInfo.match(/(반지하|옥탑|단독)\s*\/?\s*(\d+)\s*층?/);
        if (specialFloorM) {
          d.floor_current = specialFloorM[1];
          d.floor_total = specialFloorM[2];
        } else {
          var singleF = floorInfo.match(/(지하)?(\d+)\s*층/);
          if (singleF) d.floor_current = (singleF[1] ? 'B' : '') + singleF[2];
        }
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
    if (infoMap['구조형태']) d.entrance_type = infoMap['구조형태'];

    // ── 월관리비 ──
    var maintInfo = infoMap['월관리비'] || infoMap['관리비'] || '';
    if (maintInfo) {
      if (/관리비\s*별도/.test(maintInfo)) {
        d.maintenance_fee = null;
        d.special_notes = (d.special_notes ? d.special_notes + ' / ' : '') + '관리비별도';
      } else {
        var maintM = maintInfo.match(/(\d+)\s*만\s*원?/);
        if (maintM) d.maintenance_fee = Math.round(parseFloat(maintM[1]));
        else {
          var maintN = numParse(maintInfo);
          if (maintN !== null && maintN > 0) d.maintenance_fee = Math.round(maintN);
        }
      }
      if (maintInfo.indexOf('부가세') !== -1) d.vat_included = maintInfo.indexOf('포함') !== -1;
    }

    // ── 관리비항목 ──
    var maintItems = infoMap['관리비항목'] || infoMap['관리비포함'] || '';
    if (maintItems) {
      d.maintenance_includes = maintItems.split(/[,/·ㆍ、]/).map(function(s) { return s.trim(); }).filter(Boolean);
    }

    // ── 주차 ──
    var parkInfo = infoMap['주차대수'] || infoMap['주차'] || '';
    if (parkInfo) {
      var parkNum = parkInfo.match(/(\d+)\s*대/);
      if (parkNum) { d.parking_spaces = parseInt(parkNum[1]); d.parking = parseInt(parkNum[1]) > 0; }
      if (parkInfo.indexOf('무료') !== -1 || parkInfo.indexOf('가능') !== -1) d.parking = true;
      if (parkInfo.indexOf('불가') !== -1 || parkInfo.indexOf('없') !== -1) d.parking = false;
      var parkFeeM = parkInfo.match(/주차비[:\s]*(?:1대당\s*)?(\d+)\s*만/);
      if (parkFeeM) d.parking_fee = parseInt(parkFeeM[1]);
    }

    // ── 준공년도 ──
    var builtInfo = infoMap['준공년도'] || infoMap['준공일'] || infoMap['사용승인일'] || '';
    if (builtInfo) { var builtM = builtInfo.match(/(\d{4})/); if (builtM) d.built_year = builtM[1]; }

    // ── 입주가능일 ──
    if (infoMap['입주가능일'] || infoMap['입주일']) d.available_date = infoMap['입주가능일'] || infoMap['입주일'];

    // ── 임대기간 ──
    if (infoMap['임대기간']) d.lease_period = infoMap['임대기간'];

    // ── 용도 ──
    if (infoMap['용도'] || infoMap['건물용도']) d.building_purpose = infoMap['용도'] || infoMap['건물용도'];

    // ── 권리금 ──
    var rightsInfo = infoMap['권리금'] || '';
    if (rightsInfo && rightsInfo !== '무' && rightsInfo !== '없음') {
      var rightsM = rightsInfo.match(/([\d,.]+)/);
      if (rightsM) d.rights_fee = Math.round(parseFloat(rightsM[1].replace(/,/g, '')));
    }

    // ── 업종 ──
    var bizInfo = infoMap['현업종/상호'] || infoMap['이전업종/상호'] || infoMap['현업종'] || infoMap['이전업종'] || '';
    if (bizInfo) d.previous_business = bizInfo;
    if (infoMap['권장업종']) d.recommended_business = infoMap['권장업종'];
    if (infoMap['제한업종']) d.restricted_business = infoMap['제한업종'];

    // ── 방향/난방/출입구/건물명 ──
    if (infoMap['방향']) d.direction = infoMap['방향'];
    if (infoMap['난방'] || infoMap['난방방식']) d.heating_type = infoMap['난방'] || infoMap['난방방식'];
    if (infoMap['출입구'] || infoMap['현관구조']) d.entrance_type = infoMap['출입구'] || infoMap['현관구조'];
    if (infoMap['건물명'] || infoMap['단지명']) d.building_name = infoMap['건물명'] || infoMap['단지명'];

    // ── 옵션 → features + boolean 필드 ──
    var optionInfo = infoMap['옵션'] || infoMap['시설옵션'] || '';
    if (optionInfo) {
      d.features = optionInfo.split(/[,，、]/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
      if (optionInfo.indexOf('엘리베이터') !== -1) d.elevator = true;
      if (optionInfo.indexOf('풀옵션') !== -1) d.full_option = true;
      if (optionInfo.indexOf('반려') !== -1 || optionInfo.indexOf('펫') !== -1) d.pet = true;
      if (optionInfo.indexOf('발코니') !== -1 || optionInfo.indexOf('베란다') !== -1) d.balcony = true;
      // 옵션에서 난방 추출 (별도 라벨이 없는 경우)
      if (!d.heating_type) {
        if (optionInfo.indexOf('개별냉난방') !== -1) d.heating_type = '개별냉난방';
        else if (optionInfo.indexOf('중앙냉난방') !== -1) d.heating_type = '중앙냉난방';
        else if (optionInfo.indexOf('개별난방') !== -1) d.heating_type = '개별난방';
        else if (optionInfo.indexOf('중앙난방') !== -1) d.heating_type = '중앙난방';
        else if (optionInfo.indexOf('지역난방') !== -1) d.heating_type = '지역난방';
        else if (optionInfo.indexOf('난방') !== -1) d.heating_type = '난방';
      }
    }

    // ── 특이사항 → description ──
    var special = infoMap['특이사항'] || infoMap['상세설명'] || infoMap['메모'] || '';
    if (special && special.length > 3) {
      d.description = special.substring(0, 2000);
      if (!d.pet && /애완동물|반려동물|펫/.test(special)) {
        d.pet = /안됨|불가|금지/.test(special) ? false : true;
      }
      if (!d.direction) {
        var dirM = special.match(/(남향|북향|동향|서향|남동향|남서향|북동향|북서향)/);
        if (dirM) d.direction = dirM[1];
      }
    }

    // ── 등록일 / 최종확인일 (td3/td4에서 추출) ──
    if (infoMap['등록일']) d.registered_date = infoMap['등록일'].replace(/\s+/g, ' ').trim();
    if (infoMap['최종확인일']) d.last_confirmed = infoMap['최종확인일'].replace(/\s+/g, ' ').trim();

    // ── 건물 내 매물 ──
    if (infoMap['건물내매물'] || infoMap['건물 내 매물']) {
      d.building_listings = (infoMap['건물내매물'] || infoMap['건물 내 매물']).trim();
    }

    // ── 사진 수 (HTML에서 추출: "1 / 28" 패턴) ──
    var photoCountM = html.match(/\/\s*(\d{1,3})\s*<\/(?:span|div|td)/);
    if (photoCountM) d.photo_count = parseInt(photoCountM[1]);

    // ── 엘리베이터/반려동물/대출 (별도 라벨) ──
    if (infoMap['엘리베이터'] || infoMap['E/V']) {
      var evVal = infoMap['엘리베이터'] || infoMap['E/V'];
      var evBool = parseBool(evVal);
      if (evBool !== null) d.elevator = evBool;
      else d.elevator = evVal.indexOf('있') !== -1 || evVal.indexOf('O') !== -1;
    }
    if (infoMap['반려동물'] || infoMap['반려']) { var petB = parseBool(infoMap['반려동물'] || infoMap['반려']); if (petB !== null) d.pet = petB; }
    if (infoMap['대출'] || infoMap['전세대출']) { var loanB = parseBool(infoMap['대출'] || infoMap['전세대출']); if (loanB !== null) d.loan_available = loanB; }

    // ── 부가세/전기/수수료 ──
    if (infoMap['부가세']) d.vat_included = infoMap['부가세'].indexOf('포함') !== -1;
    if (infoMap['전기용량'] || infoMap['전기']) d.electric_capacity = infoMap['전기용량'] || infoMap['전기'];
    var commInfo = infoMap['수수료'] || infoMap['중개보수'] || '';
    if (commInfo) {
      var cfm = commInfo.match(/([\d,]+)/);
      if (cfm) d.commission_fee = Math.round(parseFloat(cfm[1].replace(/,/g, '')));
      else if (commInfo.length > 0) d.commission_note = commInfo;
    }

    // ── 좌표 (HTML에서 추출) ──
    // v9.0: 실제 사이트는 iframe src에 "lat=37.xxx&lng=127.xxx" 형태로 좌표 포함
    //   → '=' 문자를 패턴에 추가해야 매칭됨
    var latPatterns = [
      /lat[='":\s]+(3[5-8]\.\d+)/, /latitude[='":\s]+(3[5-8]\.\d+)/,
      /center\s*:\s*\{\s*lat\s*:\s*(3[5-8]\.\d+)/, /LatLng\(\s*(3[5-8]\.\d+)/,
      /y[='":\s]+(3[5-8]\.\d{4,})/
    ];
    var lngPatterns = [
      /lng[='":\s]+(12[5-8]\.\d+)/, /longitude[='":\s]+(12[5-8]\.\d+)/,
      /LatLng\(\s*3[5-8]\.\d+\s*,\s*(12[5-8]\.\d+)/, /x[='":\s]+(12[5-8]\.\d{4,})/
    ];
    for (var pi = 0; pi < latPatterns.length && !d.lat; pi++) {
      var lm = html.match(latPatterns[pi]);
      if (lm) d.lat = parseFloat(lm[1]);
    }
    for (var pj = 0; pj < lngPatterns.length && !d.lng; pj++) {
      var lgm = html.match(lngPatterns[pj]);
      if (lgm) d.lng = parseFloat(lgm[1]);
    }
    // 최후 폴백: "37.xxxxx, 126.xxxxx" or "37.xxxxx,127.xxxxx"
    if (!d.lat || !d.lng) {
      var coordM = html.match(/(3[5-8]\.\d{4,})\s*[,&\s]\s*(?:lng=)?\s*(12[5-8]\.\d{4,})/);
      if (coordM) { d.lat = parseFloat(coordM[1]); d.lng = parseFloat(coordM[2]); }
    }

    // ── 전화번호 (상세페이지 hidden input에서 추출 — AJAX 백업) ──
    var GSC_GENERIC_PHONES = ['025486056', '0215339580', '16445510', '025490561'];
    var phoneInHtml = html.match(/value\s*=\s*"(0\d{1,3}-\d{3,4}-\d{4})"/g);
    if (phoneInHtml) {
      for (var phi = 0; phi < phoneInHtml.length; phi++) {
        var pm = phoneInHtml[phi].match(/"(0\d{1,3}-\d{3,4}-\d{4})"/);
        if (pm) {
          var norm = pm[1].replace(/[-\s]/g, '');
          if (!GSC_GENERIC_PHONES.some(function(g) { return norm === g; })) {
            d._detailPhone = pm[1];
            break;
          }
        }
      }
    }

    // ── 건물명 (헤더 주소에서 추출 보강) ──
    if (!d.building_name) {
      var bldgHeaderM = (d.address || '').match(/\d+[-\d]*\s+([가-힣A-Za-z0-9]+(?:빌딩|타워|아파트|빌라|맨션|센터|플라자|파크|팰리스|하이츠|타운|오피스텔|파트너스[가-힣]*))/);
      if (bldgHeaderM) d.building_name = bldgHeaderM[1];
    }

    return d;
  }

  // ═══════════ 연락처 AJAX 조회 ═══════════
  async function fetchContactForListing(sourceId) {
    try {
      var url = '/v4/ajax/ajax_contact_info_gongsil.asp?Ridx=' + sourceId + '&Gubun=101&Refill=0';
      var html = await fetchAsText(url, { credentials: 'include' });
      var role = '임대인';
      var roleM = html.match(/(임대인|관리인|관리사무소|담당자|중개사|사장|관리실|소유자|건물주)/);
      if (roleM) role = roleM[1];
      var safe050 = html.match(/050\d[-]?\d{3,4}[-]?\d{4}/);
      if (safe050) return { phone: safe050[0], role: role };
      var GSC_GENERIC = ['025486056', '0215339580', '16445510'];
      var phones = html.match(/0\d{1,3}[-)\s]?\d{3,4}[-\s]?\d{4}/g);
      if (phones) {
        for (var i = 0; i < phones.length; i++) {
          var norm = phones[i].replace(/[-\s)]/g, '');
          if (!GSC_GENERIC.some(function(g) { return norm === g; })) return { phone: phones[i], role: role };
        }
      }
      return null;
    } catch(e) {
      return null;
    }
  }

  // ═══════════ 업로드 전 필수 필드 검증 ═══════════
  function validateListing(data) {
    var errors = [];
    if (!data.address || data.address.length < 5) errors.push('주소 없음');
    if (!data.deal) errors.push('거래유형 없음');
    if (data.deal === '월세' && (!data.deposit && data.deposit !== 0) && !data.monthly) errors.push('월세인데 보증금+월세 모두 없음');
    if (data.deal === '전세' && !data.deposit) errors.push('전세인데 보증금 없음');
    if (data.deal === '매매' && !data.price) errors.push('매매인데 가격 없음');
    // 보증금=0 + 월세=0 이면 가격 파싱 실패로 판단 (매매 제외)
    if (data.deal !== '매매' && (data.deposit || 0) === 0 && (data.monthly || 0) === 0) {
      errors.push('가격 0원 (파싱 실패 의심)');
    }
    return errors;
  }

  // ═══════════ 업로드 ═══════════
  async function uploadListing(data) {
    try {
      // dong/gu 추출
      data.gu = data.gu || extractGu(data.address);
      data.dong = extractDong(data.address) || data.gu || '미입력';
      if (!data.area_m2 || data.area_m2 <= 0) data.area_m2 = 0;
      if (!data.type) data.type = '원룸';

      // title 생성 (주소 그대로 복사 금지!)
      var dong = data.dong !== '미입력' ? data.dong : '';
      var bn = data.building_name || '';
      if (bn) {
        data.title = (dong + ' ' + bn + ' ' + data.type).trim();
      } else {
        data.title = (dong + ' ' + data.deal + ' ' + data.type).trim();
      }
      if (data.title.length > 30) data.title = data.title.substring(0, 30);

      data.status = '공개';

      // null/undefined 제거
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
  console.log('║  GSC Full Crawler v10.1 (Admin API)   ║');
  console.log('║  EUC-KR + page() 페이지네이션 완료    ║');
  console.log('╚═══════════════════════════════════════╝');

  var existingIds = await getExistingIds();
  var results = [];
  var uploaded = 0, skipped = 0, failed = 0, rejected = 0;
  var detailOk = 0, detailFail = 0;
  var pg = 1;
  var emptyPages = 0;

  while (results.length < LIMIT) {
    console.log('\n━━━ [페이지 ' + pg + '] ━━━');

    var cards;
    if (pg === 1) {
      // v9.0: 여러 셀렉터로 카드 탐색 (가장 구체적 → 범용 순)
      cards = Array.from(document.querySelectorAll('ul.it_list_wrap > li.it_list, li.it_list'));
      if (cards.length === 0) cards = Array.from(document.querySelectorAll('.it_list, .lst_link, .item_list li'));
      // v9.0 추가: checkbox(매물번호)를 포함한 li 요소 (DOM 구조 기반 폴백)
      if (cards.length === 0) {
        var allLis = document.querySelectorAll('ul > li');
        var matched = [];
        allLis.forEach(function(li) {
          var cb = li.querySelector('input[type="checkbox"]');
          if (cb && cb.value && /^\d{4,}$/.test(cb.value)) {
            // 상세보기 링크도 있는지 확인
            var hasDetail = li.textContent.indexOf('상세보기') !== -1;
            if (hasDetail) matched.push(li);
          }
        });
        cards = matched;
      }
      if (cards.length === 0) console.error('[GSC] ⚠ 카드를 찾을 수 없음! CSS셀렉터 확인 필요');
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

    // 1단계: 카드 파싱
    var pageItems = [];
    for (var ci = 0; ci < cards.length; ci++) {
      var cardData = parseCard(cards[ci]);
      if (!cardData || !cardData.source_id) { failed++; continue; }
      if (existingIds.has(cardData.source_id)) { skipped++; continue; }
      pageItems.push(cardData);
    }
    console.log('  신규: ' + pageItems.length + '건 (중복건너뜀: ' + skipped + ')');
    if (pageItems.length === 0) { pg++; await sleep(DELAY_MS); continue; }

    // 2단계: 상세페이지 fetch 직접 호출 (iframe 아님!)
    console.log('  상세페이지 로딩 중 (fetch직접, ' + DETAIL_CONCURRENCY + '개 동시)...');
    var sourceIds = pageItems.map(function(item) { return item.source_id; });
    var detailHtmls = await batchFetchDetails(sourceIds);

    for (var di = 0; di < pageItems.length; di++) {
      var html = detailHtmls[pageItems[di].source_id];
      if (html && html.length > 200) {
        pageItems[di] = parseDetailHtml(html, pageItems[di]);
        detailOk++;
      } else {
        detailFail++;
        console.warn('  ⚠ [' + pageItems[di].source_id + '] 상세페이지 로딩 실패 (HTML=' + (html ? html.length : 0) + 'bytes)');
      }
    }
    console.log('  상세: 성공=' + detailOk + ' 실패=' + detailFail);

    // 2.5단계: 연락처 조회 (상세페이지 hidden input 우선, AJAX 폴백)
    console.log('  연락처 조회 중...');
    for (var ci2 = 0; ci2 < pageItems.length; ci2++) {
      // 상세 페이지 hidden input에서 이미 추출한 전화번호가 있으면 우선 사용
      if (pageItems[ci2]._detailPhone) {
        pageItems[ci2].contact = pageItems[ci2]._detailPhone;
        pageItems[ci2].contact_role = '임대인';
        delete pageItems[ci2]._detailPhone;
      } else {
        var contactInfo = await fetchContactForListing(pageItems[ci2].source_id);
        if (contactInfo) {
          pageItems[ci2].contact = contactInfo.phone;
          pageItems[ci2].contact_role = contactInfo.role || '임대인';
        }
        await sleep(300);
      }
    }

    // 3단계: 검증 + 업로드
    for (var ui = 0; ui < pageItems.length; ui++) {
      if (results.length >= LIMIT) break;
      var item = pageItems[ui];

      // ★★★ 필수 필드 검증 — 불량 데이터 업로드 차단 ★★★
      var validationErrors = validateListing(item);
      if (validationErrors.length > 0) {
        rejected++;
        console.error('  ✗ [' + item.source_id + '] 검증 실패: ' + validationErrors.join(', '));
        console.error('      → 이 매물은 업로드하지 않습니다. (addr: ' + (item.address || '?').substring(0, 30) + ')');
        results.push(item); // 결과에는 포함 (통계용)
        continue;
      }

      var upResult = await uploadListing(item);
      if (upResult.ok) {
        uploaded++;
        existingIds.add(item.source_id);
        var fieldCount = Object.keys(item).filter(function(k) {
          return item[k] !== null && item[k] !== undefined && item[k] !== '';
        }).length;
        var priceStr = item.deal === '매매' ? (item.price || 0) + '만' : (item.deposit || 0) + '/' + (item.monthly || 0);
        var warnings = [];
        if (!item.lat || !item.lng) warnings.push('좌표없음');
        if (!item.contact) warnings.push('연락처없음');
        if (!item.area_m2) warnings.push('면적없음');
        if (!item.description) warnings.push('설명없음');
        var warnStr = warnings.length > 0 ? ' ⚠' + warnings.join(',') : '';
        console.log('  ✓ [' + item.source_id + '] ' + fieldCount + '필드 | ' + (item.dong || '') + ' ' + item.deal + ' ' + priceStr + ' | ' + (item.contact || '연락처없음') + warnStr);
      } else {
        failed++;
        console.error('  ✗ [' + item.source_id + '] 업로드 실패: ' + upResult.error);
      }
      results.push(item);
      await sleep(300);
    }
    console.log('  누적: 업로드=' + uploaded + ' 건너뜀=' + skipped + ' 거부=' + rejected + ' 실패=' + failed);
    pg++;
    await sleep(DELAY_MS);
  }

  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  GSC Crawler v10.1 완료               ║');
  console.log('║  총 파싱: ' + results.length + '건');
  console.log('║  업로드: ' + uploaded + ' | 건너뜀: ' + skipped);
  console.log('║  거부(불량): ' + rejected + ' | 실패: ' + failed);
  console.log('║  상세 성공: ' + detailOk + ' | 상세 실패: ' + detailFail);
  console.log('╚═══════════════════════════════════════╝');

  if (rejected > 0) {
    console.warn('\n⚠️ 검증 거부된 매물 ' + rejected + '건은 업로드되지 않았습니다.');
    console.warn('   가격=0, 주소 누락 등 불량 데이터가 DB에 들어가는 것을 방지했습니다.');
  }

  return results;
})();
