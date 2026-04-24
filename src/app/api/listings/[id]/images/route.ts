import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadToR2, deleteFromR2 } from '@/lib/r2';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { adminCorsHeaders } from '@/lib/cors';
import { filterSelfHosted } from '@/lib/image-policy';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// L-sec3 (2026-04-22): 박제 ADMIN_TOKEN fallback 'wishes2026' 제거 → verifyAdminAuth

// L-sec15 (2026-04-22): 관리자 엔드포인트 CORS '*' → Origin 화이트리스트.
//   listing_images 의 POST/PATCH/DELETE 은 admin 전용이고 GET 은 사이트 내부 호출만
//   쓰이므로 전부 origin 기반 제한으로 좁힌다 (L-sec10 패턴 준수).

// L-sec41 (2026-04-22): 에러 메시지 프로덕션 숨김 + PATCH images 배열 cap.
const IS_DEV = process.env.NODE_ENV !== 'production';
function errMsg(prefix: string, e: any): string {
  return IS_DEV ? (prefix + (e?.message || String(e))) : prefix + 'internal';
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: adminCorsHeaders(request, 'GET, POST, PATCH, DELETE, OPTIONS') });
}

async function isAdmin(request: NextRequest): Promise<boolean> {
  return verifyAdminAuth(request);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cors = adminCorsHeaders(request, 'GET, POST, PATCH, DELETE, OPTIONS');
  try {
    if (!(await isAdmin(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: cors });
    }
    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) {
      return NextResponse.json({ success: false, error: 'Invalid listing ID' }, { status: 400, headers: cors });
    }

    let formData: FormData;
    try { formData = await request.formData(); }
    catch (e: any) {
      return NextResponse.json({ success: false, error: errMsg('FormData error: ', e) }, { status: 400, headers: cors });
    }

    const files = formData.getAll('images') as File[];
    if (!files || files.length === 0) return NextResponse.json({ success: false, error: 'No images' }, { status: 400, headers: cors });
    if (files.length > 20) return NextResponse.json({ success: false, error: 'Max 20 images' }, { status: 400, headers: cors });

    // sort_order and is_thumbnail from FormData (optional)
    const sortOrderStr = formData.get('sort_order') as string | null;
    const isThumbnailStr = formData.get('is_thumbnail') as string | null;
    // Also read metadata JSON from mobile photo upload
    const metadataStr = formData.get('metadata') as string | null;
    let metadata: any[] | null = null;
    try { if (metadataStr) metadata = JSON.parse(metadataStr); } catch {}

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: listing, error: le } = await supabase.from('listings').select('id').eq('id', listingId).single();
    if (le || !listing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404, headers: cors });

    // Get current max sort_order for this listing
    const { data: existingImages } = await supabase.from('listing_images').select('sort_order').eq('listing_id', listingId).order('sort_order', { ascending: false }).limit(1);
    let nextSortOrder = (existingImages && existingImages[0]?.sort_order != null) ? existingImages[0].sort_order + 1 : 0;

    const uploaded: { url: string; id?: number }[] = [];
    const errors: { index: number; name: string; error: string }[] = [];

    // L-sec101 (2026-04-22): SVG 업로드 차단. startsWith('image/') 는 image/svg+xml 를 통과시켜
    //   admin(또는 탈취된 admin 토큰)이 <script> 박힌 SVG 업로드 시 /api/images/[...path] 프록시에서
    //   wishes.co.kr 오리진 <script> 실행 가능 (localStorage(ws_token) 탈취).
    //   admin/upload/route.ts 와 동일 whitelist.
    const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ALLOWED_IMAGE_MIME.has(file.type)) { errors.push({ index: i, name: file.name, error: 'Unsupported format (JPEG/PNG/WebP/GIF)' }); continue; }
      if (file.size > 10 * 1024 * 1024) { errors.push({ index: i, name: file.name, error: 'Too large' }); continue; }

      try {
        // L-photo-pipeline (2026-04-24): 모바일 사진등록 포함 모든 업로드에
        //   Classic Negative + 중앙 WISHES 워터마크를 강제 적용. 결과는 WebP.
        const { processPhotoUpload } = await import('@/lib/photoProcess');
        const rawBuf = Buffer.from(await file.arrayBuffer());
        const buf = await processPhotoUpload(rawBuf);
        const key = `listings/${listingId}/${Date.now()}_${i}.webp`;
        const imageUrl = await uploadToR2(key, buf, 'image/webp');

        // Build insert data with correct column names (sort_order, is_thumbnail)
        const insertData: Record<string, any> = {
          listing_id: listingId,
          url: imageUrl,
          sort_order: sortOrderStr !== null ? parseInt(sortOrderStr) + i : nextSortOrder + i,
          is_thumbnail: (isThumbnailStr === 'true' && i === 0) || (nextSortOrder === 0 && i === 0),
        };

        // Add metadata tag as alt text if available
        if (metadata && metadata[i] && metadata[i].tag) {
          insertData.alt = metadata[i].tag;
        }

        const { data: inserted, error: de } = await supabase.from('listing_images').insert(insertData).select('id, url, sort_order').single();
        if (de) errors.push({ index: i, name: file.name, error: 'DB: ' + de.message });
        else uploaded.push({ url: imageUrl, id: inserted?.id });
      } catch (err: any) {
        errors.push({ index: i, name: file.name, error: errMsg('R2: ', err) });
      }
    }

    if (uploaded.length === 0) {
      return NextResponse.json({ success: false, error: 'All failed', errors, details: errors.map(e => e.name + ': ' + e.error).join('; ') }, { status: 500, headers: cors });
    }
    return NextResponse.json({ success: true, message: uploaded.length + ' uploaded', data: uploaded, images: uploaded, listingId, ...(errors.length > 0 ? { errors } : {}) }, { headers: cors });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: errMsg('Server: ', error) }, { status: 500, headers: cors });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cors = adminCorsHeaders(request, 'GET, POST, PATCH, DELETE, OPTIONS');
  try {
    // L-sec83 (2026-04-22): 공개 GET. id 순회 방지 5분 200회/IP.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `listing-images:ip:${_ip}`, limit: 200, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: '요청이 너무 많습니다.' },
        { status: 429, headers: { ...cors, 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400, headers: cors });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // L-sec92 (2026-04-22): IDOR 차단 — 부모 listings.status='공개' 선검증. 없으면 404.
    //   (비공개/삭제 매물 사진 열거 방지)
    // L-imgpolicy2 (2026-04-23 p.m.): 저작권 보호 — 크롤링 매물(source_site NOT NULL)
    //   의 외부 원본 이미지는 서버단에서 필터링. 자체 호스팅(/api/images, supabase, r2) 만 통과.
    const { data: parent } = await supabase
      .from('listings')
      .select('id, source_site')
      .eq('id', listingId)
      .eq('status', '공개')
      .maybeSingle();
    if (!parent) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404, headers: cors });
    const { data, error } = await supabase
      .from('listing_images')
      .select('id, url, alt, sort_order, is_thumbnail, created_at')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ success: false, error: IS_DEV ? error.message : 'DB 조회 실패' }, { status: 500, headers: cors });
    const raw = data || [];
    // 크롤링 매물이면 자체 호스팅 이미지만 통과. 자체 매물이면 전부 통과.
    const safe = (parent as { source_site?: string | null }).source_site
      ? filterSelfHosted(raw)
      : raw;
    return NextResponse.json({ success: true, data: safe }, { headers: cors });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: errMsg('Server: ', error) }, { status: 500, headers: cors });
  }
}

// PATCH: Update order and main photo status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cors = adminCorsHeaders(request, 'GET, POST, PATCH, DELETE, OPTIONS');
  try {
    if (!(await isAdmin(request))) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: cors });
    const { id } = await params;
    const listingId = parseInt(id);

    const body = await request.json().catch(() => ({}));
    const { images } = body as { images: { id: number; sort_order?: number; is_thumbnail?: boolean }[] };
    if (!images || !Array.isArray(images)) {
      return NextResponse.json({ success: false, error: 'images array required' }, { status: 400, headers: cors });
    }
    // L-sec41: PATCH images 배열 길이 cap — 단일 요청으로 수천 row update 방지
    if (images.length > 200) {
      return NextResponse.json({ success: false, error: 'Too many images (max 200)' }, { status: 400, headers: cors });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const results: { id: number; success: boolean; error?: string }[] = [];

    // If setting a new thumbnail, first unset all
    const hasNewThumbnail = images.some(img => img.is_thumbnail === true);
    if (hasNewThumbnail) {
      await supabase.from('listing_images').update({ is_thumbnail: false }).eq('listing_id', listingId);
    }

    for (const img of images) {
      const updateData: Record<string, any> = {};
      if (typeof img.sort_order === 'number') updateData.sort_order = img.sort_order;
      if (typeof img.is_thumbnail === 'boolean') updateData.is_thumbnail = img.is_thumbnail;
      if (Object.keys(updateData).length === 0) { results.push({ id: img.id, success: true }); continue; }

      const { error } = await supabase.from('listing_images').update(updateData).eq('id', img.id).eq('listing_id', listingId);
      results.push({ id: img.id, success: !error, error: error?.message });
    }

    return NextResponse.json({ success: true, results }, { headers: cors });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: errMsg('Server: ', error) }, { status: 500, headers: cors });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cors = adminCorsHeaders(request, 'GET, POST, PATCH, DELETE, OPTIONS');
  try {
    if (!(await isAdmin(request))) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: cors });
    const { id } = await params;
    const listingId = parseInt(id);
    const imageId = new URL(request.url).searchParams.get('imageId');
    if (!imageId) return NextResponse.json({ success: false, error: 'imageId required' }, { status: 400, headers: cors });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: image, error: fe } = await supabase.from('listing_images').select('id, url').eq('id', parseInt(imageId)).eq('listing_id', listingId).single();
    if (fe || !image) return NextResponse.json({ success: false, error: 'Image not found' }, { status: 404, headers: cors });

    if (image.url) {
      try {
        const urlPath = new URL(image.url).pathname;
        const key = urlPath.replace('/api/images/', '');
        if (key) await deleteFromR2(key);
      } catch (e) { console.warn('R2 delete fail:', e); }
    }

    await supabase.from('listing_images').delete().eq('id', image.id);
    return NextResponse.json({ success: true, message: 'Deleted' }, { headers: cors });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: errMsg('Server: ', error) }, { status: 500, headers: cors });
  }
          }
