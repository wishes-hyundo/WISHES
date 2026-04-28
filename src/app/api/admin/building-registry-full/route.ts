import { NextRequest, NextResponse } from 'next/server';
// L-sec155 (2026-04-23): 공공 건축물대장 API 래퍼 + 내부 Kakao/registry 자가호출.
//   verifyAdminAuth 는 role=agent JWT 도 통과 → 중개사 계정도 고비용 공공 API
//   + Kakao quota 를 남용 가능. superadmin/master/crawler_bridge 만 허용.
import { verifyAdminAuthStrict } from '@/lib/adminAuth';
import { fetchBuildingData } from '@/app/api/admin/building-registry/route';

const ALLOWED_ROLES = new Set(['superadmin', 'master', 'crawler_bridge', 'internal_bearer']);

// L-sec157 (2026-04-23) Phase 3b: WISHES_INTERNAL_BEARER 우선, 미설정 시 WISHES_ADMIN_MASTER_PASSWORD 폴백.
//   목적: 사람용 마스터키와 기계용 자가호출 토큰 분리. env 가 없을 때는 기존 경로 그대로라 회귀 0.
const INTERNAL_BEARER =
  process.env.WISHES_INTERNAL_BEARER || process.env.WISHES_ADMIN_MASTER_PASSWORD || '';
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';

interface KakaoAddress {
  address_name: string;
  b_code: string;
  main_address_no: string;
  sub_address_no: string;
}

interface KakaoResult {
  address: KakaoAddress;
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

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const address = request.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }

  try {
    const { sigunguCd, bjdongCd, bun, ji, bCode, fullAddress } = await resolveAddress(address);

    // L-fix-no-self-call (2026-04-28): self-call (HTTP fetch wishes.co.kr/api/admin/
    //   building-registry) 자체를 제거. Vercel CDN 거쳐 다시 들어오면서 인증
    //   컨텍스트 손실 + middleware 중복 실행 등으로 401. fetchBuildingData 함수를
    //   직접 호출 → 인증 우회 + 빠름 + 안정적.
    const debugInfo: string[] = [];
    const { buildingData, floors } = await fetchBuildingData(
      sigunguCd, bjdongCd, bun, ji, '0', debugInfo
    );

    if (Object.keys(buildingData).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Building registry data not found',
        query: { address, sigunguCd, bjdongCd, bun, ji, bCode, fullAddress },
        debugInfo,
      });
    }

    return NextResponse.json({
      success: true,
      query: { address, sigunguCd, bjdongCd, bun, ji, bCode, fullAddress },
      data: buildingData,
      floors,
      raw: {},
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Unknown error', query: { address } },
      { status: 500 }
    );
  }
}
