/**
 * /api/cron/ai-hallucination-fix
 * AI description 환각 의심 매물 자동 fix:
 *   - 길이 30자 미만 → description NULL 처리 (다음 enrich-text cron 에서 재생성)
 *   - 영어 비율 50%+ → 동일
 * 매주 1회 실행.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  
  // 환각 의심 자동 fix: description NULL 처리 (다음 cron 에서 재생성)
  const { data: tooShort } = await supabase
    .from('listings')
    .select('id, description')
    .contains('ai_generated_fields', ['description'])
    .eq('status', '공개');

  let fixed = 0;
  for (const l of (tooShort || []) as any[]) {
    const desc = l.description || '';
    const len = desc.length;
    const englishChars = (desc.match(/[A-Za-z]/g) || []).length;
    const ratio = len > 0 ? englishChars / len : 0;
    
    if (len < 30 || ratio > 0.5) {
      await supabase.from('listings').update({
        description: null,
        ai_generated_fields: [],
        updated_at: new Date().toISOString(),
      }).eq('id', l.id);
      fixed++;
    }
  }

  // 통계 함수 호출
  const { data: stats } = await supabase.rpc('ai_hallucination_detect');

  await supabase.from('admin_audit_log').insert({
    action: 'ai_hallucination_fix_run',
    target_type: 'system',
    meta: { fixed, stats, ts: new Date().toISOString() },
  });

  return NextResponse.json({ success: true, fixed, stats });
}
