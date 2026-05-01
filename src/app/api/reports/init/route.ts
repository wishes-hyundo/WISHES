/**
 * PR-R-3-A — POST /api/reports/init
 *
 * 결제 시작 전 reports 레코드 생성 (status='pending').
 * /report/buy/[listingId] 페이지에서 호출 → orderId 반환.
 *
 * 인증: 사용자 로그인 권장 (비회원 결제는 user_email 만 필수).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { isTossEnabled } from '@/lib/toss-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const REPORT_PRICE_KRW = Number(process.env.NEXT_PUBLIC_REPORT_PRICE_KRW || '3000');

interface InitRequest {
  listing_id: number;
  user_email: string;
}

export async function POST(request: NextRequest) {
  if (!isTossEnabled()) {
    return NextResponse.json(
      {
        error: 'payment_not_configured',
        reason: 'TOSS_SECRET_KEY 환경변수 미설정 — 사장님 등록 후 활성화',
      },
      { status: 503 },
    );
  }

  let body: InitRequest;
  try {
    body = (await request.json()) as InitRequest;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const listingId = Number.parseInt(String(body.listing_id || ''), 10);
  if (!Number.isFinite(listingId) || listingId <= 0) {
    return NextResponse.json({ error: 'invalid_listing_id' }, { status: 400 });
  }

  const userEmail = String(body.user_email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userEmail)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const supabase = createServerClient();

  // listing 존재 + 공개 검증
  const { data: listing, error: listingErr } = await supabase
    .from('listings')
    .select('id, status')
    .eq('id', listingId)
    .single();

  if (listingErr || !listing) {
    return NextResponse.json({ error: 'listing_not_found' }, { status: 404 });
  }
  if (listing.status !== '공개') {
    return NextResponse.json({ error: 'listing_not_public' }, { status: 403 });
  }

  // reports INSERT
  const { data: report, error: insertErr } = await supabase
    .from('reports')
    .insert({
      user_email: userEmail,
      listing_id: listingId,
      status: 'pending',
      payment_provider: 'toss',
      amount_krw: REPORT_PRICE_KRW,
    })
    .select('id')
    .single();

  if (insertErr || !report) {
    console.error('[reports/init] insert error', insertErr);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  // Toss orderId = wishes-report-{report.id} (uniqueness 보장)
  const order_id = `wishes-report-${report.id}`;

  return NextResponse.json({
    success: true,
    order_id,
    report_id: report.id,
    amount: REPORT_PRICE_KRW,
    order_name: `위시스 권리분석 보고서 (매물 #${listingId})`,
    customer_email: userEmail,
  });
}
