/**
 * /api/cron/verify-business — 중개사 사업자번호 진위확인
 * 국세청 사업자등록 진위확인 API (무료 무제한)
 * Phase 2-L
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NTS_KEY = process.env.NTS_API_KEY || process.env.DATA_GO_KR_KEY || '';

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

  if (!NTS_KEY) {
    return NextResponse.json({ success: false, error: 'NTS_API_KEY 미설정 (data.go.kr 신청 필요)' }, { status: 500 });
  }

  const supabase = createServerClient();
  const { data: targets } = await supabase
    .from('admin_users')
    .select('id, business_number')
    .not('business_number', 'is', null)
    .eq('business_verified', false)
    .limit(50);

  let verified = 0;
  for (const t of (targets || []) as any[]) {
    try {
      const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${NTS_KEY}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b_no: [t.business_number.replace(/-/g, '')] }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const status = j?.data?.[0]?.b_stt_cd;
      const isActive = status === '01';  // 01 = 계속사업자
      await supabase.from('admin_users').update({
        business_verified: isActive,
        business_verified_at: new Date().toISOString(),
      }).eq('id', t.id);
      if (isActive) verified++;
    } catch { /* skip */ }
  }

  return NextResponse.json({ success: true, verified, scanned: targets?.length || 0 });
}
