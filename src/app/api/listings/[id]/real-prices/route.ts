import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl!, supabaseKey);

const DATA_GO_KR_KEY = (process.env.DATA_GO_KR_API_KEY || '').trim();

// 새 API 베이스 URL (apis.data.go.kr - HTTPS)
const API_BASE = 'https://apis.data.go.kr/1613000';

// 매물 유형별 매매 API 엔드포인트
const SALE_ENDPOINTS: Record<string, { url: string; label: string }> = {
  '아파트': {
    url: `${API_BASE}/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`,
    label: '아파트 매매',
  },
  '오피스텔': {
    url: `${API_BASE}/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade`,
    label: '오피스텔 매매',
  },
  '연립다세대': {
    url: `${API_BASE}/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade`,
    label: '연립다세대 매매',
  },
  '다세대': {
    url: `${API_BASE}/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade`,
    label: '연립다세대 매매',
  },
  '다가구': {
    url: `${API_BASE}/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade`,
    label: '단독/다가구 매매',
  },
  '단독주택': {
    url: `${API_BASE}/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade`,
    label: '단독/다가구 매매',
  },
  '상가': {
    url: `${API_BASE}/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade`,
    label: '상업/업무용 매매',
  },
};

// 매물 유형별 임대(전세/월세) API 엔드포인트
const RENT_ENDPOINTS: Record<string, string> = {
  '아파트': `${API_BASE}/RTMSDataSvcAptRent/getRTMSDataSvcAptRent`,
  '오피스텔': `${API_BASE}/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent`,
  '연립다세대': `${API_BASE}/RTMSDataSvcRHRent/getRTMSDataSvcRHRent`,
  '다세대': `${API_BASE}/RTMSDataSvcRHRent/getRTMSDataSvcRHRent`,
  '다가구': `${API_BASE}/RTMSDataSvcSHRent/getRTMSDataSvcSHRent`,
  '단독주택': `${API_BASE}/RTMSDataSvcSHRent/getRTMSDataSvcSHRent`,
};

function normalizePropertyType(type: string): string {
  const mapping: Record<string, string> = {
    '원룸': '오피스텔',
    '투룸': '오피스텔',
    '쓰리룸': '연립다세대',
    '쓰리룸+': '연립다세대',
    '빌라': '연립다세대',
    '주택': '단독주택',
    '상가점포': '상가',
    '사무실': '오피스텔',
  };
  return mapping[type] || type;
}

function parseXmlValues(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'g');
  const values: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1].trim());
  }
  return values;
}

function getRecentMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = d.getFullYear().toString() + (d.getMonth() + 1).toString().padStart(2, '0');
    months.push(ym);
  }
  return months;
}

function getLawdCd(address: string, dong: string): string {
  const codes: Record<string, string> = {
    '강남구': '11680', '강동구': '11740', '강북구': '11305', '강서구': '11500',
    '관악구': '11620', '광진구': '11215', '구로구': '11530', '금천구': '11545',
    '노원구': '11350', '도봉구': '11320', '동대문구': '11230', '동작구': '11590',
    '마포구': '11440', '서대문구': '11410', '서초구': '11650', '성동구': '11200',
    '성북구': '11290', '송파구': '11710', '양천구': '11470', '영등포구': '11560',
    '용산구': '11170', '은평구': '11380', '종로구': '11110', '중구': '11140',
    '중랑구': '11260',
    '수원시': '41110', '성남시': '41130', '고양시': '41280', '용인시': '41460',
    '부천시': '41190', '안산시': '41270', '안양시': '41170', '남양주시': '41360',
    '화성시': '41590', '평택시': '41220', '의정부시': '41150', '시흥시': '41390',
    '파주시': '41480', '광명시': '41210', '김포시': '41570', '군포시': '41410',
    '광주시': '41610', '이천시': '41500', '양주시': '41630', '오산시': '41370',
    '구리시': '41310', '안성시': '41550', '포천시': '41650', '의왕시': '41430',
    '하남시': '41450', '여주시': '41670', '양평군': '41830', '동두천시': '41250',
    '과천시': '41290', '가평군': '41820', '연천군': '41800',
    '장안구': '41111', '권선구': '41113', '팔달구': '41115', '영통구': '41117',
    '수정구': '41131', '중원구': '41133', '분당구': '41135',
    '덕양구': '41281', '일산동구': '41285', '일산서구': '41287',
    '처인구': '41461', '기흥구': '41463', '수지구': '41465',
    '상록구': '41271', '단원구': '41273',
    '만안구': '41171', '동안구': '41173',
  };

  const dongToGu: Record<string, string> = {
    '방이동': '송파구', '잠실동': '송파구', '문정동': '송파구', '가락동': '송파구',
    '석촌동': '송파구', '송파동': '송파구', '풍납동': '송파구', '삼전동': '송파구',
    '오금동': '송파구', '거여동': '송파구', '마천동': '송파구',
    '역삼동': '강남구', '삼성동': '강남구', '대치동': '강남구', '도곡동': '강남구',
    '청담동': '강남구', '논현동': '강남구', '압구정동': '강남구', '신사동': '강남구',
    '개포동': '강남구', '일원동': '강남구', '수서동': '강남구', '세곡동': '강남구',
    '천호동': '강동구', '길동': '강동구', '둔촌동': '강동구', '명일동': '강동구',
    '고덕동': '강동구', '상일동': '강동구', '암사동': '강동구', '강일동': '강동구',
    '서초동': '서초구', '방배동': '서초구', '잠원동': '서초구', '반포동': '서초구',
    '양재동': '서초구', '내곡동': '서초구', '우면동': '서초구',
    '목동': '양천구', '신월동': '양천구', '신정동': '양천구',
    '화곡동': '강서구', '등촌동': '강서구', '가양동': '강서구', '마곡동': '강서구',
    '발산동': '강서구', '공항동': '강서구', '방화동': '강서구',
    '신림동': '관악구', '봉천동': '관악구', '남현동': '관악구',
    '구로동': '구로구', '신도림동': '구로구', '가리봉동': '구로구', '고척동': '구로구',
    '개봉동': '구로구', '오류동': '구로구', '항동': '구로구',
    '영등포동': '영등포구', '여의도동': '영등포구', '당산동': '영등포구',
    '문래동': '영등포구', '양평동': '영등포구', '신길동': '영등포구',
    '이태원동': '용산구', '한남동': '용산구', '보광동': '용산구', '용산동': '용산구',
    '후암동': '용산구', '남영동': '용산구', '청파동': '용산구',
    '왕십리동': '성동구', '행당동': '성동구', '응봉동': '성동구', '금호동': '성동구',
    '옥수동': '성동구', '성수동': '성동구', '마장동': '성동구',
    '장안동': '동대문구', '답십리동': '동대문구', '전농동': '동대문구',
    '이문동': '동대문구', '회기동': '동대문구', '휘경동': '동대문구',
    '상봉동': '중랑구', '면목동': '중랑구', '묵동': '중랑구', '망우동': '중랑구',
    '신내동': '중랑구', '중화동': '중랑구',
    '미아동': '강북구', '번동': '강북구', '수유동': '강북구', '우이동': '강북구',
    '공릉동': '노원구', '월계동': '노원구', '중계동': '노원구', '하계동': '노원구',
    '상계동': '노원구',
    '쌍문동': '도봉구', '방학동': '도봉구', '창동': '도봉구', '도봉동': '도봉구',
    '연남동': '마포구', '합정동': '마포구', '서교동': '마포구', '상수동': '마포구',
    '망원동': '마포구', '성산동': '마포구', '대흥동': '마포구',
    // 2026-04-21: 연희동은 서대문구 소속 — 아래 서대문구 섹션으로 귀속
    '혜화동': '종로구', '가회동': '종로구', '삼청동': '종로구', '명륜동': '종로구',
    '인사동': '종로구', '사직동': '종로구', '평창동': '종로구', '부암동': '종로구',
    '필동': '중구', '신당동': '중구', '약수동': '중구', '충무로': '중구',
    '명동': '중구', '을지로동': '중구', '황학동': '중구',
    '흑석동': '동작구', '노량진동': '동작구', '상도동': '동작구', '사당동': '동작구',
    '대방동': '동작구', '신대방동': '동작구',
    '독산동': '금천구', '시흥동': '금천구', '가산동': '금천구',
    '수샘동': '은평구', '응암동': '은평구', '녹번동': '은평구', '봈광동': '은평구',
    '진관동': '은평구', '갈현동': '은평구',
    '북아현동': '서대문구', '신촌동': '서대문구', '연희동': '서대문구',
    '남가좌동': '서대문구', '북가좌동': '서대문구', '홍은동': '서대문구',
    '안암동': '성북구', '보문동': '성북구', '삼선동': '성북구', '돈암동': '성북구',
    '길음동': '성북구', '정릉동': '성북구', '장위동': '성북구',
    '자양동': '광진구', '구의동': '광진구', '화양동': '광진구', '중곡동': '광진구',
    '군자동': '광진구', '능동': '광진구',
  };

  const fullAddr = address + ' ' + dong;
  for (const [name, code] of Object.entries(codes)) {
    if (fullAddr.includes(name)) return code;
  }

  const dongName = dong || address;
  if (dongToGu[dongName]) {
    const guName = dongToGu[dongName];
    if (codes[guName]) return codes[guName];
  }

  return '11680';
}

// MOLIT API 데이터 호출 - 다중 폴백 + 진단 정보
async function fetchMolitData(
  apiUrl: string,
  lawdCd: string,
  dealYmd: string,
  isRent: boolean
): Promise<{ data: any[]; debugInfo?: any }> {
  try {
    const keyInfo = {
      len: DATA_GO_KR_KEY.length,
      first4: DATA_GO_KR_KEY.substring(0, 4),
      last4: DATA_GO_KR_KEY.substring(DATA_GO_KR_KEY.length - 4),
      hasPercent: DATA_GO_KR_KEY.includes('%'),
      hasPlus: DATA_GO_KR_KEY.includes('+'),
      hasEqual: DATA_GO_KR_KEY.includes('='),
      hasSlash: DATA_GO_KR_KEY.includes('/'),
    };

    // 시도 1: 키를 encodeURIComponent로 인코딩
    const encodedKey = encodeURIComponent(DATA_GO_KR_KEY);
    const baseParams = `&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=1000&pageNo=1`;
    // L-sec30 (2026-04-22): 공개 GET 이 외부 data.go.kr 를 월 12회 호출.
    //   timeout 없으면 외부 API 지연으로 Vercel 함수 전체 hang.
    const timeoutMs = 6000;
    let url = `${apiUrl}?serviceKey=${encodedKey}${baseParams}`;
    let response = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(timeoutMs) });
    let attempt = 'encoded';

    // 시도 2: 403이면 인코딩 없이 원본 키 사용
    if (response.status === 403) {
      url = `${apiUrl}?serviceKey=${DATA_GO_KR_KEY}${baseParams}`;
      response = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(timeoutMs) });
      attempt = 'raw';
    }

    // 시도 3: 여전히 403이면 키가 이미 인코딩된 상태일 수 있으므로 디코딩 후 재인코딩
    if (response.status === 403 && keyInfo.hasPercent) {
      try {
        const decodedKey = decodeURIComponent(DATA_GO_KR_KEY);
        const reEncodedKey = encodeURIComponent(decodedKey);
        url = `${apiUrl}?serviceKey=${reEncodedKey}${baseParams}`;
        response = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(timeoutMs) });
        attempt = 'decode-reencode';
      } catch(e) { /* decodeURIComponent failed, skip */ }
    }

    const xml = await response.text();
    const debugInfo = {
      status: response.status,
      statusText: response.statusText,
      xmlPreview: xml.substring(0, 500),
      xmlLength: xml.length,
      dealYmd,
      attempt,
      keyInfo,
      apiUrl,
    };

    if (!response.ok) return { data: [], debugInfo };

    if (isRent) {
      const deposits = parseXmlValues(xml, 'deposit');
      const monthlyRents = parseXmlValues(xml, 'monthlyRent');
      const years = parseXmlValues(xml, 'dealYear');
      const months = parseXmlValues(xml, 'dealMonth');

      if (deposits.length === 0) return { data: [], debugInfo };

      return {
        data: deposits.map((dep, i) => {
          const deposit = parseInt(dep.replace(/,/g, '')) || 0;
          const monthlyRent = parseInt((monthlyRents[i] || '0').replace(/,/g, '')) || 0;
          return {
            amount: deposit > 0 ? deposit : monthlyRent,
            deposit,
            monthlyRent,
            year: years[i] || '',
            month: months[i] || '',
          };
        }),
        debugInfo
      };
    } else {
      const amounts = parseXmlValues(xml, 'dealAmount');
      const years = parseXmlValues(xml, 'dealYear');
      const months = parseXmlValues(xml, 'dealMonth');

      if (amounts.length === 0) return { data: [], debugInfo };

      return {
        data: amounts.map((amt, i) => ({
          amount: parseInt(amt.replace(/,/g, '')) || 0,
          year: years[i] || '',
          month: months[i] || '',
        })),
        debugInfo
      };
    }
  } catch (error: any) {
    return { data: [], debugInfo: { error: error.message } };
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const listingId = parseInt(params.id);
    if (isNaN(listingId)) {
      return NextResponse.json({ success: false, error: '잘못된 매물 ID' }, { status: 400 });
    }

    const { data: listing, error } = await supabase
      .from('listings')
      .select('type, deal, address, dong')
      .eq('id', listingId)
      .single();

    if (error || !listing) {
      return NextResponse.json({ success: false, error: '매물을 찾을 수 없습니다' }, { status: 404 });
    }

    const rawType = listing.type || '아파트';
    const propertyType = normalizePropertyType(rawType);
    const dealType = listing.deal || '매매';
    const address = listing.address || listing.dong || '';
    const dong = listing.dong || '';
    const isRent = dealType === '전세' || dealType === '월세';

    if (!DATA_GO_KR_KEY) {
      return NextResponse.json({ success: false, error: 'API 키가 설정되지 않았습니다' }, { status: 500 });
    }

    const lawdCd = getLawdCd(address, dong);

    let apiUrl: string;
    let label: string;
    if (isRent) {
      apiUrl = RENT_ENDPOINTS[propertyType] || RENT_ENDPOINTS['아파트'];
      label = `${rawType} ${dealType}`;
    } else {
      const endpoint = SALE_ENDPOINTS[propertyType] || SALE_ENDPOINTS['아파트'];
      apiUrl = endpoint.url;
      label = endpoint.label;
    }

    const recentMonths = getRecentMonths(12);
    const allData: any[] = [];
    let firstApiDebug: any = null;

    // 첫 번째 API 호출에서 디버그 정보 수집
    for (let i = 0; i < recentMonths.length; i += 3) {
      const batch = recentMonths.slice(i, i + 3);
      const results = await Promise.all(
        batch.map(ym => fetchMolitData(apiUrl, lawdCd, ym, isRent))
      );
      results.forEach((result, idx) => {
        const ym = batch[idx];
        if (!firstApiDebug && result.debugInfo) {
          firstApiDebug = result.debugInfo;
        }
        result.data.forEach(item => {
          allData.push({ ...item, yearMonth: ym });
        });
      });
    }

    const monthlyMap = new Map<string, { total: number; count: number }>();
    recentMonths.forEach(ym => {
      monthlyMap.set(ym, { total: 0, count: 0 });
    });

    allData.forEach(item => {
      const amount = isRent ? (item.deposit || item.amount) : item.amount;
      if (amount > 0) {
        const ym = item.yearMonth;
        const existing = monthlyMap.get(ym);
        if (existing) {
          existing.total += amount;
          existing.count += 1;
        }
      }
    });

    const chartData = recentMonths.map(ym => {
      const data = monthlyMap.get(ym)!;
      const year = ym.substring(2, 4);
      const month = parseInt(ym.substring(4));
      return {
        month: `${year}.${month}`,
        avgPrice: data.count > 0 ? Math.round(data.total / data.count) : 0,
        count: data.count,
      };
    }).filter(d => d.avgPrice > 0 || d.count > 0);

    // L-sec30 (2026-04-22): production 에선 debug 응답 제거 (API 키 메타데이터 누출 차단).
    //   apiKeyLength / keyInfo(first4/last4/hasPercent...) / xmlPreview 는 공격자에게
    //   키 형식/유효성 확인 경로를 제공. dev 환경에서만 노출.
    const isDev = process.env.NODE_ENV !== 'production';
    if (chartData.length === 0) {
      return NextResponse.json({
        success: false,
        error: '해당 지역의 실거래 데이터가 없습니다',
        data: [],
        ...(isDev && {
          debug: {
            rawType,
            propertyType,
            dealType,
            address,
            dong,
            lawdCd,
            isRent,
            apiUrl,
            label,
            recentMonths: recentMonths.slice(0, 3),
            allDataCount: allData.length,
            hasApiKey: !!DATA_GO_KR_KEY,
            firstApiResponse: firstApiDebug,
          },
        }),
      });
    }

    return NextResponse.json({
      success: true,
      data: chartData,
      meta: {
        propertyType: rawType,
        normalizedType: propertyType,
        dealType,
        district: lawdCd,
        label,
        isRent,
        period: `${recentMonths[0]} ~ ${recentMonths[recentMonths.length - 1]}`,
      },
    });
  } catch (error) {
    console.error('Real prices API error:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
