import { NextRequest, NextResponse } from 'next/server';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'wishes2026';
const BUILDING_API_KEY = process.env.BUILDING_REGISTRY_API_KEY || '';
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';

const FIELD_MAP: Record<string, string> = {
  bldNm: 'buildingName',
  mainPurpsCdNm: 'buildingPurpose',
  etcPurps: 'etcPurpose',
  strctCdNm: 'buildingStructure',
  roofCdNm: 'roofStructure',
  platArea: 'siteArea',
  archArea: 'buildingArea',
  totArea: 'totalFloorArea',
  bcRat: 'buildingCoverageRatio',
  vlRat: 'floorAreaRatio',
  grndFlrCnt: 'totalFloors',
  ugrndFlrCnt: 'undergroundFloors',
  rideUseElvtCnt: 'rideElevatorCount',
  emgenUseElvtCnt: 'emergencyElevatorCount',
  indrMechUtcnt: 'indoorMechParking',
  indrAutoUtcnt: 'indoorAutoParking',
  oudrMechUtcnt: 'outdoorMechParking',
  oudrAutoUtcnt: 'outdoorAutoParking',
  useAprDay: 'approvalDate',
  pmsDay: 'permitDate',
  stcnsDay: 'constructionStartDate',
  newPlatPlc: 'roadAddress',
  platPlc: 'jibunAddress',
  regstrGbCdNm: 'registryType',
  regstrKindCdNm: 'registryKind',
  hhldCnt: 'householdCount',
  hoCnt: 'unitCount',
  fmlyCnt: 'familyCount',
  dongNm: 'dongName',
};

interface KakaoAddress {
  address_name: string;
  b_code: string;
  h_code: string;
  main_address_no: string;
  sub_address_no: string;
  region_1depth_name: string;
  region_2depth_name: string;
  region_3depth_name: string;
}

interface KakaoResult {
  address: KakaoAddress;
  road_address: any;
}

async function resolveAddress(address: string) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Kakao API error: ${res.status}`);
  const json = await res.json();
  if (!json.documents || json.documents.length === 0) {
    throw new Error('Kakao: address not found');
  }
  const doc: KakaoResult = json.documents[0];
  const addr = doc.address;
  if (!addr || !addr.b_code) throw new Error('Kakao: no b_code in result');

  const bCode = addr.b_code;
  const sigunguCd = bCode.substring(0, 5);
  const bjdongCd = bCode.substring(5, 10);
  const bun = (addr.main_address_no || '0').padStart(4, '0');
  const ji = (addr.sub_address_no || '0').padStart(4, '0');

  return { sigunguCd, bjdongCd, bun, ji, bCode, fullAddress: addr.address_name };
}

async function callBuildingAPI(endpoint: string, params: Record<string, string>) {
  const base = `http://apis.data.go.kr/1613000/BldRgstService_v2/${endpoint}`;
  const otherParams = new URLSearchParams({
    numOfRows: '100',
    pageNo: '1',
    _type: 'json',
    ...params,
  });
  const url = `${base}?serviceKey=${BUILDING_API_KEY}&${otherParams.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Building API ${endpoint} error: ${res.status}`);
  const text = await res.text();

  try {
    const json = JSON.parse(text);
    const body = json?.response?.body;
    if (!body) return [];
    const items = body.items?.item;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  } catch {
    return [];
  }
}

function mapFields(items: any[]): Record<string, any> {
  const result: Record<string, any> = {};
  if (!items || items.length === 0) return result;
  const item = items[0];
  for (const [apiKey, fieldName] of Object.entries(FIELD_MAP)) {
    if (item[apiKey] !== undefined && item[apiKey] !== null && item[apiKey] !== '') {
      result[fieldName] = item[apiKey];
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const address = request.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }

  try {
    const { sigunguCd, bjdongCd, bun, ji, bCode, fullAddress } = await resolveAddress(address);

    const baseParams = { sigunguCd, bjdongCd, platGbCd: '0', bun, ji };

    const [basisItems, recapItems, titleItems, floorItems] = await Promise.all([
      callBuildingAPI('getBrBasisOulnInfo', baseParams),
      callBuildingAPI('getBrRecapTitleInfo', baseParams),
      callBuildingAPI('getBrTitleInfo', baseParams),
      callBuildingAPI('getBrFlrOulnInfo', baseParams),
    ]);

    const basisData = mapFields(basisItems);
    const recapData = mapFields(recapItems);
    const titleData = mapFields(titleItems);

    const floorDetails = floorItems.map((f: any) => ({
      floorNo: f.flrNo,
      floorGb: f.flrGbCdNm,
      floorNoNm: f.flrNoNm,
      area: f.area,
      mainPurpose: f.mainPurpsCdNm,
      etcPurpose: f.etcPurps,
    }));

    const buildingData = {
      ...basisData,
      ...recapData,
      ...titleData,
    };

    const elevatorCount =
      (parseInt(buildingData.rideElevatorCount) || 0) +
      (parseInt(buildingData.emergencyElevatorCount) || 0);
    const parkingCount =
      (parseInt(buildingData.indoorMechParking) || 0) +
      (parseInt(buildingData.indoorAutoParking) || 0) +
      (parseInt(buildingData.outdoorMechParking) || 0) +
      (parseInt(buildingData.outdoorAutoParking) || 0);

    buildingData.elevatorCount = elevatorCount;
    buildingData.parkingCount = parkingCount;

    return NextResponse.json({
      success: true,
      query: { address, sigunguCd, bjdongCd, bun, ji, bCode, fullAddress },
      data: buildingData,
      floors: floorDetails,
      raw: {
        basisCount: basisItems.length,
        recapCount: recapItems.length,
        titleCount: titleItems.length,
        floorCount: floorItems.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Unknown error', query: { address } },
      { status: 500 }
    );
  }
}
