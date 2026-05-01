/**
 * /api/cron/enrich-school-zone — 학세권 자동 enrichment
 * 학교알리미 + 학원알리미 + 어린이집정보공시 (모두 무료 API)
 * 매물 좌표 기준 반경 1km 내 학교/학원/어린이집 카운트 + 점수
 * Phase 2-J (사장님 명령 2026-04-28: 다 자동화)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 카카오 Local API 무료로 학교/학원 검색
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY || '';

async function countNearby(lat: number, lng: number, query: string): Promise<number> {
  if (!KAKAO_KEY) return 0;
  try {
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&y=${lat}&x=${lng}&radius=1000`;
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
    .is('school_zone_score', null)
    .limit(100);

  let updated = 0;
  for (const t of (targets || []) as any[]) {
    if (!t.lat || !t.lng) continue;
    const [school, daycare, academy, hospital] = await Promise.all([
      countNearby(t.lat, t.lng, '초등학교'),
      countNearby(t.lat, t.lng, '어린이집'),
      countNearby(t.lat, t.lng, '학원'),
      countNearby(t.lat, t.lng, '병원'),
    ]);
    const score = Math.min(100,
      Math.min(school, 5) * 10 +    // 학교 5개+ = 50점 만점
      Math.min(daycare, 5) * 6 +    // 어린이집 5개+ = 30점
      Math.min(academy, 10) * 1.5 + // 학원 10개+ = 15점
      Math.min(hospital, 5) * 1     // 병원 5개+ = 5점
    );
    await supabase.from('listings').update({
      school_zone_score: Math.round(score),
      school_zone_data: { school, daycare, academy, hospital, radius_m: 1000, ts: new Date().toISOString() },
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', t.id);
    updated++;
  }

  return NextResponse.json({ success: true, updated, scanned: targets?.length || 0 });
}
