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
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
  if (!KAKAO_KEY) {
    return NextResponse.json({ success: false, error: 'KAKAO_REST_API_KEY 미설정' }, { status: 500 });
  }

  try {
    const supabase = createServerClient();

    // 좌표 누락 매물 50건씩 처리 (rate limit 안전)
    const { data: targets, error } = await supabase
      .from('listings')
      .select('id, address')
      .or('lat.is.null,lng.is.null')
      .eq('status', '공개')
      .not('address', 'is', null)
      .limit(50);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!targets || targets.length === 0) {
      return NextResponse.json({ success: true, geocoded: 0, message: '좌표 누락 매물 없음' });
    }

    let geocoded = 0;
    for (const t of targets) {
      try {
        const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent((t as any).address)}`;
        const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
        const j = await r.json();
        const doc = j?.documents?.[0];
        if (doc?.x && doc?.y) {
          await supabase.from('listings').update({
            lat: parseFloat(doc.y),
            lng: parseFloat(doc.x),
            updated_at: new Date().toISOString(),
          }).eq('id', (t as any).id);
          geocoded++;
        }
      } catch (e) {
        console.warn('[geocode-missing] one failed:', e);
      }
    }

    return NextResponse.json({ success: true, geocoded, total: targets.length, ts: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 });
  }
}
