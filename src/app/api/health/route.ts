import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Lightweight health check endpoint for uptime monitoring.
 * Returns 200 with basic service info - no auth, no DB hit.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'wishes',
    timestamp: new Date().toISOString(),
    uptime: typeof process !== 'undefined' && process.uptime ? Math.floor(process.uptime()) : null
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json'
    }
  });
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
