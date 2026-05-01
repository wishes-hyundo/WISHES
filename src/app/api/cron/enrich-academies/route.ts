/**
 * /api/cron/enrich-academies — 매물 반경 1km 학원 + 어린이집 카운트 (Kakao 무료)
 *
 * PR-C-academy (2026-04-30): academy_count + daycare_count 동시 채움.
 *   기존: academy_count 만, limit 50, 매일 11:30
 *   이후: academy + daycare 동시, limit 100, 매시간
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
  // PR-C-academy: academy_count OR daycare_count 둘 중 하나라도 NULL 인 매물 우선
  const { data: targets } = await supabase
    .from('listings')
    .select('id, lat, lng, academy_count, daycare_count')
    .eq('status', '공개')
    .not('lat', 'is', null)
    .or('academy_count.is.null,daycare_count.is.null')
    .limit(100);

  let updated = 0;
  for (const t of (targets || []) as { id: number; lat: number; lng: number; academy_count: number | null; daycare_count: number | null }[]) {
    if (!t.lat || !t.lng) continue;
    // 이미 채워진 건 건너뜀 (Kakao 호출 절감)
    const updates: { academy_count?: number; daycare_count?: number; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    const tasks: Promise<void>[] = [];
    if (t.academy_count == null) {
      tasks.push(count(t.lat, t.lng, '학원').then((n) => { updates.academy_count = n; }));
    }
    if (t.daycare_count == null) {
      tasks.push(count(t.lat, t.lng, '어린이집').then((n) => { updates.daycare_count = n; }));
    }
    await Promise.all(tasks);
    await supabase.from('listings').update(updates).eq('id', t.id);
    updated++;
  }
  return NextResponse.json({ success: true, updated, scanned: targets?.length || 0 });
}
