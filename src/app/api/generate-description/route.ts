// /api/generate-description — 단순화 (path-to-regexp 충돌 회피)
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 5;

export async function POST(_request: NextRequest) {
  return NextResponse.json({
    error: 'deprecated',
    message: 'Use /api/admin/auto-generate or /api/admin/generate-description-v2',
  }, { status: 410 });
}
