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
  if (error && error.code !== 'PGRST116') return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || { areas: [], types: [], deals: [], min_price: 0, max_price: 0, enabled: false });
}

export async function PUT(request: NextRequest) {
  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tkn = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(tkn);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const { areas, types, deals, min_price, max_price, enabled } = body;
  const { data, error } = await supabase.from('alert_settings').upsert({
    user_id: user.id,
    areas: areas || [],
    types: types || [],
    deals: deals || [],
    min_price: min_price || 0,
    max_price: max_price || 0,
    enabled: enabled !== undefined ? enabled : true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}