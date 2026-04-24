import { NextResponse } from 'next/server';

/**
 * GET /api/version
 *
 * 배포된 빌드의 메타데이터를 노출하는 공개 엔드포인트.
 * 주 목적은 "지금 라이브에 떠 있는 커밋이 어떤 것인가"를 빠르게 확인하는 것.
 * 민감정보 없음 — Vercel 이 자동 주입하는 공개 환경변수만 사용.
 *
 * 예:
 *   { "commit": "d9a867b974b3f3b3...", "commitShort": "d9a867b", ... }
 *
 * 연관 작업: L-sec157 Phase 3b 배포 확인, 향후 Phase 3c MASTER_PASSWORD 제거 전
 * "현재 커밋에 Phase 3b 가 포함되어 있는가" 를 외부에서 검증하기 위함.
 */
export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || '';
  const commitShort = commit ? commit.slice(0, 7) : '';
  const ref = process.env.VERCEL_GIT_COMMIT_REF || '';
  const repoOwner = process.env.VERCEL_GIT_REPO_OWNER || '';
  const repoSlug = process.env.VERCEL_GIT_REPO_SLUG || '';
  const commitMsg = process.env.VERCEL_GIT_COMMIT_MESSAGE || '';

  return NextResponse.json(
    {
      service: 'wishes',
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      commit,
      commitShort,
      ref,
      repo: repoOwner && repoSlug ? `${repoOwner}/${repoSlug}` : '',
      // 첫 줄만 노출하여 메시지가 길어질 때 응답 비대화 방지
      commitMessage: commitMsg ? commitMsg.split('\n')[0].slice(0, 200) : '',
      deployedAt: process.env.VERCEL_DEPLOYMENT_CREATED_AT || '',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Type': 'application/json',
      },
    }
  );
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
