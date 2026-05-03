/**
 * /api/cron/enrich-subway — 지하철역 카운트 + 가까운 역 (Kakao 무료)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY || '';

export async function GET(request: NextRequest) {
  // G-73 (2026-05-03): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 무인증 통과)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = (request.headers.get('authorization') || '');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!KAKAO_KEY) return NextResponse.json({ error: 'KAKAO_REST_API_KEY 미설정' }, { status: 500 });

  const supabase = createServerClient();
  const { data: targets } = await supabase
    .from('listings')
    .select('id, lat, lng')
    .eq('status', '공개')
    .not('lat', 'is', null)
    .is('subway_count', null)
    .limit(100);

  let updated = 0;
  for (const t of (targets || []) as { id: number; lat: number; lng: number }[]) {
    if (!t.lat || !t.lng) continue;
    try {
      const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&y=${t.lat}&x=${t.lng}&radius=1500`;
      const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
      if (!r.ok) continue;
      const j = await r.json();
      const docs = j?.documents || [];
      const subway_count = parseInt(j?.meta?.total_count || '0', 10) || 0;
      const subway_data = docs.slice(0, 3).map((d: { place_name: string; distance: string }) => ({ name: d.place_name, distance_m: parseInt(d.distance || '0', 10) }));
      await supabase.from('listings').update({
        subway_count, subway_data, updated_at: new Date().toISOString()
      }).eq('id', t.id);
      updated++;
    } catch { /* skip */ }
  }
  return NextResponse.json({ success: true, updated });
}
