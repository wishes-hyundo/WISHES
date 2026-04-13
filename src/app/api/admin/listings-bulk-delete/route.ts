import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'wishes2026';

/**
 * POST /api/admin/listings-bulk-delete
 * Body: { ids: number[] } — max 500 per request
 * Or: { source_site: string } — delete all by source_site
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const supabase = createServerClient();

    // Option 1: Delete by source_site
    if (body.source_site && typeof body.source_site === 'string') {
      const { data, error, count } = await supabase
        .from('listings')
        .delete()
        .eq('source_site', body.source_site)
        .select('id', { count: 'exact' });

      if (error) {
        console.error('Bulk delete by source_site error:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        deleted: data?.length || count || 0,
        message: `source_site='${body.source_site}' 매물 삭제 완료`,
      });
    }

    // Option 2: Delete by IDs array
    if (body.ids && Array.isArray(body.ids)) {
      if (body.ids.length > 500) {
        return NextResponse.json(
          { error: 'Max 500 IDs per request' },
          { status: 400 }
        );
      }

      const ids = body.ids.filter((id: unknown) => typeof id === 'number' && Number.isInteger(id));
      if (ids.length === 0) {
        return NextResponse.json(
          { error: 'No valid IDs provided' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('listings')
        .delete()
        .in('id', ids)
        .select('id');

      if (error) {
        console.error('Bulk delete by IDs error:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        deleted: data?.length || 0,
        requested: ids.length,
      });
    }

    return NextResponse.json(
      { error: 'Provide either { ids: number[] } or { source_site: string }' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Bulk delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
