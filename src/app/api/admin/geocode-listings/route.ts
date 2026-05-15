// ────────────────────────────────────────
// POST /api/admin/geocode-listings - 좌표 없는 매물 일괄 지오코딩
// ────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

interface GeoResult {
  id: number;
  address: string;
  lat: number | null;
  lng: number | null;
  status: 'success' | 'failed' | 'no_address';
}

async function kakaoAddress(q: string) {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}`,
    { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
  );
  if (!res.ok) return null;
  const d = await res.json();
  const doc = d?.documents?.[0];
  return doc ? { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } : null;
}

async function kakaoKeyword(q: string) {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}`,
    { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } }
  );
  if (!res.ok) return null;
  const d = await res.json();
  const doc = d?.documents?.[0];
  return doc ? { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } : null;
}

/**
 * 주소 정리: 건물명/층/호수 제거하여 카카오 주소 API 가 받아들이도록 정규화.
 */
function cleanAddress(raw: string): string[] {
  const candidates = new Set<string>();
  const s = raw.trim();
  candidates.add(s);

  // 건물명 prefix 제거: "한국생활건강상가 서울 성동구 ..." → "서울 성동구 ..."
  const m1 = s.match(/(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주).*/);
  if (m1) candidates.add(m1[0]);

  // 뒷부분 "5층"/"304호"/"B1층" 제거
  for (const c of [...candidates]) {
    const stripped = c
      .replace(/\s*(?:지하|B)?\s*\d+\s*층.*$/, '')
      .replace(/\s*\d+\s*호.*$/, '')
      .replace(/\s*\d+\s*동\s*\d+\s*호.*$/, '')
      .trim();
    if (stripped && stripped !== c) candidates.add(stripped);
  }

  // 숫자 prefix 만 남은 이상 주소 "오금동 1340000" → "오금동" 만 남김
  for (const c of [...candidates]) {
    const normalized = c.replace(/\s+\d{5,}$/, '').trim();
    if (normalized && normalized !== c) candidates.add(normalized);
  }

  return [...candidates].filter((x) => x.length >= 3);
}

/**
 * 주소를 위도/경도로 변환.
 * 1차: 원본 주소 검색 API
 * 2차: 정리된 후보들 주소 검색 API (건물명/층/호수 제거)
 * 3차: 키워드 검색 API (동/건물명 검색)
 * 4차: 동 이름만으로 주소 검색 (중심좌표)
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || !KAKAO_REST_API_KEY) return null;

  try {
    const candidates = cleanAddress(address);

    // 1+2차: 모든 후보를 주소 API 시도
    for (const c of candidates) {
      const hit = await kakaoAddress(c);
      if (hit) return hit;
    }

    // 3차: 원본 + 정리본 키워드 검색
    for (const c of candidates) {
      const hit = await kakaoKeyword(c);
      if (hit) return hit;
    }

    // 4차: 동 이름만으로 중심좌표
    const dongMatch = address.match(/([가-힣]+동)(?:\s|$)/);
    if (dongMatch) {
      const hit = await kakaoAddress(dongMatch[1]);
      if (hit) return hit;
    }

    return null;
  } catch {
    return null;
  }
}

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // L-sec3 (2026-04-22): 인증 미보호 → verifyAdminAuth 추가
  // (Kakao API 유료 호출 + listings 대량 UPDATE — 무인증 차단 필수)
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 300);

    // 사장님 명령 2026-05-15: ids body 로 특정 매물만 지정 + lat=0/lng=0 도 fix
    let bodyIds: number[] = [];
    try {
      const body = await request.clone().json();
      if (Array.isArray(body?.ids)) {
        bodyIds = body.ids.filter((x: any) => Number.isInteger(x) && x > 0).slice(0, 500);
      }
    } catch { /* no body — fall back to "all NULL/0 coords" */ }

    // 좌표가 없는 (NULL) 또는 0 인 매물 조회
    let query = supabase
      .from('listings')
      .select('id, address, lat, lng');
    if (bodyIds.length > 0) {
      query = query.in('id', bodyIds);
    } else {
      // NULL 좌표 OR 0 좌표 (onhouse 크롤러 fallback 버그) 모두 잡음
      query = query.or('lat.is.null,lng.is.null,lat.eq.0,lng.eq.0');
    }
    const { data: listings, error: fetchError } = await query
      .order('id', { ascending: false })
      .limit(limit);

    if (fetchError) {
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json({ success: true, message: '좌표가 없는 매물이 없습니다', updated: 0 });
    }

    const results: GeoResult[] = [];

    for (const listing of listings) {
      const address = listing.address;

      if (!address) {
        results.push({ id: listing.id, address: '', lat: null, lng: null, status: 'no_address' });
        continue;
      }

      const coords = await geocodeAddress(address);

      if (coords) {
        const { error: updateError } = await supabase
          .from('listings')
          .update({ lat: coords.lat, lng: coords.lng })
          .eq('id', listing.id);

        results.push({
          id: listing.id,
          address,
          lat: coords.lat,
          lng: coords.lng,
          status: updateError ? 'failed' : 'success',
        });
      } else {
        results.push({ id: listing.id, address, lat: null, lng: null, status: 'failed' });
      }

      // Rate limiting: 100ms 딜레이
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = results.filter(r => r.status === 'success').length;

    return NextResponse.json({
      success: true,
      message: `${listings.length}개 매물 중 ${successCount}개 좌표 업데이트 완료`,
      total: listings.length,
      updated: successCount,
      results,
    });
  } catch (error) {
    console.error('지오코딩 오류:', error);
    return NextResponse.json({ success: false, error: '지오코딩에 실패했습니다' }, { status: 500 });
  }
}

// GET 핸들러: 좌표 없는 매물 수 확인 (모니터링용)
export async function GET(request: NextRequest) {
  // L-sec3 (2026-04-22): 인증 미보호 → verifyAdminAuth 추가
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const supabase = createServerClient();

    const { count, error } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .or('lat.is.null,lng.is.null');

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pendingCount: count || 0,
      message: count ? `${count}개 매물의 좌표가 누락되어 있습니다` : '모든 매물에 좌표가 설정되어 있습니다',
    });
  } catch (error) {
    console.error('좌표 확인 오류:', error);
    return NextResponse.json({ success: false, error: '확인에 실패했습니다' }, { status: 500 });
  }
                                        }
