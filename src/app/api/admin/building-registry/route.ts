import { NextRequest, NextResponse } from 'next/server';

const BUILDING_API_BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';

function parseXMLValue(xml: string, tag: string): string {
  const regex = new RegExp('<' + tag + '>([^<]*)</' + tag + '>');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

const SIGUNGU_CODES: Record<string, string> = {
  '종로구': '11110', '중구': '11140', '용산구': '11170', '성동구': '11200',
  '광진구': '11215', '동대문구': '11230', '중랑구': '11260', '성북구': '11290',
  '강북구': '11305', '도봉구': '11320', '노원구': '11350', '은평구': '11380',
  '서대문구': '11410', '마포구': '11440', '양천구': '11470', '강서구': '11500',
  '구로구': '11530', '금천구': '11545', '영등포구': '11560', '동작구': '11590',
  '관악구': '11620', '서초구': '11650', '강남구': '11680', '송파구': '11710',
  '강동구': '11740',
  '수원시': '41110', '성남시': '41130', '용인시': '41460', '안양시': '41170',
  '안산시': '41270', '고양시': '41280', '남양주시': '41360', '의정부시': '41150',
  '시흥시': '41390', '화성시': '41590', '부천시': '41190', '광명시': '41210',
  '하남시': '41450', '파주시': '41480', '김포시': '41570', '군포시': '41410',
};

// 주요 법정동 코드 매핑 (시군구코드별)
const BJDONG_CODES: Record<string, Record<string, string>> = {
  '11680': { // 강남구
    '역삼동': '10300', '개포동': '10100', '논현동': '10400',
    '삼성동': '10500', '대치동': '10200', '청담동': '10800',
    '신사동': '10600', '압구정동': '10700', '세곡동': '10900',
    '자곡동': '11000', '율현동': '11100', '일원동': '11200',
    '수서동': '11300', '도곡동': '10000',
  },
  '11650': { // 서초구
    '서초동': '10100', '잠원동': '10200', '반포동': '10300',
    '방배동': '10400', '양재동': '10500', '내곡동': '10600',
    '우면동': '10700', '원지동': '10800', '신원동': '10900',
  },
  '11710': { // 송파구
    '잠실동': '10100', '신천동': '10200', '풍납동': '10300',
    '송파동': '10400', '석촌동': '10500', '삼전동': '10600',
    '가락동': '10700', '문정동': '10800', '장지동': '10900',
    '방이동': '11000', '오금동': '11100', '거여동': '11200',
    '마천동': '11300', '위례동': '11400',
  },
  '11620': { // 관악구
    '봉천동': '10100', '신림동': '10200', '남현동': '10300',
  },
  '11440': { // 마포구
    '공덕동': '10100', '아현동': '10200', '도화동': '10300',
    '용강동': '10400', '대흥동': '10500', '염리동': '10600',
    '신수동': '10700', '서교동': '10800', '동교동': '10900',
    '합정동': '11000', '망원동': '11100', '연남동': '11200',
    '성산동': '11300', '상암동': '11400',
  },
  '11170': { // 용산구
    '후암동': '10100', '용산동': '10200', '남영동': '10300',
    '청파동': '10400', '원효로': '10500', '이촌동': '10600',
    '이태원동': '10700', '한남동': '10800', '서빙고동': '10900',
    '보광동': '11000', '한강로': '11100',
  },
  '11200': { // 성동구
    '성수동': '10100', '송정동': '10200', '용답동': '10300',
    '행당동': '10400', '응봉동': '10500', '금호동': '10600',
    '옥수동': '10700', '마장동': '10800', '사근동': '10900',
    '하왕십리동': '11000', '상왕십리동': '11100',
  },
};

function extractDong(address: string): string {
  const dongMatch = address.match(/([가-힣]+동)\b/);
  if (dongMatch) return dongMatch[1];
  const roMatch = address.match(/([가-힣]+로)\b/);
  if (roMatch) return roMatch[1];
  return '';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address') || '';
  const debug = searchParams.get('debug') === 'true';

  if (!address) {
    return NextResponse.json({ success: false, message: '주소를 입력해주세요.' }, { status: 400 });
  }

  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    console.error('[Building] DATA_GO_KR_API_KEY not set');
    return NextResponse.json({
      success: false,
      message: '건축물대장 API 키가 설정되지 않았습니다.',
      estimatedData: generateEstimatedData(address)
    });
  }

  try {
    let sigunguCd = '';
    let matchedDistrict = '';
    for (const [district, code] of Object.entries(SIGUNGU_CODES)) {
      if (address.includes(district)) {
        sigunguCd = code;
        matchedDistrict = district;
        break;
      }
    }

    if (!sigunguCd) {
      return NextResponse.json({
        success: false,
        message: '해당 주소의 시군구 코드를 찾을 수 없습니다.',
        estimatedData: generateEstimatedData(address)
      });
    }

    // 법정동 코드 조회
    const dongName = extractDong(address);
    let bjdongCd = '';
    if (sigunguCd && BJDONG_CODES[sigunguCd] && dongName) {
      bjdongCd = BJDONG_CODES[sigunguCd][dongName] || '';
    }

    // API 키 디코딩 (URL 인코딩된 키 처리)
    let decodedKey = apiKey;
    try {
      if (apiKey.includes('%')) decodedKey = decodeURIComponent(apiKey);
    } catch { decodedKey = apiKey; }

    const endpoints = [
      { name: 'getBrRecapTitleInfo', label: '표제부' },
      { name: 'getBrTitleInfo', label: '총괄표제부' },
      { name: 'getBrBasisOulnInfo', label: '기본개요' }
    ];

    let buildingData: Record<string, string> = {};
    let apiSuccess = false;
    const debugInfo: string[] = [];

    for (const endpoint of endpoints) {
      try {
        // bjdongCd가 있으면 포함, 없으면 제외
        const paramObj: Record<string, string> = {
          serviceKey: decodedKey,
          sigunguCd: sigunguCd,
          numOfRows: '5',
          pageNo: '1',
        };
        if (bjdongCd) {
          paramObj.bjdongCd = bjdongCd;
        }
        
        const params = new URLSearchParams(paramObj);
        const url = BUILDING_API_BASE + '/' + endpoint.name + '?' + params.toString();

        debugInfo.push(endpoint.name + ': sigungu=' + sigunguCd + ', bjdong=' + (bjdongCd || 'none') + ', dong=' + dongName);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          debugInfo.push(endpoint.name + ' HTTP ' + response.status);
          continue;
        }

        const xmlText = await response.text();
        debugInfo.push(endpoint.name + ' resp=' + xmlText.length + 'B');

        // 상세 에러 체크
        const resultCode = parseXMLValue(xmlText, 'resultCode');
        const resultMsg = parseXMLValue(xmlText, 'resultMsg');

        if (resultCode && resultCode !== '00') {
          debugInfo.push(endpoint.name + ' err: ' + resultCode + '/' + resultMsg);
          continue;
        }

        const totalCount = parseXMLValue(xmlText, 'totalCount');
        if (totalCount === '0' || !xmlText.includes('<item>')) {
          debugInfo.push(endpoint.name + ' totalCount=' + totalCount);
          // 디버그에 응답 첫 부분 추가
          if (debug) debugInfo.push(endpoint.name + ' xml_start: ' + xmlText.substring(0, 200));
          continue;
        }

        apiSuccess = true;
        const fields: [string, string][] = [
          ['mainPurpsCdNm', 'buildingPurpose'],
          ['strctCdNm', 'buildingStructure'],
          ['useAprDay', 'approvalDate'],
          ['grndFlrCnt', 'totalFloors'],
          ['ugrndFlrCnt', 'undergroundFloors'],
          ['totArea', 'totalFloorArea'],
          ['archArea', 'buildingArea'],
          ['elvtCnt', 'elevatorCount'],
          ['pkngCnt', 'parkingCount'],
          ['hhldCnt', 'householdCount'],
          ['platArea', 'siteArea'],
          ['bcRat', 'buildingCoverageRatio'],
          ['vlRat', 'floorAreaRatio'],
        ];
        
        for (const [xmlField, dataField] of fields) {
          const val = parseXMLValue(xmlText, xmlField);
          if (val) buildingData[dataField] = val;
        }

        if (apiSuccess) break;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        debugInfo.push(endpoint.name + ' error: ' + errMsg);
      }
    }

    if (apiSuccess && Object.keys(buildingData).length > 0) {
      return NextResponse.json({
        success: true,
        data: buildingData,
        source: 'building_registry_api',
        ...(debug ? { debugInfo } : {})
      });
    }

    return NextResponse.json({
      success: false,
      message: '건축물대장 정보를 찾을 수 없습니다.',
      estimatedData: generateEstimatedData(address),
      ...(debug ? { debugInfo, matchedDistrict, sigunguCd, dongName, bjdongCd } : {})
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Building] Error:', errMsg);
    return NextResponse.json({
      success: false,
      message: '건축물대장 조회 중 오류: ' + errMsg,
      estimatedData: generateEstimatedData(address)
    });
  }
}

function generateEstimatedData(address: string) {
  const isApartment = address.includes('아파트') || address.includes('APT');
  return {
    buildingType: isApartment ? '아파트' : '다세대주택',
    structure: '철근콘크리트구조',
    note: '건축물대장 API에서 데이터를 찾을 수 없어 추정 데이터입니다.'
  };
}
