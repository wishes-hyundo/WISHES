/**
 * /api/cron/enrich-building-register — DEPRECATED 2026-05-01 (PR-R-1-V2)
 *
 * 사장님 통찰: data.go.kr 한도 일 10K (V-World 1K 의 10배).
 * 기존 backfill-building-info cron 이 이미 정교한 Kakao → 법정동 → data.go.kr 통합.
 * V-World 단독 fetch 비효율 → backfill-building-info 로 통합.
 *
 * 이 endpoint 는 영구 deprecated stub.
 *   - response shape 호환 유지 (모니터링 영향 0)
 *   - DB 컬럼 보존 (재활성화 가능)
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    success: true,
    deprecated: true,
    since: '2026-05-01',
    rfc: '0018-pr-r1v2',
    redirect_to: '/api/cron/backfill-building-info',
    reason: 'data_go_kr_higher_quota',
  });
}
