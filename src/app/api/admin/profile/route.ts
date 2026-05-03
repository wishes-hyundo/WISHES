/**
 * /api/admin/profile (G-37, 2026-05-03)
 *
 * 운영자/중개사 프로필 조회/수정. admin_users 테이블 대상.
 * I-AUTH-1: profiles = 고객만, admin_users = 직원/사장님 — 분리 유지.
 *
 * - GET: 본인의 admin_users 행을 조회.
 * - PUT: name/phone/company/office_phone/office_address/registration_no/career_years/avatar_url 업데이트.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { nameLooseSchema, phoneLooseSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AdminProfileSchema = z.object({
  name: nameLooseSchema.optional(),
  phone: phoneLooseSchema.optional(),
  company: z.string().max(120).optional().nullable(),
  office_phone: z.string().max(30).optional().nullable(),
  office_address: z.string().max(200).optional().nullable(),
  registration_no: z.string().max(60).optional().nullable(),
  career_years: z.number().int().min(0).max(60).optional().nullable(),
  avatar_url: z.string().url().max(500).optional().nullable(),
});

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

async function getUserId(request: NextRequest): Promise<string | null> {
  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const tkn = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(tkn);
  if (error || !user) return null;
  return user.id;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit({ key: `admin-profile:ip:${ip}`, limit: 60, windowMs: 5 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const userId = await getUserId(request);
  if (!userId) return unauthorized();

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, email, name, phone, company, role, status, office_phone, office_address, registration_no, career_years, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'admin profile 조회 실패', detail: error.message }, { status: 500 });
  }

  if (!data) {
    // 본인이 admin_users 에 없는 사용자 → 운영자 권한 없음.
    return NextResponse.json({ error: 'admin_users 등록 없음 (운영자 권한 필요)' }, { status: 403 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit({ key: `admin-profile:ip:${ip}`, limit: 30, windowMs: 5 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const userId = await getUserId(request);
  if (!userId) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const parsed = AdminProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '입력 검증 실패', issue: parsed.error.errors[0]?.message }, { status: 400 });
  }

  const supabase = createServerClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) update[k] = v;
  }

  const { data, error } = await supabase
    .from('admin_users')
    .update(update)
    .eq('id', userId)
    .select('id, email, name, phone, company, role, status, office_phone, office_address, registration_no, career_years, avatar_url')
    .single();

  if (error) {
    return NextResponse.json({ error: 'admin profile 업데이트 실패', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, profile: data });
}
