/**
 * PR-B (RFC 0016) — 매일 정보 문의 다이제스트 cron
 *
 * 사장님 명령 추천 default: 매일 1통 다이제스트 (즉시 발송 X — 사장님 받은편지함 보호).
 *
 * 흐름:
 *   1. notified_in_digest_at IS NULL 인 info_requests 조회 (어제 0시 ~ 지금)
 *   2. Resend 이메일 1통 발송 (사장님 wishes@wishes.co.kr)
 *   3. notified_in_digest_at = NOW() 표시 (다음 cron 시 중복 방지)
 *
 * 빈도: 매일 09:00 (vercel.json 추가 필요)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ADMIN_EMAIL = 'wishes@wishes.co.kr';

interface InfoRequestRow {
  id: number;
  listing_id: number;
  request_type: string;
  user_contact: string;
  user_message: string | null;
  created_at: string;
}

function escapeHtml(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TYPE_LABEL: Record<string, string> = {
  area: '면적',
  price: '가격',
  address: '주소',
  other: '기타',
};

export async function GET(request: NextRequest) {
  // Vercel cron 인증
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (cronSecret && !isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('info_requests')
    .select('id, listing_id, request_type, user_contact, user_message, created_at')
    .is('notified_in_digest_at', null)
    .order('created_at', { ascending: true })
    .limit(200)
    .returns<InfoRequestRow[]>();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ success: true, sent: 0, message: 'no_pending' });
  }

  // 이메일 본문 생성
  const rows = data
    .map(
      (r) => `
        <tr>
          <td style="padding:6px 10px; border:1px solid #e5e7eb;">#${r.id}</td>
          <td style="padding:6px 10px; border:1px solid #e5e7eb;">
            <a href="https://wishes.co.kr/map?listing=${r.listing_id}">#${r.listing_id}</a>
          </td>
          <td style="padding:6px 10px; border:1px solid #e5e7eb;">${escapeHtml(TYPE_LABEL[r.request_type] || r.request_type)}</td>
          <td style="padding:6px 10px; border:1px solid #e5e7eb;">${escapeHtml(r.user_contact)}</td>
          <td style="padding:6px 10px; border:1px solid #e5e7eb;">${escapeHtml(r.user_message || '-')}</td>
          <td style="padding:6px 10px; border:1px solid #e5e7eb;">${new Date(r.created_at).toLocaleString('ko-KR')}</td>
        </tr>`,
    )
    .join('');

  const html = `
    <h2>📬 정보 문의 ${data.length}건 (PR-B 다이제스트)</h2>
    <p>지난 ${data[0]?.created_at ? new Date(data[0].created_at).toLocaleDateString('ko-KR') : '24시간'} 동안 접수된 문의입니다.</p>
    <table style="border-collapse:collapse; font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:6px 10px; border:1px solid #e5e7eb;">문의 ID</th>
          <th style="padding:6px 10px; border:1px solid #e5e7eb;">매물</th>
          <th style="padding:6px 10px; border:1px solid #e5e7eb;">종류</th>
          <th style="padding:6px 10px; border:1px solid #e5e7eb;">연락처</th>
          <th style="padding:6px 10px; border:1px solid #e5e7eb;">메시지</th>
          <th style="padding:6px 10px; border:1px solid #e5e7eb;">접수 시각</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#6b7280; font-size:12px; margin-top:16px;">
      Admin: <a href="https://wishes.co.kr/admin">https://wishes.co.kr/admin</a>
    </p>
  `;

  // Resend 발송
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({
      success: false,
      pending: data.length,
      reason: 'resend_api_key_missing',
    });
  }

  try {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'WISHES <noreply@wishes.co.kr>',
      to: [ADMIN_EMAIL],
      subject: `[WISHES] 매물 정보 문의 ${data.length}건`,
      html,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      pending: data.length,
      reason: 'resend_send_failed',
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  // notified_in_digest_at 업데이트
  const ids = data.map((r) => r.id);
  const { error: updErr } = await supabase
    .from('info_requests')
    .update({ notified_in_digest_at: new Date().toISOString() })
    .in('id', ids);

  if (updErr) {
    console.error('[info-requests-digest] update error', updErr);
  }

  return NextResponse.json({
    success: true,
    sent: 1,
    rows: data.length,
  });
}
