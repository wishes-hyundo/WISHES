// ââââââââââââââââââââââââââââââââââââââââ
// API: POST /api/listings/[id]/images
// ë§¤ë¬¼ ì¬ì§ ìë¡ë (R2 + Supabase listing_images)
// ââââââââââââââââââââââââââââââââââââââââ
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadToR2, deleteFromR2 } from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'wishes2026';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS });
}

function isAdmin(request: NextRequest): boolean {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.split(' ')[1] === ADMIN_TOKEN;
}

// POST: ì´ë¯¸ì§ ìë¡ë
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { success: false, error: 'ì¸ì¦ ì¤í¨' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: 'ì í¨íì§ ìì ë§¤ë¬¼ ID' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('images') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ìë¡ëí  ì´ë¯¸ì§ê° ììµëë¤' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ìµë 10ì¥ ì í
    if (files.length > 10) {
      return NextResponse.json(
        { success: false, error: 'í ë²ì ìµë 10ì¥ê¹ì§ ìë¡ëí  ì ììµëë¤' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ë§¤ë¬¼ ì¡´ì¬ íì¸
    const { data: listing, error: listingErr } = await supabase
      .from('listings')
      .select('id')
      .eq('id', listingId)
      .single();

    if (listingErr || !listing) {
      return NextResponse.json(
        { success: false, error: 'ë§¤ë¬¼ì ì°¾ì ì ììµëë¤' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // ì´ë¯¸ì§ ìë¡ë ì²ë¦¬
    const uploadedImages: { url: string; order_num: number }[] = [];

    // ê¸°ì¡´ ì´ë¯¸ì§ ì íì¸ (order_num ì¤ì ì©)
    const { count: existingCount } = await supabase
      .from('listing_images')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId);

    let orderStart = (existingCount || 0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // íì¼ íì ê²ì¦
      if (!file.type.startsWith('image/')) {
        continue;
      }

      // íì¼ í¬ê¸° ì í (10MB)
      if (file.size > 10 * 1024 * 1024) {
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.type.split('/')[1] || 'jpg';
      const timestamp = Date.now();
      const key = `listings/${listingId}/${timestamp}_${i}.${ext}`;

      try {
        const imageUrl = await uploadToR2(key, buffer, file.type);

        // listing_images íì´ë¸ì ì ì¥
        const { data: imgData, error: imgErr } = await supabase
          .from('listing_images')
          .insert({
            listing_id: listingId,
            url: imageUrl,
            storage_key: key,
            order_num: orderStart + i,
          })
          .select()
          .single();

        if (!imgErr && imgData) {
          uploadedImages.push({ url: imageUrl, order_num: orderStart + i });
        }
      } catch (uploadErr) {
        console.error(`ì´ë¯¸ì§ ìë¡ë ì¤í¨ (${i}):`, uploadErr);
      }
    }

    if (uploadedImages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ì´ë¯¸ì§ ìë¡ëì ì¤í¨íìµëë¤' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `${uploadedImages.length}èµ£ì ì¬ì§ì´ ë±ë¡ëììµëë¤`,
        images: uploadedImages,
        listingId: listingId,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('ì´ë¯¸ì§ ìë¡ë ì¤ë¥:', error);
    return NextResponse.json(
      { success: false, error: 'ìë² ì¤ë¥ê° ë°ìíìµëë¤' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// GET: ë§¤ë¬¼ì ì´ë¯¸ì§ ëª©ë¡ ì¡°í
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: 'ì í¨íì§ ìì ë§¤ë¬¼ ID' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: images, error } = await supabase
      .from('listing_images')
      .select('id, url, order_num, created_at')
      .eq('listing_id', listingId)
      .order('order_num', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: 'ì´ë¯¸ì§ ì¡°í ì¤í¨' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, data: images || [] },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'ìë² ì¤ë¥' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// DELETE: í¹ì  ì´ë¯¸ì§ ì­ì 
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { success: false, error: 'ì¸ì¦ ì¤í¨' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    if (!imageId) {
      return NextResponse.json(
        { success: false, error: 'imageId íë¼ë¯¸í°ê° íìí©ëë¤' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ì´ë¯¸ì§ ì ë³´ ì¡°í
    const { data: image, error: findErr } = await supabase
      .from('listing_images')
      .select('id, storage_key')
      .eq('id', parseInt(imageId))
      .eq('listing_id', listingId)
      .single();

    if (findErr || !image) {
      return NextResponse.json(
        { success: false, error: 'ì´ë¯¸ì§ë¥¼ ì°¾ì ì ììµëë¤' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // R2ìì ì­ì 
    if (image.storage_key) {
      try { await deleteFromR2(image.storage_key); } catch (e) { console.warn('R2 ì­ì  ì¤í¨:', e); }
    }

    // DBìì ì­ì 
    await supabase
      .from('listing_images')
      .delete()
      .eq('id', image.id);

    return NextResponse.json(
      { success: true, message: 'ì´ë¯¸ì§ê° ì­ì ëììµëë¤' },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'ìë² ì¤ë¥' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
