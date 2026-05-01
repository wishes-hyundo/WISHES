/**
 * /api/cron/enrich-air-quality — DEPRECATED 2026-05-01 (RFC 0017)
 *
 * 사장님 피드백: "미세먼지가 부동산에서 뭐가 그리 중요한지 모르겠는데"
 * 한국 시도별 PM2.5 차이 < 부동산 입지 가치. 광고 효과 0.
 *
 * 폐기 정책 (RFC 0017):
 * - vercel.json cron 제거됨 (호출 0)
 * - DB 컬럼 (air_quality_*) 보존 (재활성화 가능)
 * - 외부 API (에어코리아) 호출 0
 * - 인프라 코드 보존 (이 파일 그대로)
 *
 * 재활성화 시: vercel.json crons 에 다시 추가 + 이 early return 제거.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    success: true,
    deprecated: true,
    since: '2026-05-01',
    rfc: '0017',
    reason: 'sajangnim_feedback_low_signal',
  });
}
