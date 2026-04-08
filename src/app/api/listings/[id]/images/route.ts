// API: POST /api/listings/[id]/images
// 매물 사진 업로드 (R2 + Supabase listing_images)
// fix: order_num 컬럼 제거, 상세 에러 메시지
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

// POST: 이미지 업로드
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseErr: any) {
      return NextResponse.json(
        { success: false, error: 'FormData 파싱 실패: ' + (parseErr?.message || String(parseErr)) },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const files = formData.getAll('images') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: '업로드할 이미지가 없습니다' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (files.length > 10) {
      return NextResponse.json(
        { success: false, error: '한 번에 최대 10장까지 업로드할 수 있습니다' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 매물 존재 확인
    const { data: listing, error: listingErr } = await supabase
      .from('listings')
      .select('id')
      .eq('id', listingId)
      .single();

    if (listingErr || !listing) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const uploadedImages: { url: string }[] = [];
    const errors: { index: number; name: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!file.type.startsWith('image/')) {
        errors.push({ index: i, name: file.name, error: '이미지 파일이 아닙니다' });
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        errors.push({ index: i, name: file.name, error: '파일 크기 초과: ' + (file.size / 1024 / 1024).toFixed(1) + 'MB' });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.type.split('/')[1] || 'jpg';
        const timestamp = Date.now();
        const key = `listings/${listingId}/${timestamp}_${i}.${ext}`;

        const imageUrl = await uploadToR2(key, buffer, file.type);

        // order_num 컬럼 없이 insert
        const { data: imgData, error: imgErr } = await supabase
          .from('listing_images')
          .insert({
            listing_id: listingId,
            url: imageUrl,
            storage_key: key,
          })
          .select()
          .single();

        if (imgErr) {
          errors.push({ index: i, name: file.name, error: 'DB 저장 실패: ' + imgErr.message });
        } else if (imgData) {
          uploadedImages.push({ url: imageUrl });
        }
      } catch (uploadErr: any) {
        const errMsg = uploadErr?.message || String(uploadErr);
        console.error(`이미지 업로드 실패 (${i}):`, errMsg);
        errors.push({ index: i, name: file.name, error: 'R2 업로드 실패: ' + errMsg });
      }
    }

    if (uploadedImages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '모든 이미지 업로드에 실패했습니다',
          errors: errors,
          details: errors.map(e => e.name + ': ' + e.error).join('; '),
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: uploadedImages.length + '장의 사진이 등록되었습니다',
        images: uploadedImages,
        listingId: listingId,
        ...(errors.length > 0 ? { errors } : {}),
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error('이미지 업로드 오류:', errMsg);
    return NextResponse.json(
      { success: false, error: 'Server error: ' + errMsg },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// GET: 매물의 이미지 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: images, error } = await supabase
      .from('listing_images')
      .select('id, url, created_at')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: '이미지 조회 실패: ' + error.message },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, data: images || [] },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Server error: ' + (error?.message || String(error)) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// DELETE: 특정 이미지 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    if (!imageId) {
      return NextResponse.json(
        { success: false, error: 'imageId 파라미터가 필요합니다' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: image, error: findErr } = await supabase
      .from('listing_images')
      .select('id, storage_key')
      .eq('id', parseInt(imageId))
      .eq('listing_id', listingId)
      .single();

    if (findErr || !image) {
      return NextResponse.json(
        { success: false, error: '이미지를 찾을 수 없습니다' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (image.storage_key) {
      try {
        await deleteFromR2(image.storage_key);
      } catch (e) {
        console.warn('R2 삭제 실패:', e);
      }
    }

    await supabase
      .from('listing_images')
      .delete()
      .eq('id', image.id);

    return NextResponse.json(
      { success: true, message: '이미지가 삭제되었습니다' },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Server error: ' + (error?.message || String(error)) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
    }// ════════════════════════════════════════
// API: POST /api/listings/[id]/images
// 매물 사진 업로드 (R2 + Supabase listing_images)
// 개선: 상세 에러 메시지 반환
// ════════════════════════════════════════
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

// POST: 이미지 업로드
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // FormData 파싱 (별도 try-catch)
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseErr: any) {
      return NextResponse.json(
        { success: false, error: 'FormData 파싱 실패: ' + (parseErr?.message || String(parseErr)) },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const files = formData.getAll('images') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: '업로드할 이미지가 없습니다' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (files.length > 10) {
      return NextResponse.json(
        { success: false, error: '한 번에 최대 10장까지 업로드할 수 있습니다' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 매물 존재 확인
    const { data: listing, error: listingErr } = await supabase
      .from('listings')
      .select('id')
      .eq('id', listingId)
      .single();

    if (listingErr || !listing) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // 기존 이미지 수 확인 (order_num 설정용)
    const { count: existingCount } = await supabase
      .from('listing_images')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId);

    let orderStart = existingCount || 0;
    const uploadedImages: { url: string; order_num: number }[] = [];
    const errors: { index: number; name: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // 파일 타입 검증
      if (!file.type.startsWith('image/')) {
        errors.push({ index: i, name: file.name, error: '이미지 파일이 아닙니다 (type: ' + file.type + ')' });
        continue;
      }

      // 파일 크기 제한 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        errors.push({ index: i, name: file.name, error: '파일 크기 초과: ' + (file.size / 1024 / 1024).toFixed(1) + 'MB (최대 10MB)' });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.type.split('/')[1] || 'jpg';
        const timestamp = Date.now();
        const key = `listings/${listingId}/${timestamp}_${i}.${ext}`;

        const imageUrl = await uploadToR2(key, buffer, file.type);

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

        if (imgErr) {
          errors.push({ index: i, name: file.name, error: 'DB 저장 실패: ' + imgErr.message });
        } else if (imgData) {
          uploadedImages.push({ url: imageUrl, order_num: orderStart + i });
        }
      } catch (uploadErr: any) {
        const errMsg = uploadErr?.message || String(uploadErr);
        console.error(`이미지 업로드 실패 (${i}):`, errMsg);
        errors.push({ index: i, name: file.name, error: 'R2 업로드 실패: ' + errMsg });
      }
    }

    if (uploadedImages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '모든 이미지 업로드에 실패했습니다',
          errors: errors,
          details: errors.map(e => e.name + ': ' + e.error).join('; '),
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: uploadedImages.length + '장의 사진이 등록되었습니다',
        images: uploadedImages,
        listingId: listingId,
        ...(errors.length > 0 ? { errors } : {}),
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error('이미지 업로드 오류:', errMsg);
    return NextResponse.json(
      { success: false, error: 'Server error: ' + errMsg },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// GET: 매물의 이미지 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID' },
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
        { success: false, error: '이미지 조회 실패: ' + error.message },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, data: images || [] },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Server error: ' + (error?.message || String(error)) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// DELETE: 특정 이미지 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');

    if (!imageId) {
      return NextResponse.json(
        { success: false, error: 'imageId 파라미터가 필요합니다' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: image, error: findErr } = await supabase
      .from('listing_images')
      .select('id, storage_key')
      .eq('id', parseInt(imageId))
      .eq('listing_id', listingId)
      .single();

    if (findErr || !image) {
      return NextResponse.json(
        { success: false, error: '이미지를 찾을 수 없습니다' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (image.storage_key) {
      try {
        await deleteFromR2(image.storage_key);
      } catch (e) {
        console.warn('R2 삭제 실패:', e);
      }
    }

    await supabase
      .from('listing_images')
      .delete()
      .eq('id', image.id);

    return NextResponse.json(
      { success: true, message: '이미지가 삭제되었습니다' },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Server error: ' + (error?.message || String(error)) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
          }
