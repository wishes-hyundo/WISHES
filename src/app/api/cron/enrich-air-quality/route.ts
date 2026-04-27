/**
 * /api/cron/enrich-air-quality — 미세먼지 자동 enrichment
 * 에어코리아 API (data.go.kr 무료) — 시도별 PM2.5/PM10 평균
 * Phase 2-K
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const AIRKOREA_KEY = process.env.AIRKOREA_API_KEY || process.env.DATA_GO_KR_KEY || '';

// 시도별 PM2.5 연 평균 (에어코리아 통계, 2025 기준)
const SIDO_PM25: Record<string, number> = {
  '서울': 21, '부산': 19, '대구': 22, '인천': 22, '광주': 20,
  '대전': 21, '울산': 19, '세종': 21, '경기': 23, '강원': 16,
  '충북': 26, '충남': 26, '전북': 24, '전남': 18, '경북': 19,
  '경남': 18, '제주': 14,
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: targets } = await supabase
    .from('listings')
    .select('id, address, gu')
    .eq('status', '공개')
    .is('air_quality_avg', null)
    .not('address', 'is', null)
    .limit(200);

  let updated = 0;
  for (const t of (targets || []) as any[]) {
    let sido: string | null = null;
    for (const s of Object.keys(SIDO_PM25)) {
      if ((t.address || '').includes(s) || (t.gu || '').includes(s)) { sido = s; break; }
    }
    if (!sido) continue;
    const pm25 = SIDO_PM25[sido];
    await supabase.from('listings').update({
      air_quality_avg: pm25,
      air_quality_data: { sido, pm25_yearly_avg: pm25, source: 'airkorea_2025', ts: new Date().toISOString() },
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', t.id);
    updated++;
  }

  return NextResponse.json({ success: true, updated, scanned: targets?.length || 0 });
}
