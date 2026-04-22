// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/cron/weekly-briefing — 주간 자동 브리핑 메일 (#46)
//
//   매주 월요일 오전 9시(KST) Vercel Cron 에서 호출
//   지난 7일 contacts 현황을 요약해 ADMIN_EMAIL 로 이메일 발송
//
//   포함 지표
//   - 파이프라인 단계별 건수
//   - 이탈 사유 top-5
//   - 유입 경로 top-5 (전환율 포함)
//   - 방문 예약 requested/confirmed 총합
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { Resend } from 'resend';
import { timingSafeEqualStr } from '@/lib/timingSafe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FROM_EMAIL = process.env.EMAIL_FROM || 'WISHES <noreply@wishes.co.kr>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'wishes@wishes.co.kr';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://wishes.co.kr';

function authorized(req: NextRequest): boolean {
  // L-sec3 (2026-04-22): 박제 'wishes2026' fallback 제거 → CRON_SECRET 필수
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) return timingSafeEqualStr(token, cronSecret);
  if (process.env.NODE_ENV !== 'production') {
    const master = process.env.WISHES_ADMIN_MASTER_PASSWORD;
    if (master && timingSafeEqualStr(token, master)) return true;
  }
  return false;
}

type ContactRow = {
  id: number;
  pipeline_status: string | null;
  loss_reason: string | null;
  source: string | null;
  created_at: string;
};

type AppointmentRow = {
  id: number;
  status: string;
  created_at: string;
};

const PIPELINE_LABEL: Record<string, string> = {
  new: '신규',
  contacted: '상담중',
  visit_booked: '방문 예약',
  contract: '계약 진행',
  closed_won: '계약 완료',
  closed_lost: '이탈',
};

const LOSS_REASON_LABEL: Record<string, string> = {
  price: '가격 불일치',
  inventory: '매물 부족',
  timing: '타이밍',
  changed_mind: '의사 변경',
  other: '기타',
};

function categorizeSource(source: string | null): string {
  if (!source) return '직접유입';
  const p = source.toLowerCase();
  // #49: UTM/광고/검색엔진 자동 파싱된 prefix 우선
  if (p.startsWith('google-ads:')) return '구글 광고';
  if (p.startsWith('facebook-ads:')) return 'Meta 광고';
  if (p.startsWith('kakao-ads:')) return '카카오 광고';
  if (p.startsWith('search:naver')) return '네이버 검색';
  if (p.startsWith('search:google')) return '구글 검색';
  if (p.startsWith('search:daum')) return '다음 검색';
  if (p.startsWith('search:')) return '기타 검색';
  if (p.startsWith('ref:')) return '외부 추천';
  // 자사 페이지 (pathname)
  if (p === '/' || p === '/home') return '홈';
  if (p.startsWith('/listings/')) return '매물 상세';
  if (p.startsWith('/listings')) return '매물 목록';
  if (p.startsWith('/map')) return '지도';
  if (p.startsWith('/calculator')) return '계산기';
  if (p.startsWith('/contact')) return '상담 페이지';
  if (p.startsWith('sticky-cta')) return '모바일 플로팅';
  if (p.startsWith('/404') || p.startsWith('/error')) return '에러 복구';
  return '기타';
}

async function buildBriefingHtml(): Promise<{ html: string; subject: string; summary: string }> {
  const supabase = createServerClient() as any;
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sinceIso = sevenDaysAgo.toISOString();

  const { data: contactsRaw } = await supabase
    .from('contacts')
    .select('id, pipeline_status, loss_reason, source, created_at')
    .gte('created_at', sinceIso)
    .limit(2000);

  const contacts: ContactRow[] = contactsRaw || [];

  const { data: apptsRaw } = await supabase
    .from('appointments')
    .select('id, status, created_at')
    .gte('created_at', sinceIso)
    .limit(500);

  const appts: AppointmentRow[] = apptsRaw || [];

  // 파이프라인 집계
  const pipelineAgg: Record<string, number> = {};
  const sourceAgg: Record<string, { total: number; won: number }> = {};
  const lossAgg: Record<string, number> = {};

  for (const c of contacts) {
    const ps = c.pipeline_status || 'new';
    pipelineAgg[ps] = (pipelineAgg[ps] || 0) + 1;

    const cat = categorizeSource(c.source);
    if (!sourceAgg[cat]) sourceAgg[cat] = { total: 0, won: 0 };
    sourceAgg[cat].total += 1;
    if (ps === 'closed_won') sourceAgg[cat].won += 1;

    if (ps === 'closed_lost' && c.loss_reason) {
      lossAgg[c.loss_reason] = (lossAgg[c.loss_reason] || 0) + 1;
    }
  }

  const apptRequested = appts.filter((a) => a.status === 'requested').length;
  const apptConfirmed = appts.filter((a) => a.status === 'confirmed').length;

  const totalLeads = contacts.length;
  const totalWon = pipelineAgg['closed_won'] || 0;
  const totalLost = pipelineAgg['closed_lost'] || 0;
  const conversionRate = totalLeads > 0 ? ((totalWon / totalLeads) * 100).toFixed(1) : '0.0';

  // Top-5 유입 경로 (건수 기준)
  const sourceRows = Object.entries(sourceAgg)
    .map(([cat, v]) => ({
      cat,
      total: v.total,
      won: v.won,
      rate: v.total > 0 ? ((v.won / v.total) * 100).toFixed(1) : '0.0',
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const lossRows = Object.entries(lossAgg)
    .map(([k, v]) => ({ key: k, label: LOSS_REASON_LABEL[k] || k, count: v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const startLabel = sevenDaysAgo.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  const endLabel = now.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  const subject = `[WISHES] 주간 브리핑 (${startLabel}~${endLabel}) — 리드 ${totalLeads}건 · 전환 ${conversionRate}%`;

  const summary = [
    `리드 총 ${totalLeads}건`,
    `계약 완료 ${totalWon}건 (${conversionRate}%)`,
    `이탈 ${totalLost}건`,
    `방문 예약 요청 ${apptRequested}건 / 확정 ${apptConfirmed}건`,
  ].join(' · ');

  const html = `
    <div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:620px;margin:0 auto;padding:24px;background:#f7f7f8">
      <div style="background:linear-gradient(135deg,#1a1f36,#2d3555);color:#fff;padding:24px;border-radius:12px 12px 0 0">
        <div style="font-size:11px;letter-spacing:3px;opacity:0.7;margin-bottom:6px">WEEKLY BRIEFING</div>
        <h1 style="margin:0;font-size:22px;font-weight:800">주간 리드 브리핑</h1>
        <div style="margin-top:6px;font-size:13px;opacity:0.85">${startLabel} ~ ${endLabel}</div>
      </div>

      <div style="background:#fff;padding:22px;border:1px solid #eceff3;border-top:none">
        <!-- 요약 KPI -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr>
            <td style="width:25%;padding:12px;background:#f4f6fa;border-radius:8px;text-align:center">
              <div style="font-size:11px;color:#6b7280;margin-bottom:4px">총 리드</div>
              <div style="font-size:22px;font-weight:800;color:#1a1f36">${totalLeads}</div>
            </td>
            <td style="width:2%"></td>
            <td style="width:25%;padding:12px;background:#ecfdf5;border-radius:8px;text-align:center">
              <div style="font-size:11px;color:#065f46;margin-bottom:4px">계약 완료</div>
              <div style="font-size:22px;font-weight:800;color:#047857">${totalWon}</div>
            </td>
            <td style="width:2%"></td>
            <td style="width:25%;padding:12px;background:#fef2f2;border-radius:8px;text-align:center">
              <div style="font-size:11px;color:#991b1b;margin-bottom:4px">전환율</div>
              <div style="font-size:22px;font-weight:800;color:#dc2626">${conversionRate}%</div>
            </td>
            <td style="width:2%"></td>
            <td style="width:25%;padding:12px;background:#fffbeb;border-radius:8px;text-align:center">
              <div style="font-size:11px;color:#854d0e;margin-bottom:4px">방문 요청</div>
              <div style="font-size:22px;font-weight:800;color:#b45309">${apptRequested}</div>
            </td>
          </tr>
        </table>

        <!-- 파이프라인 단계별 -->
        <h2 style="font-size:14px;color:#1a1f36;margin:18px 0 10px;font-weight:700">파이프라인 단계별</h2>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px">
          ${['new', 'contacted', 'visit_booked', 'contract', 'closed_won', 'closed_lost']
            .map((k) => {
              const count = pipelineAgg[k] || 0;
              const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
              return `
                <tr>
                  <td style="padding:6px 0;color:#374151;width:30%">${PIPELINE_LABEL[k] || k}</td>
                  <td style="padding:6px 0;width:55%">
                    <div style="background:#e5e7eb;height:8px;border-radius:4px;overflow:hidden">
                      <div style="background:${k === 'closed_won' ? '#10b981' : k === 'closed_lost' ? '#ef4444' : '#6366f1'};width:${pct}%;height:100%"></div>
                    </div>
                  </td>
                  <td style="padding:6px 0;text-align:right;font-weight:700;color:#111827;width:15%">${count}건</td>
                </tr>`;
            })
            .join('')}
        </table>

        <!-- 유입 경로 Top 5 -->
        <h2 style="font-size:14px;color:#1a1f36;margin:22px 0 10px;font-weight:700">유입 경로 Top 5</h2>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f4f6fa">
              <th style="text-align:left;padding:8px;font-size:11px;color:#6b7280;font-weight:600">경로</th>
              <th style="text-align:right;padding:8px;font-size:11px;color:#6b7280;font-weight:600">리드</th>
              <th style="text-align:right;padding:8px;font-size:11px;color:#6b7280;font-weight:600">계약</th>
              <th style="text-align:right;padding:8px;font-size:11px;color:#6b7280;font-weight:600">전환율</th>
            </tr>
          </thead>
          <tbody>
            ${
              sourceRows.length === 0
                ? '<tr><td colspan="4" style="padding:12px;color:#9ca3af;text-align:center">데이터 없음</td></tr>'
                : sourceRows
                    .map(
                      (r) => `
                <tr style="border-bottom:1px solid #f1f3f7">
                  <td style="padding:8px;color:#111827;font-weight:600">${r.cat}</td>
                  <td style="padding:8px;text-align:right;color:#374151">${r.total}</td>
                  <td style="padding:8px;text-align:right;color:#047857;font-weight:700">${r.won}</td>
                  <td style="padding:8px;text-align:right;color:#dc2626;font-weight:700">${r.rate}%</td>
                </tr>`
                    )
                    .join('')
            }
          </tbody>
        </table>

        <!-- 이탈 사유 Top 5 -->
        <h2 style="font-size:14px;color:#1a1f36;margin:22px 0 10px;font-weight:700">이탈 사유 Top 5</h2>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px">
          ${
            lossRows.length === 0
              ? '<tr><td style="padding:12px;color:#9ca3af;text-align:center">이탈 사유 태깅 데이터 없음</td></tr>'
              : lossRows
                  .map(
                    (r) => `
              <tr>
                <td style="padding:6px 0;color:#374151">${r.label}</td>
                <td style="padding:6px 0;text-align:right;font-weight:700;color:#b91c1c">${r.count}건</td>
              </tr>`
                  )
                  .join('')
          }
        </table>

        <div style="margin-top:26px;padding-top:18px;border-top:1px solid #eceff3;text-align:center">
          <a href="${SITE_URL}/admin" style="display:inline-block;padding:12px 26px;background:#1a1f36;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">
            어드민 대시보드에서 상세 보기
          </a>
        </div>
      </div>

      <div style="text-align:center;color:#9ca3af;font-size:11px;padding:14px 0">
        본 메일은 매주 월요일 오전 9시(KST) 자동 발송됩니다.<br/>
        WISHES 부동산 · wishes.co.kr
      </div>
    </div>`;

  return { html, subject, summary };
}

async function handler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { html, subject, summary } = await buildBriefingHtml();

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        success: true,
        warning: 'RESEND_API_KEY not set — email not sent',
        summary,
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      html,
    });

    if (error) {
      // L-sec34 (2026-04-22): prod 에선 Resend 에러 메시지 숨김
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { success: false, error: isDev ? error.message : 'email send failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, emailId: data?.id, summary });
  } catch (err: any) {
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: isDev ? (err?.message || 'briefing failed') : 'briefing failed' },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
