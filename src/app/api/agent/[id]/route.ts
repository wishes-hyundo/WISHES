// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/agent/[id]
//   공개 endpoint — 지정된 UID 가 중개사/관리자 역할인 경우에만
//   안전 필드(name, avatar_url, phone) 를 반환한다.
//   AgentContactModal 이 buildAgentInfo 에서 사용.
//
// 보안:
//   - role in {agent, broker, admin, superadmin} 만 공개
//   - 일반 user 프로필은 404 반환 (UID 열거 방지)
//   - 5분당 200회/IP 로 레이트 리밋
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const AGENT_ROLES = new Set(['agent', 'broker', 'admin', 'superadmin']);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 레이트 리밋 (UID 열거 방어)
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `agent:ip:${ip}`, limit: 200, windowMs: 5 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const { id } = await params;
    // UUID 형식 검증 (열거 방어 + 쿼리 낭비 방지)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 대상 사용자의 role 확인 — role 컬럼이 있다면 그것으로, 없으면 user_metadata 로 폴백
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, phone, role')
      .eq('id', id)
      .maybeSingle();

    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const role = (profile as any).role || 'user';
    if (!AGENT_ROLES.has(String(role).toLowerCase())) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 안전 필드만 반환
    return NextResponse.json({
      id: profile.id,
      name: profile.name || null,
      avatar_url: profile.avatar_url || null,
      phone: profile.phone || null,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
