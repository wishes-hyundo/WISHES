// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/agent/[id]
//   공개 endpoint — 지정된 UID 가 중개사/관리자 역할인 경우에만
//   안전 필드(name, avatar_url, phone, office_*, registration_no, career_years)를 반환.
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
    const ip = getClientIp(request);
    const rl = checkRateLimit({ key: `agent:ip:${ip}`, limit: 200, windowMs: 5 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, phone, role, office_name, office_phone, office_address, registration_no, career_years')
      .eq('id', id)
      .maybeSingle();

    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const role = (profile as any).role || 'user';
    if (!AGENT_ROLES.has(String(role).toLowerCase())) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: profile.id,
      name: profile.name || null,
      avatar_url: profile.avatar_url || null,
      phone: profile.phone || null,
      office_name: (profile as any).office_name || null,
      office_phone: (profile as any).office_phone || null,
      office_address: (profile as any).office_address || null,
      registration_no: (profile as any).registration_no || null,
      career_years: (profile as any).career_years ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
