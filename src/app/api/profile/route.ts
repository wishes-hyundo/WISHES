import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
// L-hub3 (2026-04-22): Zod 공용 스키마 허브 이관 — loose variants.
import { nameLooseSchema, phoneLooseSchema } from '@/lib/schemas';

// L-sec38 (2026-04-22): profile PUT 입력 검증.
// L-agent-profile (2026-04-24): 중개사 전용 필드 추가 — office_name / office_phone /
//   office_address / registration_no / career_years / avatar_url.
const ProfileSchema = z.object({
  name: nameLooseSchema.optional(),
  phone: phoneLooseSchema.optional(),
  preferred_areas: z.array(z.string().max(60)).max(50).optional(),
  preferred_types: z.array(z.string().max(40)).max(30).optional(),
  avatar_url: z.string().url().max(500).optional().nullable(),
  office_name: z.string().max(120).optional().nullable(),
  office_phone: z.string().max(30).optional().nullable(),
  office_address: z.string().max(200).optional().nullable(),
  registration_no: z.string().max(60).optional().nullable(),
  career_years: z.number().int().min(0).max(60).optional().nullable(),
});

function errorBody(msg: string, detail?: unknown) {
  const isDev = process.env.NODE_ENV !== 'production';
  return isDev && detail ? { error: msg, detail: String(detail) } : { error: msg };
}

export async function GET(request: NextRequest) {
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
  const {
    name, phone, preferred_areas, preferred_types,
    avatar_url, office_name, office_phone, office_address, registration_no, career_years,
  } = parsed.data;
  const upsert: Record<string, any> = {
    id: user.id,
    name: name ?? '',
    phone: phone ?? '',
    preferred_areas: preferred_areas ?? [],
    preferred_types: preferred_types ?? [],
    profile_completed: true,
    updated_at: new Date().toISOString(),
  };
  if (avatar_url !== undefined) upsert.avatar_url = avatar_url;
  if (office_name !== undefined) upsert.office_name = office_name;
  if (office_phone !== undefined) upsert.office_phone = office_phone;
  if (office_address !== undefined) upsert.office_address = office_address;
  if (registration_no !== undefined) upsert.registration_no = registration_no;
  if (career_years !== undefined) upsert.career_years = career_years;
  const { data, error } = await supabase.from('profiles').upsert(upsert, { onConflict: 'id' }).select().single();
  if (error) return NextResponse.json(errorBody('profile 저장 실패', error.message), { status: 500 });
  return NextResponse.json(data);
}
