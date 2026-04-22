import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
// L-hub3 (2026-04-22): Zod 공용 스키마 허브 이관 — loose variants.
import { nameLooseSchema, phoneLooseSchema } from '@/lib/schemas';

// L-sec38 (2026-04-22): profile PUT 입력 검증 추가.
//   authenticated 지만 본인 행을 거대 payload 로 채워 DB 스토리지 비용 폭증시킬 수 있음.
const ProfileSchema = z.object({
  name: nameLooseSchema.optional(),
  phone: phoneLooseSchema.optional(),
  preferred_areas: z.array(z.string().max(60)).max(50).optional(),
  preferred_types: z.array(z.string().max(40)).max(30).optional(),
});

function errorBody(msg: string, detail?: unknown) {
  const isDev = process.env.NODE_ENV !== 'production';
  return isDev && detail ? { error: msg, detail: String(detail) } : { error: msg };
}

export async function GET(request: NextRequest) {
  // L-sec82 (2026-04-22): defense-in-depth. 프로필 변경 잠음 → 60/5min.
  const _ip = getClientIp(request);
  const _rl = checkRateLimit({ key: `profile:ip:${_ip}`, limit: 60, windowMs: 5 * 60_000 });
  if (!_rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
    );
  }

  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tkn = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(tkn);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error && error.code !== 'PGRST116') return NextResponse.json(errorBody('profile 조회 실패', error.message), { status: 500 });
  return NextResponse.json(profile || { id: user.id, name: '', phone: '', preferred_areas: [], preferred_types: [], profile_completed: false });
}

export async function PUT(request: NextRequest) {
  // L-sec82 (2026-04-22): defense-in-depth.
  const _ip = getClientIp(request);
  const _rl = checkRateLimit({ key: `profile:ip:${_ip}`, limit: 60, windowMs: 5 * 60_000 });
  if (!_rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
    );
  }

  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tkn = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(tkn);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '입력 검증 실패', issue: parsed.error.errors[0]?.message }, { status: 400 });
  }
  const { name, phone, preferred_areas, preferred_types } = parsed.data;
  const { data, error } = await supabase.from('profiles').upsert({
    id: user.id,
    name: name || '',
    phone: phone || '',
    preferred_areas: preferred_areas || [],
    preferred_types: preferred_types || [],
    profile_completed: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select().single();
  if (error) return NextResponse.json(errorBody('profile 저장 실패', error.message), { status: 500 });
  return NextResponse.json(data);
}
