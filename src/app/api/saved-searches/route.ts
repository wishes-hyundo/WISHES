// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/saved-searches  (T5-7)
//   고객이 검색 조건 + 이메일을 저장하여 알림 구독
//   입력: { name?, email, phone?, deal?, type?, gu?, dong?,
//           min_price?, max_price?, min_deposit?, max_deposit?,
//           max_monthly?, min_area_m2?, max_area_m2?, source? }
//   반환: { success, id, unsubToken }
//   opt-in 확인 메일도 함께 발송
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendSubscriptionConfirmed } from '@/lib/email';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildLabel(body: any): string {
  const parts: string[] = [];
  if (body.gu) parts.push(body.gu);
  if (body.dong) parts.push(body.dong);
  if (body.deal) parts.push(body.deal);
  if (body.type) parts.push(body.type);
  if (body.max_price) parts.push(`매매가 ${body.max_price.toLocaleString('ko-KR')}만 이하`);
  if (body.max_deposit) parts.push(`보증금 ${body.max_deposit.toLocaleString('ko-KR')}만 이하`);
  if (body.max_monthly) parts.push(`월세 ${body.max_monthly.toLocaleString('ko-KR')}만 이하`);
  if (body.min_area_m2) parts.push(`${body.min_area_m2}㎡ 이상`);
  return parts.join(' · ') || '전체';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ success: false, error: '잘못된 요청' }, { status: 400 });

    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ success: false, error: '이메일 주소를 확인해주세요' }, { status: 400 });
    }

    // 기본 검증 — 조건 최소 1개 이상
    const hasAnyFilter = !!(body.deal || body.type || body.gu || body.dong
      || body.max_price || body.max_deposit || body.max_monthly
      || body.min_area_m2 || body.max_area_m2);
    if (!hasAnyFilter) {
      return NextResponse.json({ success: false, error: '검색 조건을 1개 이상 선택해주세요' }, { status: 400 });
    }

    const supabase = createServerClient();
    const unsubToken = crypto.randomBytes(24).toString('hex');

    const payload = {
      name: body.name ? String(body.name).slice(0, 50) : null,
      email,
      phone: body.phone ? String(body.phone).replace(/[^\d\-+]/g, '').slice(0, 20) : null,
      deal: body.deal || null,
      type: body.type || null,
      gu: body.gu || null,
      dong: body.dong || null,
      min_price: body.min_price ? Number(body.min_price) : null,
      max_price: body.max_price ? Number(body.max_price) : null,
      min_deposit: body.min_deposit ? Number(body.min_deposit) : null,
      max_deposit: body.max_deposit ? Number(body.max_deposit) : null,
      max_monthly: body.max_monthly ? Number(body.max_monthly) : null,
      min_area_m2: body.min_area_m2 ? Number(body.min_area_m2) : null,
      max_area_m2: body.max_area_m2 ? Number(body.max_area_m2) : null,
      filters_extra: body.filters_extra || {},
      source: body.source ? String(body.source).slice(0, 80) : null,
      unsub_token: unsubToken,
      active: true,
    };

    const { data, error } = await supabase
      .from('saved_searches')
      .insert(payload)
      .select('id, unsub_token')
      .single();

    if (error) {
      console.error('[saved-searches] insert error:', error);
      return NextResponse.json({ success: false, error: '구독 등록 실패 (서버 오류)' }, { status: 500 });
    }

    // Opt-in 확인 메일 (비동기 — 응답 지연 방지)
    const label = buildLabel(body);
    sendSubscriptionConfirmed({
      to: email,
      name: payload.name,
      searchLabel: label,
      unsubToken,
    }).catch((e) => console.error('[saved-searches] confirm email failed:', e));

    return NextResponse.json({
      success: true,
      id: data.id,
      unsubToken: data.unsub_token,
      label,
    });
  } catch (e: any) {
    console.error('[saved-searches] POST error:', e);
    return NextResponse.json(
      { success: false, error: e?.message || '서버 오류' },
      { status: 500 }
    );
  }
}
