import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tkn = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(tkn);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase.from('alert_settings').select('*').eq('user_id', user.id).single();
  if (error && error.code !== 'PGRST116') {
    // L-sec70 (2026-04-22): Supabase error 메시지 prod 노출 차단
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json({ error: isDev ? error.message : '알림 조회 실패' }, { status: 500 });
  }
  return NextResponse.json(data || { areas: [], types: [], deals: [], min_price: 0, max_price: 0, enabled: false });
}

// L-sec21 (2026-04-22): 사용자 단일 레코드라도 배열/숫자 cap 없으면
//   수백 MB payload 로 row 비대화 가능. 배열은 200개·각 원소 40자 이하 필터,
//   숫자는 유한수 0~1e12 범위만 허용.
function capStrArray(v: any, maxElems: number, maxChars: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .slice(0, maxElems)
    .map((s) => s.slice(0, maxChars));
}
function finiteNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return 0;
  return n;
}

export async function PUT(request: NextRequest) {
  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tkn = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(tkn);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { areas, types, deals, min_price, max_price, enabled } = (body || {}) as any;
  const { data, error } = await supabase.from('alert_settings').upsert({
    user_id: user.id,
    areas: capStrArray(areas, 200, 60),
    types: capStrArray(types, 50, 40),
    deals: capStrArray(deals, 20, 20),
    min_price: finiteNum(min_price),
    max_price: finiteNum(max_price),
    enabled: enabled !== undefined ? !!enabled : true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select().single();
  if (error) {
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json({ error: isDev ? error.message : '알림 저장 실패' }, { status: 500 });
  }
  return NextResponse.json(data);
}