/**
 * PR-B (RFC 0016) — POST /api/listings/[id]/info-request
 *
 * 사용자 정보 문의 (면적/가격/주소 NULL 매물).
 * 사장님 명령:
 *   - "면적 정보 부족 = 비공개 X"
 *   - "사용자 UI 부정적 표시 X" → 매물 카드 "면적 문의" 클릭 시 모달 → 본 endpoint
 *
 * 흐름:
 *   1. listing 존재 + 공개 상태 검증
 *   2. rate limit (IP 기준, 1분 1회)
 *   3. info_requests 테이블 INSERT (RLS anonymous 허용)
 *   4. 사장님 매일 다이제스트 cron 발송 대기 (즉시 X — RFC 0016 사장님 추천)
 *
 * 회귀 안전망:
 *   - 본문 길이 가드 (DB CHECK 와 일관)
 *   - request_type whitelist
 *   - user_contact 형식 가드
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

type RequestType = 'area' | 'price' | 'address' | 'other';

interface InfoRequestBody {
  request_type: RequestType;
  user_contact: string;
  user_message?: string;
}

const VALID_TYPES: ReadonlyArray<RequestType> = ['area', 'price', 'address', 'other'];

function isValidContact(s: string): boolean {
  // 전화번호 (8-13자리 숫자/하이픈) 또는 이메일 (간단 검사)
  if (/^[0-9-]{8,13}$/.test(s)) return true;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return true;
  return false;
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // listing id 검증
  const { id: idStr } = await context.params;
  const listingId = Number.parseInt(idStr, 10);
  if (!Number.isFinite(listingId) || listingId <= 0) {
    return NextResponse.json({ error: 'invalid_listing_id' }, { status: 400 });
  }

  // body 파싱
  let body: InfoRequestBody;
  try {
    body = (await request.json()) as InfoRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // request_type 검증
  if (!body.request_type || !VALID_TYPES.includes(body.request_type)) {
    return NextResponse.json({ error: 'invalid_request_type' }, { status: 400 });
  }

  // user_contact 검증
  const contact = String(body.user_contact || '').trim();
  if (!isValidContact(contact)) {
    return NextResponse.json({ error: 'invalid_contact' }, { status: 400 });
  }

  // user_message 길이 가드
  const message = body.user_message ? String(body.user_message).trim().slice(0, 500) : null;

  const supabase = createServerClient();
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent')?.slice(0, 256) || null;

  // listing 존재 확인 (status='공개' 만)
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

  // rate limit — 같은 IP 1분 1회 (DB lookup 기반, 단순 구현)
  if (ip) {
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from('info_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_ip', ip)
      .gte('created_at', oneMinAgo);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'rate_limited', retry_after: 60 }, { status: 429 });
    }
  }

  // INSERT
  const { error: insertErr } = await supabase.from('info_requests').insert({
    listing_id: listingId,
    request_type: body.request_type,
    user_contact: contact,
    user_message: message,
    user_ip: ip,
    user_agent: ua,
  });

  if (insertErr) {
    console.error('[info-request] insert error', insertErr);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: '문의가 접수되었습니다. 사장님이 곧 연락드릴 예정입니다.',
  });
}
