/**
 * /api/cron/pipa-anonymize
 *
 * Phase 1-5: pipa_anonymize_expired() SQL 함수 호출.
 * 사장님 명령: 거래 기록 영구 보존, PII 만 익명화 (3년 후).
 * Vercel Cron: 매일 04:00 KST.
 *
 * G-85 (2026-05-04): PIPA 법적 의무 흔적을 admin_audit_log 에 기록.
 *   personal_info 항목은 매일 처리 결과를 감사 로그에 남겨야
 *   PIPA 감사·증빙 + 운영 모니터링 가능.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { audit } from '@/lib/auditLog';
import { getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // L-fix-cron-secret (2026-04-28): CRON_SECRET 미설정 시 fail-safe
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const authHeader = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('pipa_anonymize_expired');
    if (error) {
      // G-85: 실패도 audit
      audit({
        action: 'cron.pipa_anonymize.error',
        actor: { role: 'cron' },
        ip: getClientIp(request),
        userAgent: request.headers.get('user-agent') || undefined,
        route: '/api/cron/pipa-anonymize',
        status: 500,
        meta: { error: error.message },
      });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // G-85: 정상 실행 audit (PIPA 법적 흔적)
    audit({
      action: 'cron.pipa_anonymize.run',
      actor: { role: 'cron' },
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
      route: '/api/cron/pipa-anonymize',
      status: 200,
      meta: { result: data ?? null, ts: new Date().toISOString() },
    });

    return NextResponse.json({ success: true, result: data, ts: new Date().toISOString() });
  } catch (e: any) {
    audit({
      action: 'cron.pipa_anonymize.error',
      actor: { role: 'cron' },
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
      route: '/api/cron/pipa-anonymize',
      status: 500,
      meta: { error: e?.message || 'unknown' },
    });
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 });
  }
}
