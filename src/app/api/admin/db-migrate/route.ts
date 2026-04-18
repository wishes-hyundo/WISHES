/**
 * POST /api/admin/db-migrate
 * Supabase DB에 신규 컬럼을 추가하는 마이그레이션 엔드포인트
 * Authorization: Bearer wishes2026
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MIGRATION_SQL = `
ALTER TABLE listings ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS goodwill_fee INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS vat_included BOOLEAN;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS station_name TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS station_distance INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS usage_approved TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS electric_capacity TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS signage_available BOOLEAN;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS meeting_room INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gu TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS entrance_type TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS features TEXT[];
ALTER TABLE listings ADD COLUMN IF NOT EXISTS parking_fee INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS building_purpose TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS previous_brand TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS commission_fee INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS special_notes TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ai_title TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ai_description TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seo_tags TEXT[];
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seo_meta_description TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_listings_gu ON listings(gu);
CREATE INDEX IF NOT EXISTS idx_listings_source_id ON listings(source_id);
`;

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Supabase env vars missing' }, { status: 500 });
  }

  try {
    // Supabase Management API (pg_meta) — requires service role key in Authorization header
    const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
    const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

    const resp = await fetch(mgmtUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    });

    if (resp.ok) {
      const data = await resp.json();
      return NextResponse.json({ success: true, method: 'management_api', result: data });
    }

    // Fallback: try using supabase-js rpc (may not work without exec_sql function)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Try calling pg_meta exec endpoint via REST
    const stmts = MIGRATION_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 5);

    const results: Array<{ sql: string; ok: boolean; error?: string }> = [];

    for (const stmt of stmts) {
      try {
        // Use supabase.rpc if exec_sql function exists
        const { error } = await (supabase as any).rpc('exec_sql', { query: stmt + ';' });
        results.push({ sql: stmt.substring(0, 80), ok: !error, error: error?.message });
      } catch (e: any) {
        results.push({ sql: stmt.substring(0, 80), ok: false, error: e?.message });
      }
    }

    const allOk = results.every(r => r.ok);
    return NextResponse.json({
      success: allOk,
      method: 'rpc_fallback',
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    message: 'POST this endpoint to run DB migration',
    columns_to_add: [
      'business_type', 'goodwill_fee', 'vat_included', 'station_name', 'station_distance',
      'usage_approved', 'electric_capacity', 'signage_available', 'meeting_room',
      'gu', 'entrance_type', 'features', 'parking_fee', 'building_purpose',
      'previous_brand', 'commission_fee', 'special_notes',
      'ai_title', 'ai_description', 'seo_keywords', 'seo_tags', 'seo_meta_description', 'ai_generated_at',
    ],
  });
}
