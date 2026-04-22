// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CORS helpers — admin 엔드포인트 Origin 화이트리스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// L-sec10 (2026-04-22): 기존에는 admin 라우트 핸들러마다
// `CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' }` 를 하드코딩해
// middleware.ts 의 H4 화이트리스트 픽스가 route handler 응답에서 덮어쓰여
// 사실상 무력화되던 회귀가 있었다. 이 헬퍼로 route handler 도
// origin 기반 화이트리스트를 강제한다.
//
// middleware.ts 의 ALLOWED_ADMIN_ORIGINS 와 정확히 동일한 규칙.

import type { NextRequest } from 'next/server';

const ALLOWED_ADMIN_ORIGINS = [
  'https://wishes.co.kr',
  'https://www.wishes.co.kr',
  'http://localhost:3000',
  'http://localhost:3001',
];

/**
 * 요청의 Origin 헤더가 화이트리스트에 있으면 echo,
 * Vercel preview (*.vercel.app) 도 허용, 그 외엔 null.
 */
export function resolveAdminOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  if (ALLOWED_ADMIN_ORIGINS.includes(origin)) return origin;
  try {
    const { hostname } = new URL(origin);
    if (hostname.endsWith('.vercel.app')) return origin;
  } catch {
    /* invalid Origin — 무시 */
  }
  return null;
}

/**
 * admin 엔드포인트용 CORS 응답 헤더 묶음.
 * allowed origin 이 없으면 Allow-Origin 을 생략해 CORS 실패하도록 한다.
 */
export function adminCorsHeaders(
  req: NextRequest,
  methods: string = 'GET, POST, PUT, OPTIONS'
): Record<string, string> {
  const origin = resolveAdminOrigin(req);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
