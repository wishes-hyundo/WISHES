import { NextRequest, NextResponse } from 'next/server';

// 공공데이터포털 건축물대장 API
const BUILDING_API_BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';

// XML 값 추출 헬퍼
function parseXMLValue(xml: string, tag: string): string {
  const regex = new RegExp('<' + tag + '>([^<]*)</' + tag + '>');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

// 시군구 코드 매핑
const SIGUNGU_CODES: Record<string, string> = {
  // 서울특별시
  '종로구': '11110', '중구': '11140', '용산구': '11170', '성동구': '11200',
  '광진구': '11215', '동대문구': '11230', '중랑구': '11260', '성북구': '11290',
  '강북구': '11305', '도봉구': '11320', '노원구': '11350', '은평구': '11380',
  '서대문구': '11410', '마포구': '11440', '양천구': '11470', '강서구': '11500',
  '구로구': '11530', '금천구': '11545', '영등포구': '11560', '동작구': '11590',
  '관악구': '11620', '서초구': '11650', '강남구': '11680', '송파구': '11710',
  '강동구': '11740',
  // 경기도 주요 도시
  '수원시': '41110', '성남시': '41130', '용인시': '41460', '안양시': '41170',
  '안산시': '41270', '고양시': '41280', '남양주시': '41360', '의정부시': '41150',
  '시흥시': '41390', '화성시': '41590', '부천시': '41190', '광명시': '41210',
  '하남시': '41450', '파주시': '41480', '김포시': '41570', '군포시': '41410',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address') || '';
  const debug = searchParams.get('debug') === 'true';

  if (!address) {
    return NextResponse.json({ success: false, message: '주소를 입력해주세요.' }, { status: 400 });
  }

  const apiKey = process.env.DATA_GO_KR_API_KEY;
  
  if (!apiKey) {
    console.error('[Building Registry] DATA_GO_KR_API_KEY not set');
    return NextResponse.json({
      success: false,
      message: '건축물대장 API 키가 설정되지 않았습니다.',
      estimatedData: generateEstimatedData(address)
    });
  }

  try {
    // 시군구 코드 찾기
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
      console.error('[Building Registry] No sigunguCd found for address:', address);
      return NextResponse.json({
        success: false,
        message: '해당 주소의 시군구 코드를 찾을 수 없습니다.',
        estimatedData: generateEstimatedData(address)
      });
    }

    // data.go.kr API 키는 이미 디코딩된 상태이거나 인코딩된 상태일 수 있음
    // URLSearchParams가 자동으로 인코딩하므로, 이미 인코딩된 키는 디코딩 후 사용
    let decodedKey = apiKey;
    try {
      // API 키가 URL 인코딩되어 있으면 디코딩
      if (apiKey.includes('%')) {
        decodedKey = decodeURIComponent(apiKey);
      }
    } catch (e) {
      decodedKey = apiKey;
    }

    // 건축물대장 API 호출 (표제부)
    const endpoints = [
      { name: 'getBrTitleInfo', label: '총괄표제부' },
      { name: 'getBrRecapTitleInfo', label: '표제부' },
      { name: 'getBrBasisOulnInfo', label: '기본개요' }
    ];

    let buildingData: Record<string, string> = {};
    let apiSuccess = false;
    const debugInfo: string[] = [];

    for (const endpoint of endpoints) {
      try {
        const params = new URLSearchParams({
          serviceKey: decodedKey,
          sigunguCd: sigunguCd,
          bjdongCd: '',
          numOfRows: '10',
          pageNo: '1',
          _type: 'xml'
        });
        
        const url = BUILDING_API_BASE + '/' + endpoint.name + '?' + params.toString();
        
        if (debug) {
          debugInfo.push(endpoint.name + ' URL length: ' + url.length);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: { 'Accept': 'application/xml' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          debugInfo.push(endpoint.name + ' HTTP error: ' + response.status);
          continue;
        }

        const xmlText = await response.text();
        
        if (debug) {
          debugInfo.push(endpoint.name + ' response length: ' + xmlText.length);
        }

        // 에러 체크
        const resultCode = parseXMLValue(xmlText, 'resultCode');
        const resultMsg = parseXMLValue(xmlText, 'resultMsg');
        
        if (resultCode && resultCode !== '00') {
          debugInfo.push(endpoint.name + ' API error: ' + resultCode + ' - ' + resultMsg);
          continue;
        }

        // 데이터가 있는지 확인
        const totalCount = parseXMLValue(xmlText, 'totalCount');
        if (totalCount === '0' || !xmlText.includes('<item>')) {
          debugInfo.push(endpoint.name + ': no items found (totalCount: ' + totalCount + ')');
          continue;
        }

        // 데이터 파싱
        apiSuccess = true;
        const purpose = parseXMLValue(xmlText, 'mainPurpsCdNm');
        const structure = parseXMLValue(xmlText, 'strctCdNm');
        const approvalDate = parseXMLValue(xmlText, 'useAprDay');
        const grndFlrCnt = parseXMLValue(xmlText, 'grndFlrCnt');
        const ugrndFlrCnt = parseXMLValue(xmlText, 'ugrndFlrCnt');
        const totArea = parseXMLValue(xmlText, 'totArea');
        const archArea = parseXMLValue(xmlText, 'archArea');
        const elvtCnt = parseXMLValue(xmlText, 'elvtCnt');
        const pkngCnt = parseXMLValue(xmlText, 'pkngCnt');
        const hhldCnt = parseXMLValue(xmlText, 'hhldCnt');

        if (purpose) buildingData.buildingPurpose = purpose;
        if (structure) buildingData.buildingStructure = structure;
        if (approvalDate) buildingData.approvalDate = approvalDate;
        if (grndFlrCnt) buildingData.totalFloors = grndFlrCnt;
        if (ugrndFlrCnt) buildingData.undergroundFloors = ugrndFlrCnt;
        if (totArea) buildingData.totalFloorArea = totArea;
        if (archArea) buildingData.buildingArea = archArea;
        if (elvtCnt) buildingData.elevatorCount = elvtCnt;
        if (pkngCnt) buildingData.parkingCount = pkngCnt;
        if (hhldCnt) buildingData.householdCount = hhldCnt;

        if (apiSuccess) break;
      } catch (endpointError) {
        const errMsg = endpointError instanceof Error ? endpointError.message : String(endpointError);
        debugInfo.push(endpoint.name + ' error: ' + errMsg);
        console.error('[Building Registry] ' + endpoint.name + ' error:', errMsg);
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

    console.error('[Building Registry] No data found. Debug:', debugInfo.join(' | '));
    return NextResponse.json({
      success: false,
      message: '건축물대장 정보를 찾을 수 없습니다.',
      estimatedData: generateEstimatedData(address),
      ...(debug ? { debugInfo, matchedDistrict, sigunguCd } : {})
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Building Registry] Unexpected error:', errMsg);
    return NextResponse.json({
      success: false,
      message: '건축물대장 조회 중 오류가 발생했습니다: ' + errMsg,
      estimatedData: generateEstimatedData(address)
    });
  }
}

function generateEstimatedData(address: string) {
  const isApartment = address.includes('아파트') || address.includes('APT');
  const buildingType = isApartment ? '아파트' : '다세대주택';
  return {
    buildingType,
    structure: '철근콘크리트구조',
    note: '건축물대장 API에서 데이터를 찾을 수 없어 추정 데이터입니다.'
  };
}
