import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// L-sec36 (2026-04-22): listing_id 는 0 이상 20억 이하 정수만 허용 (Supabase bigint 안전 범위).
//   \!listing_id 로만 검증하면 0 / 객체 / 배열 통과.
function parseListingId(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 2_000_000_000) return null;
  return n;
}

function errorBody(msg: string, detail?: unknown) {
  const isDev = process.env.NODE_ENV !== 'production';
  return isDev && detail ? { error: msg, detail: String(detail) } : { error: msg };
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tkn = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(tkn);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase.from('favorites').select('listing_id').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) return NextResponse.json(errorBody('favorites 조회 실패', error.message), { status: 500 });

  const allIds = ((data || []) as any[]).map(f => f.listing_id as number);
  if (allIds.length === 0) return NextResponse.json({ favorites: [] });

  // 고아 레코드 필터링: 삭제·비공개 매물은 카운트에서 제외하고 DB에서도 정리
  const { data: valid } = await supabase
    .from('listings')
    .select('id')
    .in('id', allIds)
    .eq('status', '공개');

  const validIds = new Set((valid || []).map((r: any) => r.id));
  const liveIds = allIds.filter(id => validIds.has(id));
  const orphans = allIds.filter(id => !validIds.has(id));

  // 고아 즉시 삭제 (응답은 대기하지 않음)
  if (orphans.length > 0) {
    supabase.from('favorites').delete().eq('user_id', user.id).in('listing_id', orphans).then(() => {});
  }

  return NextResponse.json({ favorites: liveIds });
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tkn = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(tkn);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const listing_id = parseListingId((body as any)?.listing_id);
  if (listing_id == null) {
    return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
  }
  const { error } = await supabase.from('favorites').upsert({ user_id: user.id, listing_id }, { onConflict: 'user_id,listing_id' });
  if (error) return NextResponse.json(errorBody('favorites 추가 실패', error.message), { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tkn = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(tkn);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const listing_id = parseListingId((body as any)?.listing_id);
  if (listing_id == null) {
    return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
  }
  const { error } = await supabase.from('favorites').delete().eq('user_id', user.id).eq('listing_id', listing_id);
  if (error) return NextResponse.json(errorBody('favorites 삭제 실패', error.message), { status: 500 });
  return NextResponse.json({ success: true });
}
