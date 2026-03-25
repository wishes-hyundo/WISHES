import { NextRequest, NextResponse } from 'next/server';

const API_BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';

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

const BJDONG_CODES: Record<string, Record<string, string>> = {
  '11680': {
    '역삼동': '10300', '개포동': '10100', '논현동': '10400', '삼성동': '10500',
    '대치동': '10200', '청담동': '10800', '신사동': '10600', '압구정동': '10700',
    '세곡동': '10900', '자곡동': '11000', '율현동': '11100', '일원동': '11200',
    '수서동': '11300', '도곡동': '10000',
  },
  '11650': {
    '서초동': '10100', '잠원동': '10200', '반포동': '10300', '방배동': '10400',
    '양재동': '10500', '내곡동': '10600', '우면동': '10700',
  },
  '11710': {
    '잠실동': '10100', '신천동': '10200', '풍납동': '10300', '송파동': '10400',
    '석촌동': '10500', '삼전동': '10600', '가락동': '10700', '문정동': '10800',
    '장지동': '10900', '방이동': '11000', '오금동': '11100', '거여동': '11200',
    '마천동': '11300',
  },
  '11620': { '봉천동': '10100', '신림동': '10200', '남현동': '10300' },
  '11440': {
    '공덕동': '10100', '아현동': '10200', '도화동': '10300', '용강동': '10400',
    '대흥동': '10500', '염리동': '10600', '신수동': '10700', '서교동': '10800',
    '동교동': '10900', '합정동': '11000', '망원동': '11100', '연남동': '11200',
    '성산동': '11300', '상암동': '11400',
  },
  '11170': {
    '후암동': '10100', '용산동': '10200', '남영동': '10300', '청파동': '10400',
    '원효로': '10500', '이촌동': '10600', '이태원동': '10700', '한남동': '10800',
    '서빙고동': '10900', '보광동': '11000',
  },
  '11200': {
    '성수동': '10100', '송정동': '10200', '용답동': '10300', '행당동': '10400',
    '응봉동': '10500', '금호동': '10600', '옥수동': '10700', '마장동': '10800',
    '사근동': '10900', '하왕십리동': '11000', '상왕십리동': '11100',
  },
};

function extractDong(address: string): string {
  const parts = address.split(/\s+/);
  for (const part of parts) {
    if (part.endsWith('동') && part.length >= 2 && part.length <= 6) {
      return part;
    }
  }
  return '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const FIELD_MAP: [string, string][] = [
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address') || '';
  const debug = searchParams.get('debug') === 'true';
  if (!address) {
    return NextResponse.json({ success: false, message: '주소를 입력해주세요.' }, { status: 400 });
  }

  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, message: 'API 키 미설정', estimatedData: estimateData(address) });
  }

  try {
    let sigunguCd = '';
    let district = '';
    for (const [d, code] of Object.entries(SIGUNGU_CODES)) {
      if (address.includes(d)) { sigunguCd = code; district = d; break; }
    }
    if (!sigunguCd) {
      return NextResponse.json({ success: false, message: '시군구 코드 없음', estimatedData: estimateData(address) });
    }

    const dongName = extractDong(address);
    const bjdongCd = (BJDONG_CODES[sigunguCd] && BJDONG_CODES[sigunguCd][dongName]) || '';

    let decodedKey = apiKey;
    try { if (apiKey.includes('%')) decodedKey = decodeURIComponent(apiKey); } catch { /* keep original */ }

    const endpoints = ['getBrRecapTitleInfo', 'getBrTitleInfo', 'getBrBasisOulnInfo'];
    let buildingData: Record<string, string> = {};
    const debugInfo: string[] = [];

    for (const ep of endpoints) {
      try {
        const params = new URLSearchParams({
          serviceKey: decodedKey,
          sigunguCd,
          numOfRows: '5',
          pageNo: '1',
          _type: 'json',
        });
        if (bjdongCd) params.set('bjdongCd', bjdongCd);

        const url = API_BASE + '/' + ep + '?' + params.toString();
        debugInfo.push(ep + ': sg=' + sigunguCd + ' bj=' + (bjdongCd || '-') + ' dong=' + dongName);

        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) { debugInfo.push(ep + ' HTTP ' + res.status); continue; }

        const json = await res.json() as AnyObj;
        debugInfo.push(ep + ' ok');

        const header = json.response?.header || json.header || {};
        const body = json.response?.body || json.body || {};

        if (header.resultCode && header.resultCode !== '00') {
          debugInfo.push(ep + ' api_err=' + header.resultCode);
          continue;
        }

        const totalCount = Number(body.totalCount || 0);
        if (totalCount === 0) {
          debugInfo.push(ep + ' count=0');
          continue;
        }

        const items = body.items?.item;
        const firstItem: AnyObj = Array.isArray(items) ? items[0] : (items || {});
        if (!firstItem || Object.keys(firstItem).length === 0) {
          debugInfo.push(ep + ' no_item');
          continue;
        }

        for (const [apiField, dataField] of FIELD_MAP) {
          if (firstItem[apiField] != null) buildingData[dataField] = String(firstItem[apiField]);
        }

        if (Object.keys(buildingData).length > 0) {
          return NextResponse.json({
            success: true,
            data: buildingData,
            source: 'building_registry_api',
            ...(debug ? { debugInfo, district, sigunguCd, dongName, bjdongCd } : {})
          });
        }
      } catch (err) {
        debugInfo.push(ep + ' err: ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    return NextResponse.json({
      success: false,
      message: '건축물대장 정보를 찾을 수 없습니다.',
      estimatedData: estimateData(address),
      ...(debug ? { debugInfo, district, sigunguCd, dongName, bjdongCd } : {})
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: '조회 오류: ' + (error instanceof Error ? error.message : String(error)),
      estimatedData: estimateData(address)
    });
  }
}

function estimateData(address: string) {
  return {
    buildingType: address.includes('아파트') ? '아파트' : '다세대주택',
    structure: '철근콘크리트구조',
    note: '건축물대장 API에서 데이터를 찾을 수 없어 추정 데이터입니다.'
  };
}
