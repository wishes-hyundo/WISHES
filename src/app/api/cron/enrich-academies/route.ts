/**
 * /api/cron/enrich-academies — 매물 반경 1km 학원 정밀 카운트 (Kakao 무료)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY || '';

async function count(lat: number, lng: number, q: string): Promise<number> {
  if (!KAKAO_KEY) return 0;
  try {
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&y=${lat}&x=${lng}&radius=1000`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
    if (!r.ok) return 0;
    const j = await r.json();
    return parseInt(j?.meta?.total_count || '0', 10) || 0;
  } catch { return 0; }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServerClient();
  const { data: targets } = await supabase
    .from('listings')
    .select('id, lat, lng')
    .eq('status', '공개')
    .not('lat', 'is', null)
    .is('academy_count', null)
    .limit(50);
  let updated = 0;
  for (const t of (targets || []) as { id: number; lat: number; lng: number }[]) {
    if (!t.lat || !t.lng) continue;
    const academy = await count(t.lat, t.lng, '학원');
    await supabase.from('listings').update({ academy_count: academy, updated_at: new Date().toISOString() }).eq('id', t.id);
    updated++;
  }
  return NextResponse.json({ success: true, updated });
}
