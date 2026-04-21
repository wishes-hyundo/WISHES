// POST /api/admin/send-newsletter — 어드민 뉴스레터 대량 발송 (T5-7)
//   body: { subject: string, body: string (html), targetIds?: number[] }
//   targetIds 미지정 시 전체 활성 구독자에게 발송
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendAdminNewsletter } from '@/lib/email';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.subject || !body.body) {
      return NextResponse.json({ success: false, error: '제목과 본문은 필수입니다' }, { status: 400 });
    }
    const subject = String(body.subject).slice(0, 120);
    const htmlBody = String(body.body).slice(0, 30000);
    const targetIds: number[] | undefined = Array.isArray(body.targetIds) ? body.targetIds : undefined;

    const supabase = createServerClient();
    let query = supabase
      .from('saved_searches')
      .select('id, name, email, unsub_token')
      .eq('active', true);
    if (targetIds && targetIds.length > 0) query = query.in('id', targetIds);
    const { data: subs, error } = await query;
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return NextResponse.json({ success: true, sent: 0, total: 0 });
    }

    // 직렬 발송 (Resend rate limit 안전)
    let sent = 0;
    const failed: string[] = [];
    for (const sub of subs) {
      try {
        const res = await sendAdminNewsletter({
          to: sub.email,
          name: sub.name,
          subject,
          body: htmlBody,
          unsubToken: sub.unsub_token,
        });
        if (res) sent++;
        else failed.push(sub.email);
        // 소프트 스로틀 (초당 2건 수준)
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        failed.push(sub.email);
      }
    }

    return NextResponse.json({
      success: true,
      total: subs.length,
      sent,
      failedCount: failed.length,
      failedSample: failed.slice(0, 5),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 });
  }
}
