/**
 * /api/cron/geocode-missing
 * 
 * lat/lng NULL 매물 자동 좌표 보정 (Kakao Local API).
 * 사장님 명령: 자동화. cron 매일 호출.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // G-73 (2026-05-03): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 무인증 통과)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = (request.headers.get('authorization') || '');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
  if (!KAKAO_KEY) {
    return NextResponse.json({ success: false, error: 'KAKAO_REST_API_KEY 미설정' }, { status: 500 });
  }

  try {
    const supabase = createServerClient();

    // [Step F-4 + F-5 fix 2026-05-18] status 확장 + road_address NEVER backfill
    const { data: targets, error } = await supabase
      .from('listings')
      .select('id, address, lat, lng, road_address')
      .or('lat.is.null,lng.is.null,and(road_address.is.null,road_address_fetched_at.is.null)')
      .in('status', ['공개', '비공개'])
      .not('address', 'is', null)
      .order('road_address_fetched_at', { ascending: true, nullsFirst: true })
      .limit(100);  // [DB-1 boost-v2 2026-05-18] 500 → 100 (Vercel 60s timeout 안전 + 5분 schedule)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!targets || targets.length === 0) {
      return NextResponse.json({ success: true, geocoded: 0, message: '좌표 누락 매물 없음' });
    }

    let geocoded = 0;
    let roadFilled = 0;
    for (const t of targets) {
      try {
        // [F-3 적용] analyze_type=exact + address_type 검증 (REGION 거부)
        const tryFetch = async (mode: 'exact' | 'similar') => {
          const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent((t as any).address)}&analyze_type=${mode}`;
          const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
          if (!r.ok) return null;
          const j = await r.json();
          const doc = j?.documents?.[0];
          if (!doc || doc.address_type === 'REGION') return null;
          return doc;
        };
        const doc = (await tryFetch('exact')) || (await tryFetch('similar'));
        if (!doc) continue;
        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
          road_address_fetched_at: new Date().toISOString(),
        };
        if (doc.x && doc.y && (!(t as any).lat || !(t as any).lng)) {
          updateData.lat = parseFloat(doc.y);
          updateData.lng = parseFloat(doc.x);
          geocoded++;
        }
        const ra = (doc.road_address && doc.road_address.address_name) || null;
        if (ra && !(t as any).road_address) {
          updateData.road_address = ra;
          roadFilled++;
        }
        await supabase.from('listings').update(updateData).eq('id', (t as any).id);
      } catch (e) {
        console.warn('[geocode-missing] one failed:', e);
      }
    }

    return NextResponse.json({ success: true, geocoded, roadFilled, total: targets.length, ts: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 });
  }
}
