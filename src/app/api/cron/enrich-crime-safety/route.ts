/**
 * /api/cron/enrich-crime-safety — DEPRECATED 2026-05-01 (RFC 0017)
 *
 * 한국 안전등급 데이터: 시도/시군구 단위만, 동·매물 단위 차이 0.
 * 부동산 의사결정 시그널 부족. 외부 API key 미등록 상태로 stub 만.
 *
 * 폐기 정책 (RFC 0017):
 * - vercel.json cron 제거됨 (호출 0)
 * - DB 컬럼 (crime_*) 보존
 * - 인프라 코드 보존
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
    reason: 'data_granularity_too_coarse',
  });
}
