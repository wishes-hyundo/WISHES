import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.DATA_GO_KR_API_KEY || '';
const API_BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';

const SIGUNGU_CODES: Record<string, string> = {
  '종로구': '11110', '중구': '11140', '용산구': '11170', '성동구': '11200',
  '광진구': '11215', '동대문구': '11230', '중랑구': '11260', '성북구': '11290',
  '강북구': '11305', '도봉구': '11320', '노원구': '11350', '은평구': '11380',
  '서대문구': '11410', '마포구': '11440', '양천구': '11470', '강서구': '11500',
  '구로구': '11530', '금천구': '11545', '영등포구': '11560', '동작구': '11590',
  '관악구': '11620', '서초구': '11650', '강남구': '11680', '송파구': '11710',
  '강동구': '11740',
  '수원시': '41110', '성남시': '41130', '안양시': '41170', '부천시': '41190',
  '광명시': '41210', '평택시': '41220', '안산시': '41270', '고양시': '41280',
  '과천시': '41290', '의왕시': '41430', '군포시': '41410', '하남시': '41450',
  '용인시': '41460', '파주시': '41480', '이천시': '41500', '안성시': '41550',
  '김포시': '41570', '화성시': '41590', '광주시': '41610', '양주시': '41630',
  '수원시 장안구': '41111', '수원시 권선구': '41113', '수원시 팔달구': '41115', '수원시 영통구': '41117',
  '성남시 수정구': '41131', '성남시 중원구': '41133', '성남시 분당구': '41135',
  '안양시 만안구': '41171', '안양시 동안구': '41173',
  '안산시 상록구': '41271', '안산시 단원구': '41273',
  '고양시 덕양구': '41281', '고양시 일산동구': '41285', '고양시 일산서구': '41287',
  '용인시 처인구': '41461', '용인시 기흥구': '41463', '용인시 수지구': '41465',
};

const BJDONG_CODES: Record<string, Record<string, string>> = {
  '11680': { '역삼동': '10300', '개포동': '10100', '논현동': '10400', '삼성동': '10500', '대치동': '10200', '청담동': '10800', '신사동': '10600', '압구정동': '10700', '세곡동': '10900', '자곡동': '11000', '율현동': '11100', '일원동': '11200', '수서동': '11300', '도곡동': '10000' },
  '11650': { '서초동': '10100', '잠원동': '10200', '반포동': '10300', '방배동': '10400', '양재동': '10500', '내곡동': '10600', '우면동': '10700' },
  '11710': { '잠실동': '10100', '신천동': '10200', '풍납동': '10300', '송파동': '10400', '석촌동': '10500', '삼전동': '10600', '가락동': '10700', '문정동': '10800', '장지동': '10900', '방이동': '11000', '오금동': '11100', '거여동': '11200', '마천동': '11300' },
  '11740': { '강일동': '10100', '상일동': '10200', '명일동': '10300', '고덕동': '10400', '암사동': '10500', '천호동': '10600', '성내동': '10700', '길동': '10800', '둔촌동': '10900' },
  '11620': { '봉천동': '10100', '신림동': '10200', '남현동': '10300' },
  '11440': { '공덕동': '10100', '아현동': '10200', '도화동': '10300', '용강동': '10400', '대흥동': '10500', '염리동': '10600', '신수동': '10700', '서교동': '10800', '동교동': '10900', '합정동': '11000', '망원동': '11100', '연남동': '11200', '성산동': '11300', '상암동': '11400' },
  '11170': { '후암동': '10100', '용산동': '10200', '남영동': '10300', '청파동': '10400', '원효로': '10500', '이촌동': '10600', '이태원동': '10700', '한남동': '10800', '서빙고동': '10900', '보광동': '11000' },
  '11200': { '성수동': '10100', '송정동': '10200', '용답동': '10300', '행당동': '10400', '응봉동': '10500', '금호동': '10600', '옥수동': '10700', '마장동': '10800', '사근동': '10900', '하왕십리동': '11000', '상왕십리동': '11100' },
  '11110': { '청운동': '10100', '신교동': '10200', '효자동': '10400', '사직동': '11500', '세종로': '11900', '종로1가': '12600', '종로2가': '13800', '종로3가': '15600', '종로4가': '15700', '종로5가': '15800', '이화동': '16000', '혜화동': '16400', '창신동': '17000', '평창동': '17900', '부암동': '18000', '무악동': '18300' },
  '11140': { '무교동': '10100', '다동': '10200', '을지로1가': '10400', '을지로2가': '10500', '소공동': '11100', '회현동1가': '11500', '명동1가': '12200', '명동2가': '12300', '필동1가': '13800', '장충1가': '14200', '광희동1가': '14400', '신당동': '16500', '황학동': '16100' },
  '11215': { '중곡동': '10100', '능동': '10200', '구의동': '10300', '광장동': '10400', '자양동': '10500', '화양동': '10600', '군자동': '10700' },
  '11230': { '신설동': '10100', '용두동': '10200', '제기동': '10300', '전농동': '10400', '답십리동': '10500', '장안동': '10600', '청량리동': '10700', '회기동': '10800', '휘경동': '10900', '이문동': '11000' },
  '11260': { '면목동': '10100', '상봉동': '10200', '중화동': '10300', '묵동': '10400', '망우동': '10500', '신내동': '10600' },
  '11290': { '성북동': '10100', '돈암동': '10300', '안암동': '10700', '보문동': '10800', '정릉동': '10900', '길음동': '11000', '종암동': '11100', '장위동': '11400', '석관동': '11500' },
  '11305': { '미아동': '10100', '번동': '10200', '수유동': '10300', '우이동': '10400' },
  '11320': { '쌍문동': '10100', '방학동': '10200', '창동': '10300', '도봉동': '10400' },
  '11350': { '월계동': '10100', '공릉동': '10200', '하계동': '10300', '상계동': '10400', '중계동': '10500' },
  '11380': { '녹번동': '10100', '불광동': '10200', '구산동': '10400', '응암동': '10600', '역촌동': '10700', '증산동': '10900', '진관동': '11100' },
  '11410': { '홍제동': '11100', '연희동': '11700', '홍은동': '11800', '남가좌동': '11900', '북가좌동': '12000', '창천동': '11600', '봉원동': '11500', '신촌동': '11400', '북아현동': '11000' },
  '11470': { '신정동': '10100', '목동': '10200', '신월동': '10300' },
  '11500': { '염창동': '10100', '등촌동': '10200', '화곡동': '10300', '가양동': '10400', '마곡동': '10500', '방화동': '10900' },
  '11530': { '신도림동': '10100', '구로동': '10200', '고척동': '10400', '개봉동': '10500', '오류동': '10600', '천왕동': '10900' },
  '11545': { '가산동': '10100', '독산동': '10200', '시흥동': '10300' },
  '11560': { '여의도동': '11000', '당산동': '11100', '문래동': '11200', '양평동': '11300', '신길동': '11400', '대림동': '11500' },
  '11590': { '노량진동': '10100', '상도동': '10200', '흑석동': '10500', '사당동': '10700', '대방동': '10800', '신대방동': '10900' },
  '41135': { '분당동': '10100', '수내동': '10200', '정자동': '10300', '서현동': '10400', '이매동': '10500', '야탑동': '10600', '판교동': '10700', '삼평동': '10800', '백현동': '10900' },
  '41285': { '장항동': '10100', '마두동': '10200', '백석동': '10300', '중산동': '10500', '정발산동': '10600', '식사동': '10700' },
  '41287': { '탄현동': '10100', '주엽동': '10200', '대화동': '10300', '일산동': '10700' },
  '41465': { '풍덕천동': '10100', '죅전동': '10200', '동천동': '10300', '상현동': '10500', '성복동': '10600' },
  '41463': { '구갈동': '10100', '보라동': '10300', '신갈동': '10700', '영덕동': '10800', '마북동': '11000', '동백동': '11100' },
  '41117': { '영통동': '10100', '원천동': '10300', '매탄동': '10400', '망포동': '10500' },
};

const FIELD_MAP: [string, string][] = [
  ['bldNm', 'buildingName'],
  ['mainPurpsCdNm', 'buildingPurpose'],
  ['etcPurps', 'etcPurpose'],
  ['strctCdNm', 'buildingStructure'],
  ['roofCdNm', 'roofStructure'],
  ['platArea', 'siteArea'],
  ['archArea', 'buildingArea'],
  ['totArea', 'totalFloorArea'],
  ['bcRat', 'buildingCoverageRatio'],
  ['vlRat', 'floorAreaRatio'],
  ['grndFlrCnt', 'totalFloors'],
  ['ugrndFlrCnt', 'undergroundFloors'],
  ['rideUseElvtCnt', 'rideElevatorCount'],
  ['emgenUseElvtCnt', 'emergencyElevatorCount'],
  ['indrMechUtcnt', 'indoorMechParking'],
  ['indrAutoUtcnt', 'indoorAutoParking'],
  ['oudrMechUtcnt', 'outdoorMechParking'],
  ['oudrAutoUtcnt', 'outdoorAutoParking'],
  ['useAprDay', 'approvalDate'],
  ['pmsDay', 'permitDate'],
  ['stcnsDay', 'constructionStartDate'],
  ['newPlatPlc', 'roadAddress'],
  ['platPlc', 'jibunAddress'],
  ['regstrGbCdNm', 'registryType'],
  ['regstrKindCdNm', 'registryKind'],
  ['hhldCnt', 'householdCount'],
  ['hoCnt', 'unitCount'],
  ['fmlyCnt', 'familyCount'],
  ['dongNm', 'dongName'],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

function extractDong(address: string): string {
  const parts = address.split(/\s+/);
  for (const part of parts) {
    if (part.endsWith('동') && part.length >= 2 && part.length <= 6) return part;
    const m = part.match(/^(.+동)\d+가$/);
    if (m) return m[1];
  }
  return '';
}

function extractDistrict(address: string): string {
  const m = address.match(/([가-힣]+[구군시])\s/);
  return m ? m[1] : '';
}

function extractBunJi(address: string): { bun: string; ji: string } {
  const m = address.match(/(\d+)(?:-(\d+))?\s*$/);
  if (m) return { bun: m[1].padStart(4, '0'), ji: (m[2] || '0').padStart(4, '0') };
  return { bun: '0000', ji: '0000' };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  let sigunguCd = searchParams.get('sigunguCd') || '';
  let bjdongCd = searchParams.get('bjdongCd') || '';
  let bun = searchParams.get('bun') || '';
  let ji = searchParams.get('ji') || '';
  const platGbCd = searchParams.get('platGbCd') || '0';
  const address = searchParams.get('address') || '';
  const dong = searchParams.get('dong') || '';
  const sigungu = searchParams.get('sigungu') || '';
  const debug = searchParams.get('debug') === 'true';

  if (!sigunguCd && address) {
    const district = sigungu || extractDistrict(address);
    sigunguCd = SIGUNGU_CODES[district] || '';
    if (sigunguCd) {
      const dongName = dong || extractDong(address);
      bjdongCd = (BJDONG_CODES[sigunguCd] && BJDONG_CODES[sigunguCd][dongName]) || '';
    }
  }

  if (!bun && address) {
    const bunJi = extractBunJi(address);
    bun = bunJi.bun;
    ji = bunJi.ji;
  }

  if (!sigunguCd) {
    return NextResponse.json({
      success: false,
      message: '시군구코드를 확인할 수 없습니다. 주소를 다시 확인해주세요.',
      debug: debug ? { address, sigungu, dong } : undefined,
    });
  }

  if (!API_KEY) {
    return NextResponse.json({
      success: false,
      message: '건축물대장 API 키가 설정되지 않았습니다.',
      estimatedData: estimatedData(address),
    });
  }

  try {
    let decodedKey = API_KEY;
    try { if (API_KEY.includes('%')) decodedKey = decodeURIComponent(API_KEY); } catch { /* keep original */ }

    const endpoints = ['getBrBasisOulnInfo', 'getBrRecapTitleInfo', 'getBrTitleInfo', 'getBrFlrOulnInfo'];

    const baseParams: Record<string, string> = {
      serviceKey: decodedKey,
      sigunguCd,
      numOfRows: '100',
      pageNo: '1',
      _type: 'json',
    };
    if (bjdongCd) baseParams.bjdongCd = bjdongCd;
    if (bun && bun !== '0000') baseParams.bun = bun;
    if (ji && ji !== '0000') baseParams.ji = ji;
    baseParams.platGbCd = platGbCd;

    const debugInfo: string[] = [];

    const results = await Promise.allSettled(
      endpoints.map(async (ep) => {
        const params = new URLSearchParams(baseParams);
        const url = `${API_BASE}/${ep}?${params.toString()}`;
        debugInfo.push(`${ep}: requesting`);

        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);

        if (!res.ok) {
          debugInfo.push(`${ep}: HTTP ${res.status}`);
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json() as AnyObj;
        const header = json.response?.header || json.header || {};
        const body = json.response?.body || json.body || {};

        if (header.resultCode && header.resultCode !== '00') {
          debugInfo.push(`${ep}: api_err=${header.resultCode}`);
          throw new Error(`API error: ${header.resultCode}`);
        }

        const items = body.items?.item;
        const itemArray = Array.isArray(items) ? items : (items ? [items] : []);
        debugInfo.push(`${ep}: ok (${itemArray.length} items)`);
        return { endpoint: ep, items: itemArray };
      })
    );

    const buildingData: Record<string, string | number> = {};
    const floorData: AnyObj[] = [];

    for (let i = 0; i < endpoints.length; i++) {
      const r = results[i];
      if (r.status !== 'fulfilled') continue;
      const { items } = r.value;

      if (endpoints[i] === 'getBrFlrOulnInfo') {
        floorData.push(...items);
        continue;
      }

      const firstItem = items[0];
      if (!firstItem) continue;

      for (const [apiField, dataField] of FIELD_MAP) {
        if (firstItem[apiField] != null && buildingData[dataField] == null) {
          buildingData[dataField] = String(firstItem[apiField]);
        }
      }
    }

    const rideElv = parseInt(String(buildingData.rideElevatorCount || '0'));
    const emgElv = parseInt(String(buildingData.emergencyElevatorCount || '0'));
    buildingData.elevatorCount = String(rideElv + emgElv);

    const iM = parseInt(String(buildingData.indoorMechParking || '0'));
    const iA = parseInt(String(buildingData.indoorAutoParking || '0'));
    const oM = parseInt(String(buildingData.outdoorMechParking || '0'));
    const oA = parseInt(String(buildingData.outdoorAutoParking || '0'));
    buildingData.parkingCount = String(iM + iA + oM + oA);

    const floors = floorData.map((f: AnyObj) => ({
      floorNo: f.flrNo,
      floorType: f.flrGbCdNm,
      purpose: f.mainPurpsCdNm || f.etcPurps || '',
      area: parseFloat(f.area || '0'),
    }));

    if (Object.keys(buildingData).length > 0) {
      return NextResponse.json({
        success: true,
        data: buildingData,
        floors,
        source: 'building_registry_api',
        ...(debug ? { debugInfo, sigunguCd, bjdongCd, bun, ji } : {}),
      });
    }

    return NextResponse.json({
      success: false,
      message: '건축물대장 정보를 찾을 수 없습니다.',
      estimatedData: estimatedData(address),
      ...(debug ? { debugInfo, sigunguCd, bjdongCd, bun, ji } : {}),
    });

  } catch (error) {
    console.error('[building-registry] error:', error);
    return NextResponse.json({
      success: false,
      message: '조회 오류: ' + (error instanceof Error ? error.message : String(error)),
      estimatedData: estimatedData(address),
    });
  }
}

function estimatedData(address: string) {
  return {
    buildingType: address.includes('아파트') ? '아파트' : '다세대주택',
    structure: '철근콘크리트구조',
    note: '건축물대장 API에서 데이터를 찾을 수 없어 추정 데이터입니다.',
  };
}

