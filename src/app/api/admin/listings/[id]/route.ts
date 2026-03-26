// ââââââââââââââââââââââââââââââââââââââââ
// Admin API: GET, DELETE, PATCH /api/admin/listings/[id]
// ââââââââââââââââââââââââââââââââââââââââ

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';

/**
 * ì¸ì¦ ê²ì¦ í¬í¼ í¨ì
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const password = authHeader?.replace('Bearer ', '');
  return password === 'wishes2026';
}

/**
 * GET /api/admin/listings/[id] - ë¨ì¼ ë§¤ë¬¼ ì¡°í
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: 'ì¸ì¦ ì¤í¨' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: 'ì í¨íì§ ìì ë§¤ë¬¼ IDìëë¤' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('listings')
      .select('*, listing_images(*)')
      .eq('id', listingId)
      .single();

    if (error) {
      console.error('ë§¤ë¬¼ ì¡°í ì¤ë¥:', error);
      return NextResponse.json(
        { success: false, error: 'ë§¤ë¬¼ì ì°¾ì ì ììµëë¤' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('ë§¤ë¬¼ ì¡°í ì¤ë¥:', error);
    return NextResponse.json(
      { success: false, error: 'ë§¤ë¬¼ ì¡°íì ì¤í¨íìµëë¤' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/listings/[id] - ë§¤ë¬¼ ì­ì 
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: 'ì¸ì¦ ì¤í¨' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: 'ì í¨íì§ ìì ë§¤ë¬¼ IDìëë¤' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', listingId);

    if (error) {
      console.error('ë§¤ë¬¼ ì­ì  ì¤ë¥:', error);
      return NextResponse.json(
        { success: false, error: 'ë§¤ë¬¼ ì­ì ì ì¤í¨íìµëë¤' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'ë§¤ë¬¼ì´ ì­ì ëììµëë¤',
    });
  } catch (error) {
    console.error('ë§¤ë¬¼ ì­ì  ì¤ë¥:', error);
    return NextResponse.json(
      { success: false, error: 'ë§¤ë¬¼ ì­ì ì ì¤í¨íìµëë¤' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/listings/[id] - ë§¤ë¬¼ ìí ë³ê²½
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json(
        { success: false, error: 'ì¸ì¦ ì¤í¨' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: 'ì í¨íì§ ìì ë§¤ë¬¼ IDìëë¤' },
        { status: 400 }
      );
    }

    const body = await request.json();

    const statusSchema = z.object({
      status: z.enum(['ê°ì©', 'ê³ì½ì¤', 'ê³ì½ìë£']),
    });

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'ì í¨íì§ ìì ìíìëë¤' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('listings')
      .update({ status: parsed.data.status })
      .eq('id', listingId)
      .select()
      .single();

    if (error) {
      console.error('ë§¤ë¬¼ ìí ë³ê²½ ì¤ë¥:', error);
      return NextResponse.json(
        { success: false, error: 'ìí ë³ê²½ì ì¤í¨íìµëë¤' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'ë§¤ë¬¼ì ì°¾ì ì ììµëë¤' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('ë§¤ë¬¼ ìí ë³ê²½ ì¤ë¥:', error);
    return NextResponse.json(
      { success: false, error: 'ìí ë³ê²½ì ì¤í¨íìµëë¤' },
      { status: 500 }
    );
  }
}
