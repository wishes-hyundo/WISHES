// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/admin/audit-log/export?from=YYYY-MM-DD&to=YYYY-MM-DD&action=...
//
// L-sec146 (2026-04-23): admin_audit_log DB 테이블 CSV 추출.
//   superadmin 전용. 쿼리 파라미터:
//     from    필수. 시작 날짜 (YYYY-MM-DD, 포함)
//     to      필수. 종료 날짜 (YYYY-MM-DD, 포함, 23:59:59.999 처리)
//     action  선택. action 이름 부분일치 필터 (ilike escaped)
//     limit   선택. 기본 10000, 최대 50000
//
// 응답: text/csv; charset=utf-8. Content-Disposition 로 파일 다운로드 유도.
//
// 보안:
//   - verifyAdminAuthWithContext → role === 'superadmin' 만 허용
//   - rate limit: 5 req / 10min / IP
//   - SUPABASE_SERVICE_ROLE_KEY 필요 (서버 전용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/auditLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 10000;
const MAX_LIMIT = 50000;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // rate limit — brute exfil 방지
  const rl = checkRateLimit({
    key: `audit-export:${ip}`,
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: '요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  // superadmin 전용
  const ctx = await verifyAdminAuthWithContext(request);
  if (!ctx.ok) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }
  if (ctx.role !== 'superadmin' && ctx.role !== 'master') {
    audit({
      action: 'audit_log.export.denied',
      actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
      ip,
      status: 403,
    });
    return NextResponse.json(
      { success: false, error: 'superadmin 권한 필요' },
      { status: 403 },
    );
  }

  // env 확인
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json(
      { success: false, error: '서버 구성 오류 (service key 누락)' },
      { status: 500 },
    );
  }

  // 파라미터 파싱
  const { searchParams } = new URL(request.url);
  const from = (searchParams.get('from') || '').trim();
  const to = (searchParams.get('to') || '').trim();
  const actionFilter = (searchParams.get('action') || '').trim();
  const limitRaw = parseInt(searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, limitRaw))
    : DEFAULT_LIMIT;

  if (!isYmd(from) || !isYmd(to)) {
    return NextResponse.json(
      { success: false, error: 'from/to 는 YYYY-MM-DD 형식' },
      { status: 400 },
    );
  }

  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );

    let q = supabase
      .from('admin_audit_log')
      .select('id, ts, action, actor_email, actor_role, actor_uid, target_type, target_id, ip, status, meta')
      .gte('ts', fromTs)
      .lte('ts', toTs)
      .order('ts', { ascending: false })
      .limit(limit);

    if (actionFilter) {
      // ilike escape — % 와 _ 를 literal 로
      const escaped = actionFilter.replace(/[%_\\]/g, (c) => '\\' + c);
      q = q.ilike('action', `%${escaped}%`);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json(
        { success: false, error: 'DB 쿼리 실패', detail: error.message },
        { status: 500 },
      );
    }

    const rows = data || [];

    // CSV 조립
    const header = [
      'id', 'ts', 'action', 'actor_email', 'actor_role', 'actor_uid',
      'target_type', 'target_id', 'ip', 'status', 'meta',
    ].join(',');
    const body = rows.map((r) => [
      r.id, r.ts, r.action, r.actor_email, r.actor_role, r.actor_uid,
      r.target_type, r.target_id, r.ip, r.status, r.meta,
    ].map(csvEscape).join(',')).join('\n');
    // BOM 붙여 Excel 에서 한글 깨지지 않게.
    const csv = '\uFEFF' + header + '\n' + body + '\n';

    // 성공 감사 로그
    audit({
      action: 'audit_log.export',
      actor: { email: ctx.email, role: ctx.role, uid: ctx.uid },
      ip,
      status: 200,
      meta: { from, to, action_filter: actionFilter || null, rows: rows.length },
    });

    const filename = `admin_audit_log_${from}_${to}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: '서버 오류', detail: err?.message },
      { status: 500 },
    );
  }
}
