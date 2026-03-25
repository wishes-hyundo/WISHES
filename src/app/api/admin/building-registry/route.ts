import { NextRequest, NextResponse } from 'next/server';

// 건축HUB 서비스 엔드포인트 (2024년 변경)
const BUILDING_API_BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';

const SIGUNGU_CODES: Record<string, string> = {
  '관악구': '11620', '강남구': '11680', '강동구': '11740', '강북구': '11305',
  '강서구': '11500', '구로구': '11530', '금천구': '11545', '노원구': '11350',
  '도봉구': '11320', '동대문구': '11230', '동작구': '11590', '마포구': '11440',
  '서대문구': '11410', '서초구': '11650', '성동구': '11200', '성북구': '11290',
  '송파구': '11710', '양천구': '11470', '영등포구': '11560', '용산구': '11170',
  '은평구': '11380', '종로구': '11110', '중구': '11140', '중랑구': '11260',
  '광명시': '41210', '과천시': '41290', '구리시': '41310', '군포시': '41410',
  '김포시': '41570', '남양주시': '41360', '부천시': '41190', '성남시': '41130',
  '수원시': '41110', '시흥시': '41390', '안산시': '41270', '안양시': '41170',
  '용인시': '41460', '의왕시': '41430', '의정부시': '41150', '파주시': '41480',
  '하남시': '41450', '화성시': '41590', '고양시': '41280',
};

function parseXMLValue(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function parseXMLItems(xml: string): string[] {
  const items: string[] = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    items.push(match[1]);
  }
  return items;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address') || '';
  const sigungu = searchParams.get('sigungu') || '';
  const bjdong = searchParams.get('bjdong') || '';
  const bun = searchParams.get('bun') || '';
  const ji = searchParams.get('ji') || '';

  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      message: '공공데이터포털 API 키가 설정되지 않았습니다.',
      estimatedData: generateEstimatedData(address),
    });
  }

  try {
    let sigunguCd = '';
    if (sigungu && SIGUNGU_CODES[sigungu]) {
      sigunguCd = SIGUNGU_CODES[sigungu];
    } else {
      for (const [key, code] of Object.entries(SIGUNGU_CODES)) {
        if (address.includes(key)) {
          sigunguCd = code;
          break;
        }
      }
    }

    if (!sigunguCd) {
      return NextResponse.json({
        success: false,
        message: '시군구 코드를 찾을 수 없습니다.',
        estimatedData: generateEstimatedData(address),
      });
    }

    const params = new URLSearchParams({
      serviceKey: apiKey,
      sigunguCd,
      bjdongCd: bjdong || '10300',
      platGbCd: '0',
      bun: bun.padStart(4, '0'),
      ji: ji.padStart(4, '0'),
      numOfRows: '10',
      pageNo: '1',
    });

    // 기본개요 먼저 시도, 없으면 표제부 조회
    const endpoints = ['getBrBasisOulnInfo', 'getBrTitleInfo', 'getBrRecapTitleInfo'];
    let xml = '';
    let items: string[] = [];

    for (const endpoint of endpoints) {
      const url = `${BUILDING_API_BASE}/${endpoint}?${params}`;
      console.log('Trying endpoint:', endpoint, 'URL:', url.substring(0, 200));
      const resp = await fetch(url);
      xml = await resp.text();
      console.log('Response for', endpoint, '(first 500):', xml.substring(0, 500));

      const resultCode = parseXMLValue(xml, 'resultCode');
      if (resultCode && resultCode !== '00') {
        console.error('API error for', endpoint, ':', resultCode, parseXMLValue(xml, 'resultMsg'));
        continue;
      }

      items = parseXMLItems(xml);
      if (items.length > 0) {
        console.log('Found', items.length, 'items from', endpoint);
        break;
      }
    }

    if (items.length === 0) {
      // platGbCd '1' (산) 도 시도
      params.set('platGbCd', '1');
      for (const endpoint of endpoints) {
        const url = `${BUILDING_API_BASE}/${endpoint}?${params}`;
        const resp = await fetch(url);
        xml = await resp.text();
        items = parseXMLItems(xml);
        if (items.length > 0) break;
      }
    }

    if (items.length === 0) {
      return NextResponse.json({
        success: false,
        message: '건축물대장 정보를 찾을 수 없습니다.',
        estimatedData: generateEstimatedData(address),
      });
    }

    const item = items[0];
    const building = {
      buildingName: parseXMLValue(item, 'bldNm'),
      mainPurpose: parseXMLValue(item, 'mainPurpsCdNm'),
      structure: parseXMLValue(item, 'strctCdNm'),
      roof: parseXMLValue(item, 'roofCdNm'),
      totalFloorArea: parseFloat(parseXMLValue(item, 'totArea')) || 0,
      buildingArea: parseFloat(parseXMLValue(item, 'archArea')) || 0,
      undergroundFloors: parseInt(parseXMLValue(item, 'ugrndFlrCnt')) || 0,
      aboveGroundFloors: parseInt(parseXMLValue(item, 'grndFlrCnt')) || 0,
      approvalDate: parseXMLValue(item, 'useAprDay'),
      dongCount: parseInt(parseXMLValue(item, 'dongCnt')) || 0,
      unitCount: parseInt(parseXMLValue(item, 'hoCnt')) || 0,
      elevatorCount: parseInt(parseXMLValue(item, 'rideUseElvtCnt')) || 0,
      parkingCount: (parseInt(parseXMLValue(item, 'indrAutoUtcnt')) || 0) +
                     (parseInt(parseXMLValue(item, 'oudrAutoUtcnt')) || 0),
      address: parseXMLValue(item, 'platPlc'),
      newAddress: parseXMLValue(item, 'newPlatPlc'),
    };

    return NextResponse.json({ success: true, building });
  } catch (error) {
    console.error('Building registry error:', error);
    return NextResponse.json(
      {
        success: false,
        message: '건축물대장 조회 중 오류가 발생했습니다.',
        estimatedData: generateEstimatedData(address),
      },
      { status: 500 }
    );
  }
}

function generateEstimatedData(address: string) {
  const isApt = address.includes('아파트');
  const isOfficetel = address.includes('오피스텔');
  return {
    buildingType: isApt ? '아파트' : isOfficetel ? '오피스텔' : '다세대주택',
    structure: '철근콘크리트구조',
    note: '건축물대장 API에서 데이터를 찾을 수 없어 추정 데이터입니다.',
  };
}