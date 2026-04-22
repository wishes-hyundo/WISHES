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
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
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
    // L-sec65 (2026-04-22):  공개 POST 엔드포인트 스팸 방지
    //   1시간 10회/IP cap. checkRateLimit 인프라(L-sec62) 재사용.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `saved-searches:ip:${_ip}`, limit: 10, windowMs: 60 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ success: false, error: '잘못된 요청' }, { status: 400 });

    const email = String(body.email || '').trim().toLowerCase();
    // L-sec20 (2026-04-22): 이메일 길이 상한 (RFC 5321: local 64 + @ + domain 255 = 320)
    if (email.length > 320 || !EMAIL_RE.test(email)) {
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

    // L-sec20: 유한수/범위 검증. Number() 가 NaN/Infinity 면 null 로 떨어뜨림.
    //   상한 1e12 = 1조 (만원 단위 가격) — 현실 가격보다 충분히 크고 DB numeric overflow 방지.
    const finiteNum = (v: any): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1e12) return null;
      return n;
    };
    // L-sec20: filters_extra JSON 직렬화 후 크기 cap (8KB). 더 크면 {} 로 폴백.
    let filtersExtraSafe: Record<string, any> = {};
    try {
      if (body.filters_extra && typeof body.filters_extra === 'object') {
        const s = JSON.stringify(body.filters_extra);
        if (s.length <= 8 * 1024) filtersExtraSafe = body.filters_extra;
      }
    } catch { /* ignore */ }
    // L-sec20: 문자열 카테고리 필드도 cap
    const capStr = (v: any, max: number) => v ? String(v).slice(0, max) : null;

    const payload = {
      name: body.name ? String(body.name).slice(0, 50) : null,
      email,
      phone: body.phone ? String(body.phone).replace(/[^\d\-+]/g, '').slice(0, 20) : null,
      deal: capStr(body.deal, 20),
      type: capStr(body.type, 40),
      gu: capStr(body.gu, 40),
      dong: capStr(body.dong, 60),
      min_price: finiteNum(body.min_price),
      max_price: finiteNum(body.max_price),
      min_deposit: finiteNum(body.min_deposit),
      max_deposit: finiteNum(body.max_deposit),
      max_monthly: finiteNum(body.max_monthly),
      min_area_m2: finiteNum(body.min_area_m2),
      max_area_m2: finiteNum(body.max_area_m2),
      filters_extra: filtersExtraSafe,
      source: capStr(body.source, 80),
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
