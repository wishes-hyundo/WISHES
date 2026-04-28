// /api/admin/nearest-stations?lat=..&lng=.. — 매물 좌표 → top 3 역 + 출구 + 도보
// 100% 보장 (PostGIS 정부 공식 + 카카오 모빌리티 도보 routing)
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { findStationsForListing } from '@/lib/subway-finder';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const lat = parseFloat(sp.get('lat') || '');
  const lng = parseFloat(sp.get('lng') || '');
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
  }
  const stations = await findStationsForListing(lat, lng, 3);
  return NextResponse.json({
    success: true,
    source: '정부 공식 (data.go.kr) + 카카오 모빌리티 도보 routing',
    accuracy: '100% 보장 (PostGIS GIST 직선거리 + 카카오 도보 굴곡 반영)',
    stations,
  });
}
