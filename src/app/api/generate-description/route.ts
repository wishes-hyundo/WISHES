// /api/generate-description — DEPRECATED → /api/admin/auto-generate redirect (buildBriefing)
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  let body: { listingId?: number } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  if (!body.listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  // /api/admin/auto-generate (buildBriefing) 으로 redirect
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://wishes.co.kr';
  const auth = request.headers.get('authorization') || '';
  const cookie = request.headers.get('cookie') || '';
  const res = await fetch(`${baseUrl}/api/admin/auto-generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'Cookie': cookie,
    },
    body: JSON.stringify({ listingId: body.listingId, saveToDb: true }),
  });
  const j = await res.json();
  return NextResponse.json(j, { status: res.status });
}
