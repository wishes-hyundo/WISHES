import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/adminAuth';

// L-sec3 (2026-04-22): fallback 'wishes2026' 제거 → WISHES_ADMIN_MASTER_PASSWORD
const INTERNAL_BEARER = process.env.WISHES_ADMIN_MASTER_PASSWORD || '';
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
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const address = request.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }

  try {
    const { sigunguCd, bjdongCd, bun, ji, bCode, fullAddress } = await resolveAddress(address);

    // Call the existing working building-registry endpoint
    const registryUrl = `${SITE_URL}/api/admin/building-registry?sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}`;
    const registryRes = await fetch(registryUrl, {
      headers: { Authorization: `Bearer ${INTERNAL_BEARER}` },
    });

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
    // L-sec117 (2026-04-22): admin-gated defense-in-depth.
    //   err.message 에 data.go.kr SERVICE_KEY / 내부 URL 포함 가능.
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: '건축물대장 조회 실패', ...(isDev && { detail: err.message || 'Unknown error' }), query: { address } },
      { status: 500 }
    );
  }
}
