/**
 * /api/cron/monthly-report — 사장님 매월 자동 이메일 보고
 * Resend 무료 100K 한도. 매월 1일.
 * 내용: 가입자/매물/audit_log/SOTA 요약
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const OWNER_EMAIL = 'wishes@wishes.co.kr';

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
  if (!RESEND_KEY) return NextResponse.json({ success: false, error: 'RESEND_API_KEY 미설정' }, { status: 500 });

  const supabase = createServerClient();
  const month = new Date().toISOString().slice(0, 7);

  // 통계 수집
  const [users, listings, audits, sota, integrity] = await Promise.all([
    supabase.from('admin_users').select('role, status', { count: 'exact', head: false }),
    supabase.from('listings').select('status, is_problematic, trust_score', { head: false }),
    supabase.from('admin_audit_log').select('action').gte('ts', `${month}-01`),
    supabase.from('sota_reports').select('topics').eq('month', month).maybeSingle(),
    supabase.rpc('data_integrity_audit'),
  ]);

  const userStats = (users.data || []).reduce<Record<string, number>>((acc: any, u: any) => {
    acc[u.role || 'unknown'] = (acc[u.role || 'unknown'] || 0) + 1; return acc;
  }, {});
  const listingStats = (listings.data || []).reduce<Record<string, number>>((acc: any, l: any) => {
    acc[l.status || 'unknown'] = (acc[l.status || 'unknown'] || 0) + 1; return acc;
  }, {});
  const trustAvg = (listings.data || [])
    .filter((l: any) => l.trust_score != null)
    .reduce((s: number, l: any) => s + l.trust_score, 0) / Math.max(1, listings.data?.length || 1);

  const auditCounts = (audits.data || []).reduce<Record<string, number>>((acc: any, a: any) => {
    acc[a.action] = (acc[a.action] || 0) + 1; return acc;
  }, {});

  const html = `
<h1>위시스 ${month} 월간 자동 보고서</h1>
<h2>사용자 현황</h2>
<ul>
  <li>총 ${users.count || 0}명</li>
  ${Object.entries(userStats).map(([r, n]) => `<li>${r}: ${n}</li>`).join('')}
</ul>
<h2>매물 현황</h2>
<ul>
  <li>공개: ${listingStats['공개'] || 0}</li>
  <li>비공개: ${listingStats['비공개'] || 0}</li>
  <li>계약중: ${listingStats['계약중'] || 0}</li>
  <li>계약완료: ${listingStats['계약완료'] || 0}</li>
  <li>평균 신뢰도: ${trustAvg.toFixed(1)} / 100</li>
</ul>
<h2>이번 달 자동 처리</h2>
<ul>
  ${Object.entries(auditCounts).slice(0, 10).map(([a, n]) => `<li>${a}: ${n}건</li>`).join('')}
</ul>
<h2>데이터 무결성</h2>
<pre>${JSON.stringify(integrity.data, null, 2)}</pre>
<h2>SOTA 추천</h2>
<p>${sota.data ? `${(sota.data.topics || []).length}개 토픽 검색됨` : '이번 달 SOTA 보고서 미생성'}</p>
<hr/>
<small>위시스 자동 시스템 | 매월 1일 09:00 KST | wishes@wishes.co.kr</small>
  `.trim();

  // Resend 발송
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'WISHES <noreply@wishes.co.kr>',
      to: OWNER_EMAIL,
      subject: `[WISHES] ${month} 월간 자동 보고서`,
      html,
    }),
  });
  const j = await r.json();

  return NextResponse.json({ success: r.ok, sent: r.ok, response: j });
}
