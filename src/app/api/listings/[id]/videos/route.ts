// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /api/listings/[id]/videos
// listing_videos 전용 CRUD — listing_images 의 대칭 구조
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadToR2, deleteFromR2 } from '@/lib/r2';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { adminCorsHeaders } from '@/lib/cors';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// L-sec3 (2026-04-22): 박제 ADMIN_TOKEN fallback 'wishes2026' 제거 → verifyAdminAuth

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// L-sec15 (2026-04-22): listing_videos CORS '*' → Origin 화이트리스트 (L-sec10 패턴).

const VALID_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/x-matroska',
]);

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

// L-sec41 (2026-04-22): 에러 메시지 프로덕션 숨김 + PATCH videos 배열 cap.
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

function mimeToExt(mime: string, name?: string): string {
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/x-m4v') return 'm4v';
  if (mime === 'video/x-matroska') return 'mkv';
  if (name) {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext && /^(mp4|mov|webm|m4v|mkv)$/.test(ext)) return ext;
  }
  return 'mp4';
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

    const files = formData.getAll('videos') as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: 'No videos' }, { status: 400, headers: cors });
    }
    if (files.length > 5) {
      return NextResponse.json({ success: false, error: 'Max 5 videos per request' }, { status: 400, headers: cors });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: listing, error: le } = await supabase.from('listings').select('id').eq('id', listingId).single();
    if (le || !listing) {
      return NextResponse.json({ success: false, error: 'Listing not found' }, { status: 404, headers: cors });
    }

    const { data: existing } = await supabase
      .from('listing_videos')
      .select('sort_order')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: false })
      .limit(1);
    let nextSortOrder = (existing && existing[0]?.sort_order != null) ? existing[0].sort_order + 1 : 0;

    const uploaded: { id?: number; url: string; mime: string; size: number }[] = [];
    const errors: { index: number; name: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const mime = file.type || 'application/octet-stream';
      const name = file.name || '';
      const extMatch = /\.(mp4|mov|webm|m4v|mkv)$/i.test(name);
      if (!VALID_MIME.has(mime) && !extMatch) {
        errors.push({ index: i, name, error: 'Invalid format (mp4/mov/webm)' });
        continue;
      }
      if (file.size > MAX_SIZE) {
        errors.push({ index: i, name, error: `Too large (${(file.size / 1024 / 1024).toFixed(1)}MB > 50MB)` });
        continue;
      }

      try {
        const buf = Buffer.from(await file.arrayBuffer());
        const ext = mimeToExt(mime, name);
        const effectiveMime = VALID_MIME.has(mime)
          ? mime
          : (ext === 'mov' ? 'video/quicktime' : `video/${ext === 'm4v' ? 'x-m4v' : ext}`);
        const key = `listings/${listingId}/video-${Date.now()}_${i}.${ext}`;
        const url = await uploadToR2(key, buf, effectiveMime);

        const { data: inserted, error: de } = await supabase
          .from('listing_videos')
          .insert({
            listing_id: listingId,
            url,
            mime_type: effectiveMime,
            file_size: file.size,
            alt: name,
            sort_order: nextSortOrder + i,
          })
          .select('id, url')
          .single();

        if (de) errors.push({ index: i, name, error: 'DB: ' + de.message });
        else uploaded.push({ id: inserted?.id, url, mime: effectiveMime, size: file.size });
      } catch (err: any) {
        errors.push({ index: i, name, error: errMsg('R2: ', err) });
      }
    }

    if (uploaded.length === 0) {
      return NextResponse.json(
        { success: false, error: 'All failed', errors, details: errors.map(e => e.name + ': ' + e.error).join('; ') },
        { status: 500, headers: cors }
      );
    }

    return NextResponse.json(
      { success: true, message: uploaded.length + ' uploaded', data: uploaded, videos: uploaded, listingId, ...(errors.length > 0 ? { errors } : {}) },
      { headers: cors }
    );
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
    // L-sec83 (2026-04-22): 공개 GET. 비디오 목록 쪽 5분 100회/IP.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `listing-videos:ip:${_ip}`, limit: 100, windowMs: 5 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: '요청이 너무 많습니다.' },
        { status: 429, headers: { ...cors, 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);
    if (isNaN(listingId)) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400, headers: cors });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // L-sec92 (2026-04-22): IDOR 차단 — 부모 listings.status='공개' 선검증. 없으면 404.
    const { data: parent } = await supabase
      .from('listings')
      .select('id')
      .eq('id', listingId)
      .eq('status', '공개')
      .maybeSingle();
    if (!parent) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404, headers: cors });
    const { data, error } = await supabase
      .from('listing_videos')
      .select('id, url, poster_url, mime_type, file_size, duration_sec, width, height, alt, sort_order, created_at')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ success: false, error: IS_DEV ? error.message : 'DB 조회 실패' }, { status: 500, headers: cors });
    return NextResponse.json({ success: true, data: data || [] }, { headers: cors });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: errMsg('Server: ', error) }, { status: 500, headers: cors });
  }
}

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
    const { videos } = body as { videos: { id: number; sort_order?: number; alt?: string; poster_url?: string }[] };
    if (!videos || !Array.isArray(videos)) {
      return NextResponse.json({ success: false, error: 'videos array required' }, { status: 400, headers: cors });
    }
    // L-sec41: PATCH videos 배열 길이 cap
    if (videos.length > 100) {
      return NextResponse.json({ success: false, error: 'Too many videos (max 100)' }, { status: 400, headers: cors });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const results: { id: number; success: boolean; error?: string }[] = [];

    for (const v of videos) {
      const updateData: Record<string, any> = {};
      if (typeof v.sort_order === 'number') updateData.sort_order = v.sort_order;
      if (typeof v.alt === 'string') updateData.alt = v.alt;
      if (typeof v.poster_url === 'string') updateData.poster_url = v.poster_url;
      if (Object.keys(updateData).length === 0) { results.push({ id: v.id, success: true }); continue; }
      const { error } = await supabase.from('listing_videos').update(updateData).eq('id', v.id).eq('listing_id', listingId);
      results.push({ id: v.id, success: !error, error: error?.message });
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
    const videoId = new URL(request.url).searchParams.get('videoId');
    if (!videoId) return NextResponse.json({ success: false, error: 'videoId required' }, { status: 400, headers: cors });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: video, error: fe } = await supabase
      .from('listing_videos')
      .select('id, url')
      .eq('id', parseInt(videoId))
      .eq('listing_id', listingId)
      .single();
    if (fe || !video) return NextResponse.json({ success: false, error: 'Video not found' }, { status: 404, headers: cors });

    if (video.url) {
      try {
        const u = new URL(video.url);
        const key = u.pathname.replace(/^\//, '');
        if (key) await deleteFromR2(key);
      } catch (e) { console.warn('R2 delete fail:', e); }
    }

    await supabase.from('listing_videos').delete().eq('id', video.id);
    return NextResponse.json({ success: true, message: 'Deleted' }, { headers: cors });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: errMsg('Server: ', error) }, { status: 500, headers: cors });
  }
}
