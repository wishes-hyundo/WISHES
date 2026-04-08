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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
    }
    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) {
      return NextResponse.json({ success: false, error: 'Invalid listing ID' }, { status: 400, headers: CORS_HEADERS });
    }
    let formData: FormData;
    try { formData = await request.formData(); } catch (e: any) {
      return NextResponse.json({ success: false, error: 'FormData error: ' + (e?.message || String(e)) }, { status: 400, headers: CORS_HEADERS });
    }
    const files = formData.getAll('images') as File[];
    if (!files || files.length === 0) return NextResponse.json({ success: false, error: 'No images' }, { status: 400, headers: CORS_HEADERS });
    if (files.length > 20) return NextResponse.json({ success: false, error: 'Max 20 images' }, { status: 400, headers: CORS_HEADERS });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: listing, error: le } = await supabase.from('listings').select('id').eq('id', listingId).single();
    if (le || !listing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404, headers: CORS_HEADERS });

    const uploaded: { url: string }[] = [];
    const errors: { index: number; name: string; error: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) { errors.push({ index: i, name: file.name, error: 'Not image' }); continue; }
      if (file.size > 10 * 1024 * 1024) { errors.push({ index: i, name: file.name, error: 'Too large' }); continue; }
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        const ext = file.type.split('/')[1] || 'jpg';
        const key = `listings/${listingId}/${Date.now()}_${i}.${ext}`;
        const imageUrl = await uploadToR2(key, buf, file.type);
        const { error: de } = await supabase.from('listing_images').insert({ listing_id: listingId, url: imageUrl });
        if (de) errors.push({ index: i, name: file.name, error: 'DB: ' + de.message });
        else uploaded.push({ url: imageUrl });
      } catch (err: any) {
        errors.push({ index: i, name: file.name, error: 'R2: ' + (err?.message || String(err)) });
      }
    }
    if (uploaded.length === 0) {
      return NextResponse.json({ success: false, error: 'All failed', errors, details: errors.map(e => e.name + ': ' + e.error).join('; ') }, { status: 500, headers: CORS_HEADERS });
    }
    return NextResponse.json({ success: true, message: uploaded.length + ' uploaded', images: uploaded, listingId, ...(errors.length > 0 ? { errors } : {}) }, { headers: CORS_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Server: ' + (error?.message || String(error)) }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400, headers: CORS_HEADERS });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.from('listing_images').select('id, url, created_at').eq('listing_id', listingId).order('created_at', { ascending: true });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
    return NextResponse.json({ success: true, data: data || [] }, { headers: CORS_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Server: ' + (error?.message || String(error)) }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
    const { id } = await params;
    const listingId = parseInt(id);
    const imageId = new URL(request.url).searchParams.get('imageId');
    if (!imageId) return NextResponse.json({ success: false, error: 'imageId required' }, { status: 400, headers: CORS_HEADERS });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: image, error: fe } = await supabase.from('listing_images').select('id, url').eq('id', parseInt(imageId)).eq('listing_id', listingId).single();
    if (fe || !image) return NextResponse.json({ success: false, error: 'Image not found' }, { status: 404, headers: CORS_HEADERS });
    // R2 delete by extracting key from URL
    if (image.url) {
      try {
        const urlPath = new URL(image.url).pathname;
        const key = urlPath.replace('/api/images/', '');
        if (key) await deleteFromR2(key);
      } catch (e) { console.warn('R2 delete fail:', e); }
    }
    await supabase.from('listing_images').delete().eq('id', image.id);
    return NextResponse.json({ success: true, message: 'Deleted' }, { headers: CORS_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Server: ' + (error?.message || String(error)) }, { status: 500, headers: CORS_HEADERS });
  }
}
