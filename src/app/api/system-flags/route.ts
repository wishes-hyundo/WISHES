// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/system-flags
// system_flags 테이블의 읽기 전용 public endpoint.
// 클라이언트가 feature flag (use_server_pagination 등) 확인용.
//
// 사장님 명령 2026-05-15: 페이지네이션 작업 안전망 (feature flag 토글로 즉시 롤백)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// [Critical fix 2026-05-16] PUBLIC_FLAGS whitelist
// 미래에 추가될 내부/secret flag (API 키 등) 가 익명 GET 으로 leak 되지 않도록 화이트리스트.
// 새 flag 를 공개하려면 이 배열에 명시적으로 추가해야 함.
const PUBLIC_FLAGS = ['use_server_pagination'];


export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('system_flags')
      .select('name, value');

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 키-값 객체로 변환
    const flags: Record<string, string> = {};
    for (const row of data || []) {
      if (!PUBLIC_FLAGS.includes(row.name)) continue;  // 화이트리스트 외 skip
      flags[row.name] = row.value;
    }

    return NextResponse.json(
      { success: true, flags, ts: Date.now() },
      {
        headers: {
          // 짧은 cache (30초) - flag 변경 시 즉시 반영
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'unknown' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
