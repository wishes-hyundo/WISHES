/**
 * L-BLCM API endpoint — 건축물 도면정보 (평면도 이미지 URL 반환)
 *
 * Query:
 *   ?bldKey=<mgmBldrgstPk>     → 건축물대장키로 검색 (가장 정확, Layer 4 응답에서 가져옴)
 *   ?bjdongCd=<10자리>&bun=...&ji=... → 지번주소로 검색
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';
import { fetchBlcmFloorplansByBldKey, fetchBlcmFloorplansByJibun } from '@/lib/external/blcmFloorplan';

export const runtime = 'nodejs';
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['superadmin', 'master', 'agent', 'crawler_bridge', 'internal_bearer']);

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAuthStrict(request);
  if (!auth.ok || !ALLOWED_ROLES.has(auth.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const bldKey = (sp.get('bldKey') || sp.get('mgmBldrgstPk') || '').trim();
  const bjdongCd = (sp.get('bjdongCd') || '').trim();
  const bun = (sp.get('bun') || '').trim();
  const ji = (sp.get('ji') || '').trim();

  if (bldKey) {
    const result = await fetchBlcmFloorplansByBldKey(bldKey);
    return NextResponse.json(result);
  }

  if (bjdongCd && bun) {
    if (bjdongCd.length !== 10) {
      return NextResponse.json({ error: 'bjdongCd must be 10-digit' }, { status: 400 });
    }
    const result = await fetchBlcmFloorplansByJibun(bjdongCd, bun, ji || '0');
    return NextResponse.json(result);
  }

  return NextResponse.json(
    { error: 'bldKey or (bjdongCd+bun+ji) required' },
    { status: 400 },
  );
}
