// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/cron/notify-matches  (T5-7)
//   신규 등록 매물 vs 활성 구독(saved_searches) 매칭 → 이메일 발송
//
//   권한:
//     - CRON_SECRET 환경변수가 설정된 경우 Authorization: Bearer CRON_SECRET 요구
//     - 미설정 시 401 (L-sec3 이후 fallback 없음)
//
//   발송 규칙:
//     - 각 구독의 last_notified_at 이후 새로 등록된 공개 매물만 매칭
//     - 크롤링 매물(source_site)은 광고용이라 알림 대상에서 제외
//     - 1회 발송당 최대 8건, 초과분은 다음 배치로 이월
//     - 발송 후 total_sent +1, last_notified_at = now()
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendNewListingAlert, NotifyListing } from '@/lib/email';
import { timingSafeEqualStr } from '@/lib/timingSafe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

function matchOne(listing: any, sub: any): boolean {
  if (sub.deal && listing.deal !== sub.deal) return false;
  if (sub.type && listing.type !== sub.type) return false;
  if (sub.gu && listing.gu && listing.gu !== sub.gu) return false;
  if (sub.dong && listing.dong && listing.dong !== sub.dong) return false;

  // 가격 조건
  if (sub.max_price && listing.deal === '매매' && (listing.price || 0) > sub.max_price) return false;
  if (sub.max_deposit && (listing.deal === '전세' || listing.deal === '월세')
      && (listing.deposit || 0) > sub.max_deposit) return false;
  if (sub.max_monthly && listing.deal === '월세' && (listing.monthly || 0) > sub.max_monthly) return false;

  // 면적
  if (sub.min_area_m2 && (listing.area_m2 || 0) < sub.min_area_m2) return false;
  if (sub.max_area_m2 && listing.area_m2 && listing.area_m2 > sub.max_area_m2) return false;
  return true;
}

function buildLabel(sub: any): string {
  const parts: string[] = [];
  if (sub.gu) parts.push(sub.gu);
  if (sub.dong) parts.push(sub.dong);
  if (sub.deal) parts.push(sub.deal);
  if (sub.type) parts.push(sub.type);
  if (sub.max_price) parts.push(`${sub.max_price.toLocaleString('ko-KR')}만 이하`);
  if (sub.max_deposit) parts.push(`보증금 ${sub.max_deposit.toLocaleString('ko-KR')}만 이하`);
  return parts.join(' · ') || '전체 매물';
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    // 활성 구독 전체 로드 (보통 수백건 이내 예상)
    const { data: subs, error: subsErr } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('active', true);
    if (subsErr) throw subsErr;
    if (!subs || subs.length === 0) {
      return NextResponse.json({ success: true, subscribers: 0, sent: 0 });
    }

    // 가장 오래된 last_notified_at(또는 created_at) 기준으로 매물 한 번만 로드
    const oldest = subs.reduce<Date>((acc: Date, s: any) => {
      const t = new Date(s.last_notified_at || s.created_at);
      return t < acc ? t : acc;
    }, new Date());
    const { data: listings, error: lErr } = await supabase
      .from('listings')
      .select('id, title, deal, type, gu, dong, deposit, monthly, price, area_m2, floor_current, created_at, source_site, status')
      .eq('status', '공개')
      .is('source_site', null)                           // 크롤링 제외
      .gte('created_at', oldest.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);
    if (lErr) throw lErr;

    let sent = 0;
    const results: Array<{ sub_id: number; email: string; matches: number; sent: boolean }> = [];

    for (const sub of subs) {
      const threshold = new Date(sub.last_notified_at || sub.created_at);
      const matches = (listings || []).filter((l: any) => {
        if (new Date(l.created_at) <= threshold) return false;
        return matchOne(l, sub);
      }).slice(0, 8) as NotifyListing[];

      if (matches.length === 0) {
        results.push({ sub_id: sub.id, email: sub.email, matches: 0, sent: false });
        continue;
      }

      const emailResult = await sendNewListingAlert({
        to: sub.email,
        name: sub.name,
        listings: matches,
        unsubToken: sub.unsub_token,
        searchLabel: buildLabel(sub),
      });

      const ok = !!emailResult;
      if (ok) {
        sent++;
        await supabase
          .from('saved_searches')
          .update({
            last_notified_at: new Date().toISOString(),
            total_sent: (sub.total_sent || 0) + 1,
          })
          .eq('id', sub.id);
      }
      results.push({ sub_id: sub.id, email: sub.email, matches: matches.length, sent: ok });
    }

    return NextResponse.json({
      success: true,
      subscribers: subs.length,
      sent,
      results,
    });
  } catch (e: any) {
    console.error('[cron/notify-matches] error:', e);
    // L-sec34 (2026-04-22): prod 에선 에러 메시지 숨김 (DB/SQL 에러 문자열 유출 방지)
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: isDev ? (e?.message || '서버 오류') : '서버 오류' },
      { status: 500 }
    );
  }
}

// 헬스체크 용 GET (발송하지 않고 예상 매칭 건수만 조회)
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }
  try {
    const supabase = createServerClient();
    const { count: subCount } = await supabase
      .from('saved_searches')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    return NextResponse.json({ success: true, activeSubscribers: subCount || 0 });
  } catch (e: any) {
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: isDev ? (e?.message || '서버 오류') : '서버 오류' },
      { status: 500 }
    );
  }
}
