/**
 * /api/cron/ai-hallucination-fix
 * AI description 환각 의심 매물 자동 fix:
 *   - 길이 30자 미만 → description NULL 처리
 *   - 영어 비율 50%+ → 동일
 * 다음 enrich-text cron 에서 자동 재생성. 매주.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ListingRow {
  id: number;
  description: string | null;
}

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

  const supabase = createServerClient();
  const { data: tooShort } = await supabase
    .from('listings')
    .select('id, description')
    .contains('ai_generated_fields', ['description'])
    .eq('status', '공개');

  let fixed = 0;
  for (const l of (tooShort || []) as ListingRow[]) {
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

  const { data: stats } = await supabase.rpc('ai_hallucination_detect');

  await supabase.from('admin_audit_log').insert({
    action: 'ai_hallucination_fix_run',
    target_type: 'system',
    meta: { fixed, stats, ts: new Date().toISOString() },
  });

  return NextResponse.json({ success: true, fixed, stats });
}
