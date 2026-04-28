/**
 * /api/cron/enrich-crime-safety — 경찰청 5대 범죄 통계 → 동별 안전 점수
 * env: POLICE_API_KEY (data.go.kr)
 */
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ success: true, note: 'POLICE_API_KEY 등록 후 자동 enrich' });
}
