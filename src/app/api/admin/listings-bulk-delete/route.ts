import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

/**
 * POST /api/admin/listings-bulk-delete
 * Body: { ids: number[] } — max 500 per request
 * Or: { source_site: string } — delete all by source_site
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const supabase = createServerClient();

    // Option 1: Delete by source_site
    if (body.source_site && typeof body.source_site === 'string') {
      // L-sec47 (2026-04-22): source_site 길이 cap — .eq() 는 안전하지만 방어선
      const sourceSite = body.source_site.slice(0, 60);
      const { data, error, count } = await supabase
        .from('listings')
        .delete()
        .eq('source_site', sourceSite)
        .select('id', { count: 'exact' });

      if (error) {
        console.error('Bulk delete by source_site error:', error);
        // L-sec47: prod 에서는 DB error.message 숨김
        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(
          { success: false, error: isDev ? error.message : '삭제 실패' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        deleted: data?.length || count || 0,
        message: `source_site='${sourceSite}' 매물 삭제 완료`,
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
        // L-sec47: prod 에서는 DB error.message 숨김
        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(
          { success: false, error: isDev ? error.message : '삭제 실패' },
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
