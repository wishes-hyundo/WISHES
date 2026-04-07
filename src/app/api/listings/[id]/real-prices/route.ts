import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_API_KEY || '';

// 매물 유형별 API 엔드포인트 매핑
const API_ENDPOINTS: Record<string, { url: string; label: string }> = {
  '아파트': {
    url: 'http://openapi.molit.go.kr/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
    label: '아파트 매매',
  },
  '오피스텔': {
    url: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade',
    label: '오피스텔 매매',
  },
  '연립다세대': {
    url: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade',
    label: '연립다세대 매매',
  },
  '다세대': {
    url: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade',
    label: '연립다세대 매매',
  },
  '다가구': {
    url: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade',
    label: '단독/다가구 매매',
  },
  '단독주택': {
    url: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade',
    label: '단독/다가구 매매',
  },
  '상가': {
    url: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade',
    label: '상업/업무용 매매',
  },
  '사무실': {
    url: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade',
    label: '상업/업무용 매매',
  },
  '상업용': {
    url: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade',
    label: '상업/업무용 매매',
  },
  '토지': {
    url: 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcLTrade/getRTMSDataSvcLTrade',
    label: '토지 매매',
  },
};

// 전세 API 엔드포인트 매핑
const RENT_ENDPOINTS: Record<string, string> = {
  '아파트': 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
  '오피스텔': 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent',
  '연립다세대': 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcRHRent/getRTMSDataSvcRHRent',
  '다세대': 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcRHRent/getRTMSDataSvcRHRent',
  '다가구': 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcSHRent/getRTMSDataSvcSHRent',
  '단독주택': 'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstall498/service/rest/RTMSDataSvcSHRent/getRTMSDataSvcSHRent',
};

// 시군구 코드 가져오기 (주소 기반)
function getLawdCd(address: string): string {
  // 서울시 구별 법정동 코드 매핑
  const codes: Record<string, string> = {
    '강남구': '11680', '강동구': '11740', '강북구': '11305', '강서구': '11500',
    '관악구': '11620', '광진구': '11215', '구로구': '11530', '금천구': '11545',
    '노원구': '11350', '도봉구': '11320', '동대문구': '11230', '동작구': '11590',
    '마포구': '11440', '서대문구': '11410', '서초구': '11650', '성동구': '11200',
    '성북구': '11290', '송파구': '11710', '양천구': '11470', '영등포구': '11560',
    '용산구': '11170', '은평구': '11380', '종로구': '11110', '중구': '11140',
    '중랑구': '11260',
    // 경기도 주요 시
    '수원시': '41110', '성남시': '41130', '고양시': '41280', '용인시': '41460',
    '부천시': '41190', '안산시': '41270', '안양시': '41170', '남양주시': '41360',
    '화성시': '41590', '평택시': '41220', '의정부시': '41150', '시흥시': '41390',
    '파주시': '41480', '광명시': '41210', '김포시': '41570', '군포시': '41410',
    '광주시': '41610', '이천시': '41500', '양주시': '41630', '오산시': '41370',
    '구리시': '41310', '안성시': '41550', '포천시': '41650', '의왕시': '41430',
    '하남시': '41450', '여주시': '41670', '양평군': '41830', '동두천시': '41250',
    '과천시': '41290', '가평군': '41820', '연천군': '41800',
    // 수원시 세부
    '장안구': '41111', '권선구': '41113', '팔달구': '41115', '영통구': '41117',
    // 성남시 세부
    '수정구': '41131', '중원구': '41133', '분당구': '41135',
    // 고양시 세부
    '덕양구': '41281', '일산동구': '41285', '일산서구': '41287',
    // 용인시 세부
    '처인구': '41461', '기흥구': '41463', '수지구': '41465',
    // 안산시 세부
    '상록구': '41271', '단원구': '41273',
    // 안양시 세부
    '만안구': '41171', '동안구': '41173',
  };

  // 주소에서 구/시 찾기
  for (const [name, code] of Object.entries(codes)) {
    if (address.includes(name)) return code;
  }
  // 기본값: 강남구
  return '11680';
}

// 최근 12개월 YYYYMM 목록 생성
function getRecentMonths(count: number = 12): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

// XML 파싱 (간단한 유틸)
function parseXmlValue(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g');
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

// MOLIT API 호출
async function fetchMolitData(apiUrl: string, lawdCd: string, dealYmd: string): Promise<any[]> {
  const params = new URLSearchParams({
    serviceKey: DATA_GO_KR_KEY,
    LAWD_CD: lawdCd,
    DEAL_YMD: dealYmd,
    numOfRows: '1000',
    pageNo: '1',
  });

  try {
    const url = `${apiUrl}?${params.toString()}`;
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { 'Accept': 'application/xml' }
    });

    if (!response.ok) return [];

    const xml = await response.text();

    // 거래금액 추출
    const amounts = parseXmlValue(xml, '거래금액');
    const years = parseXmlValue(xml, '년');
    const months = parseXmlValue(xml, '월');

    if (amounts.length === 0) return [];

    return amounts.map((amt, i) => ({
      amount: parseInt(amt.replace(/,/g, '')) || 0,
      year: years[i] || '',
      month: months[i] || '',
    }));
  } catch (error) {
    console.error('MOLIT API error:', error);
    return [];
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

    // DB에서 매물 정보 조회
    const { data: listing, error } = await supabase
      .from('listings')
      .select('type, deal, address, dong')
      .eq('id', listingId)
      .single();

    if (error || !listing) {
      return NextResponse.json({ success: false, error: '매물을 찾을 수 없습니다' }, { status: 404 });
    }

    const propertyType = listing.type || '아파트';
    const dealType = listing.deal || '매매';
    const address = listing.address || listing.dong || '';

    // API 키 확인
    if (!DATA_GO_KR_KEY) {
      return NextResponse.json({ success: false, error: 'API 키가 설정되지 않았습니다' }, { status: 500 });
    }

    // 법정동 코드 가져오기
    const lawdCd = getLawdCd(address);

    // API 엔드포인트 결정
    let apiUrl: string;
    if (dealType === '전세' || dealType === '월세') {
      apiUrl = RENT_ENDPOINTS[propertyType] || RENT_ENDPOINTS['아파트'];
    } else {
      apiUrl = API_ENDPOINTS[propertyType]?.url || API_ENDPOINTS['아파트'].url;
    }

    // 최근 12개월 데이터 수집
    const recentMonths = getRecentMonths(12);
    const allData: any[] = [];

    // 병렬로 API 호출 (3개씩 배치)
    for (let i = 0; i < recentMonths.length; i += 3) {
      const batch = recentMonths.slice(i, i + 3);
      const results = await Promise.all(
        batch.map(ym => fetchMolitData(apiUrl, lawdCd, ym))
      );
      results.forEach((data, idx) => {
        const ym = batch[idx];
        data.forEach(item => {
          allData.push({ ...item, yearMonth: ym });
        });
      });
    }

    // 월별 집계
    const monthlyMap = new Map<string, { total: number; count: number }>();
    recentMonths.forEach(ym => {
      monthlyMap.set(ym, { total: 0, count: 0 });
    });

    allData.forEach(item => {
      if (item.amount > 0) {
        const ym = item.yearMonth;
        const existing = monthlyMap.get(ym);
        if (existing) {
          existing.total += item.amount;
          existing.count += 1;
        }
      }
    });

    // 결과 포맷팅
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

    // 데이터가 없으면 빈 결과 반환
    if (chartData.length === 0) {
      return NextResponse.json({
        success: false,
        error: '해당 지역의 실거래 데이터가 없습니다',
        data: [],
      });
    }

    return NextResponse.json({
      success: true,
      data: chartData,
      meta: {
        propertyType,
        dealType,
        district: lawdCd,
        label: API_ENDPOINTS[propertyType]?.label || '실거래가',
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
