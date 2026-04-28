import { NextRequest, NextResponse } from 'next/server';
// L-sec155 (2026-04-23): 공공 건축물대장 API 래퍼 + 내부 Kakao/registry 자가호출.
//   verifyAdminAuth 는 role=agent JWT 도 통과 → 중개사 계정도 고비용 공공 API
//   + Kakao quota 를 남용 가능. superadmin/master/crawler_bridge 만 허용.
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

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

    // Call the existing working building-registry endpoint.
    // L-fix-passthrough (2026-04-28): caller 는 이미 verifyAdminAuthStrict 통과
    //   (superadmin/master/crawler_bridge/internal_bearer 만 ALLOWED_ROLES). 따라서
    //   caller 의 Authorization + Cookie 를 그대로 forward 하면 inner 도 동일
    //   토큰으로 통과. INTERNAL_BEARER env 의 길이/매칭 issue 회피.
    //   query token (?token=master) fallback 도 같이 forward (cron 호환).
    const registryUrl = `${SITE_URL}/api/admin/building-registry?sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}`;
    const userAuth = request.headers.get('authorization') || '';
    const userCookie = request.headers.get('cookie') || '';
    const fetchHdrs: Record<string, string> = {};
    if (userAuth) {
      // caller 가 Authorization 들고 옴 → 그대로 forward.
      fetchHdrs.Authorization = userAuth;
    } else if (userCookie) {
      // cookie-only caller (사장님 /admin 로그인 케이스) → Authorization 추가 X.
      // inner verifyAdminAuth 의 ws_session 쿠키 fallback 으로 인증.
    } else if (INTERNAL_BEARER) {
      // 둘 다 없는 cron/내부 자동화 — INTERNAL_BEARER fallback.
      fetchHdrs.Authorization = `Bearer ${INTERNAL_BEARER}`;
    }
    if (userCookie) fetchHdrs.Cookie = userCookie;
    const registryRes = await fetch(registryUrl, { headers: fetchHdrs });

    if (!registryRes.ok) {
      const errText = await registryRes.text();
      throw new Error(`Building registry API error: ${registryRes.status} - ${errText.substring(0, 200)}`);
    }

    const registryData = await registryRes.json();

    return NextResponse.json({
      success: true,
      query: { address, sigunguCd, bjdongCd, bun, ji, bCode, fullAddress },
      data: registryData.data || {},
      floors: registryData.floors || [],
      raw: registryData.raw || {},
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Unknown error', query: { address } },
      { status: 500 }
    );
  }
}
