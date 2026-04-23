// src/app/api/diagnostic/r2/route.ts
// v2.3.8 — R2 / env / presign / supabase 한방 점검 엔드포인트
//
// 사용:
//   배포 직후 브라우저에서 GET /api/diagnostic/r2
//   모두 "ok": true 여야 정상.
//
// 안전성:
//   env 값은 노출하지 않고 존재 여부(불리언)만 반환.

import { NextRequest, NextResponse } from 'next/server';
import { getPresignedPutUrl } from '@/lib/r2';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

// L-sec29 (2026-04-22): 공개 GET 이 env 존재 여부 + R2 presign (billable) 생성.
//   정보 노출 + 비용 남용 차단 위해 admin 인증 필수로 잠금.
export async function GET(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // 1) env 존재 여부
  // L-sec148 (2026-04-23): 레거시 ADMIN_TOKEN 체크 제거 (L-sec3 에서 사용 중단됨).
  //   현재 admin 인증은 WISHES_ADMIN_MASTER_PASSWORD + Supabase JWT + ws_session 쿠키 로 이관됨.
  //   크롤러 브리지는 WISHES_CRAWLER_BRIDGE_TOKEN (optional) 사용.
  const envs = [
    'R2_ENDPOINT',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_PUBLIC_URL',
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WISHES_ADMIN_MASTER_PASSWORD',
  ];
  for (const name of envs) {
    checks[`env.${name}`] = {
      ok: !!process.env[name],
      detail: process.env[name] ? 'set' : 'missing',
    };
  }
  // 선택 (크롤러 브리지) — 미설정이어도 fail 로 집계하지 않도록 별도 기록
  checks['env.WISHES_CRAWLER_BRIDGE_TOKEN'] = {
    ok: true,
    detail: process.env.WISHES_CRAWLER_BRIDGE_TOKEN
      ? 'set'
      : 'missing (optional: 크롤러 전용 브리지)',
  };

  // 2) presign 테스트
  try {
    const testKey = `diagnostic/presign-test-${Date.now()}.mp4`;
    const url = await getPresignedPutUrl(testKey, 'video/mp4', 60);
    checks['presign'] = {
      ok: true,
      detail: `url generated (${url.length} chars, expires 60s)`,
    };
  } catch (err: any) {
    checks['presign'] = { ok: false, detail: String(err?.message || err) };
  }

  // 3) Supabase 연결 + listing_videos 테이블 존재 확인
  try {
    const supabase = createServerClient();
    if (!supabase) {
      checks['supabase.connection'] = { ok: false, detail: 'createServerClient() returned null' };
    } else {
      const { error } = await supabase
        .from('listing_videos')
        .select('id', { count: 'exact', head: true });
      if (error) {
        checks['supabase.listing_videos'] = { ok: false, detail: error.message };
      } else {
        checks['supabase.listing_videos'] = { ok: true, detail: 'table accessible' };
      }
    }
  } catch (err: any) {
    checks['supabase.connection'] = { ok: false, detail: String(err?.message || err) };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      version: 'v2.3.8',
      allOk,
      checks,
      hint: allOk
        ? '모든 항목 정상. /v238-smoke.html 에서 전체 플로우 테스트 가능.'
        : 'X 표시된 항목을 README 대로 수정하세요.',
    },
    { status: allOk ? 200 : 503 }
  );
}
