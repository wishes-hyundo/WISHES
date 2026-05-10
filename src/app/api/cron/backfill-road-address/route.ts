/**
 * /api/cron/backfill-road-address
 * 
 * L-perf-fix-6 (2026-05-10 사장님 명령):
 *   매물 60K 의 road_address 영구 채우기.
 *   cron 매시간 호출. 한번에 500건 (Kakao API rate limit 안전).
 *   60K / 500 = 120 시간 = 5일.
 *   v335 의 Kakao API 호출 자체 제거 (page finish 1.3분 -> 30초 이내).
 *
 * Kakao Local API: https://dapi.kakao.com/v2/local/geo/coord2address.json
 *   - 무료 일 100K 호출 제한
 *   - 매시간 500 = 일 12K, 안전
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // G-73 fail-safe — CRON_SECRET 미설정이면 500
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

  const supabase = createServerClient();
  const startedAt = Date.now();

  // road_address NULL + lat/lng 있는 매물 500건
  const { data: targets, error } = await supabase
    .from('listings')
    .select('id, lat, lng')
    .is('road_address', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('created_at', { ascending: false }) // 최신 매물 먼저
    .limit(500);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!targets || targets.length === 0) {
    return NextResponse.json({ 
      success: true, 
      filled: 0, 
      message: 'road_address 채울 매물 없음 (모두 완료)' 
    });
  }

  let filled = 0;
  let failed = 0;
  let kakao_429 = 0;
  const errors: string[] = [];

  for (const t of targets) {
    try {
      const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${t.lng}&y=${t.lat}&input_coord=WGS84`;
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 429) {
        kakao_429++;
        // rate limit — wait + skip
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      if (!res.ok) {
        failed++;
        if (errors.length < 5) errors.push(`id=${t.id} status=${res.status}`);
        continue;
      }

      const data = await res.json();
      const doc = data?.documents?.[0];
      const roadAddress = doc?.road_address?.address_name || null;

      // road_address 가 null 인 경우도 fetched_at 갱신해서 재호출 안 하게
      const { error: updErr } = await supabase
        .from('listings')
        .update({
          road_address: roadAddress,
          road_address_fetched_at: new Date().toISOString(),
        })
        .eq('id', t.id);

      if (updErr) {
        failed++;
        if (errors.length < 5) errors.push(`id=${t.id} db=${updErr.message}`);
      } else if (roadAddress) {
        filled++;
      }

      // Kakao rate limit 안전 — 100ms 간격
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      failed++;
      if (errors.length < 5) {
        errors.push(`id=${t.id} ex=${(err as Error).message}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    filled,
    failed,
    kakao_429,
    targets: targets.length,
    elapsed_ms: Date.now() - startedAt,
    errors: errors.length > 0 ? errors : undefined,
  });
}
