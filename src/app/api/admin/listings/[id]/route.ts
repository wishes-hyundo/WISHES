// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET, DELETE, PATCH /api/admin/listings/[id]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { verifyAdminAuth as verifyAuth, verifyAdminAuthWithContext } from '@/lib/adminAuth';
import { preferSelfHostedImages } from '@/lib/image-policy';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/auditLog';

// ─── L-sec112 IDOR 방어 (2026-04-22 재적용) ────────────────────────
//   DELETE/PATCH /api/admin/listings/:id 는 본인 매물만 변경 가능해야 한다.
//   이전엔 단순 verifyAdminAuth() boolean 만 검사 → agent A 의 토큰으로
//   agent B 매물 전량을 삭제할 수 있는 horizontal privilege escalation.
//   master/crawler_bridge/superadmin 은 기존대로 무제한 허용 (운영 필요).
//   uid 가 있는 경우 listings.created_by 와 일치 확인. created_by 가 null
//   인 레거시 매물은 superadmin 만 건드릴 수 있도록 보수적 처리.
async function authorizeListingMutation(
  request: NextRequest,
  listingId: number,
  supabase: ReturnType<typeof createServerClient>,
): Promise<{ ok: boolean; status?: number; reason?: string; actor?: { email?: string; role?: string; uid?: string } }> {
  const ctx = await verifyAdminAuthWithContext(request);
  if (!ctx.ok) return { ok: false, status: 401, reason: '인증 실패' };

  const actor = { email: ctx.email, role: ctx.role, uid: ctx.uid };

  // 무제한 권한
  if (ctx.role === 'master' || ctx.role === 'crawler_bridge' || ctx.role === 'superadmin') {
    return { ok: true, actor };
  }

  if (!ctx.uid) return { ok: false, status: 403, reason: '권한이 없습니다', actor };

  const { data: owner } = await supabase
    .from('listings')
    .select('created_by')
    .eq('id', listingId)
    .maybeSingle();

  if (!owner) return { ok: false, status: 404, reason: '매물을 찾을 수 없습니다', actor };

  const createdBy = (owner as any).created_by;
  if (!createdBy || createdBy !== ctx.uid) {
    return { ok: false, status: 403, reason: '본인 매물만 변경할 수 있습니다', actor };
  }
  return { ok: true, actor };
}

/**
 * GET /api/admin/listings/[id] - 매물 상세 조회 (이미지 포함)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAuth(request))) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // 매물 기본 정보
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (listingError || !listing) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // 이미지 목록
    const { data: images } = await supabase
      .from('listing_images')
      .select('*')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true });

    // 동영상 목록 — [add 2026-04-20] listing_videos 편집 지원
    const { data: videos } = await supabase
      .from('listing_videos')
      .select('id, url, poster_url, mime_type, file_size, duration_sec, width, height, alt, sort_order, created_at')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true });

    // 특징 목록
    const { data: features } = await supabase
      .from('listing_features')
      .select('feature')
      .eq('listing_id', listingId);

    // ※ 관리자 포털 이미지 정책 (preferSelfHostedImages):
    //   - 자체매물: 그대로
    //   - 혼합(크롤링+자체업로드): 자체업로드만 노출 (46163 봉천동 62-24 케이스)
    //   - 크롤링 전용: 원본 유지 (중개사 편집/참조 UI 에서 빈 갤러리 방지)
    //   모바일 상세에서 gongsilclub/nemoapp CDN 이 핫링크/CORS 로 깨지는 문제는
    //   혼합 매물에서만 발생하므로 이 정책으로 충분히 방어됨.
    const policed = preferSelfHostedImages({
      source_site: (listing as any)?.source_site ?? null,
      listing_images: images || [],
      listing_videos: videos || [],
    });

    return NextResponse.json({
      success: true,
      data: {
        ...listing,
        listing_images: policed.listing_images,
        listing_videos: policed.listing_videos,
        features: features?.map((f: { feature: string }) => f.feature) || [],
      },
    });
  } catch (error) {
    console.error('매물 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 조회에 실패했습니다' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/listings/[id] - 매물 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // H-2 (L-sec124 2026-04-22): 변이 엔드포인트에 IP rate limit 추가.
    //   단일 admin 토큰 유출 시 대량 삭제/수정 자동화 공격의 비용 상승.
    //   10분 60회/IP — 중개사 정상 대량작업은 bulk-delete 로 처리되므로 단건 60 으로 충분.
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `admin-listing-mut:ip:${_ip}`, limit: 60, windowMs: 10 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // L-sec112 IDOR: 인증 + 소유권 검사 (master/superadmin/crawler_bridge 는 bypass)
    const authz = await authorizeListingMutation(request, listingId, supabase);
    if (!authz.ok) {
      audit({
        action: 'listing.delete',
        actor: authz.actor,
        target: { type: 'listing', id: listingId },
        ip: _ip,
        status: authz.status,
        meta: { result: 'denied', reason: authz.reason },
      });
      return NextResponse.json(
        { success: false, error: authz.reason },
        { status: authz.status },
      );
    }

    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', listingId);

    if (error) {
      console.error('매물 삭제 오류:', error);
      return NextResponse.json(
        { success: false, error: '매물 삭제에 실패했습니다' },
        { status: 500 }
      );
    }

    // 캐시 즉시 무효화 — 홈, 매물목록, 지도, 개별 매물 페이지
    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidatePath(`/listings/${listingId}`, 'page');

    audit({
      action: 'listing.delete',
      actor: authz.actor,
      target: { type: 'listing', id: listingId },
      ip: _ip,
      status: 200,
      meta: { result: 'success' },
    });

    return NextResponse.json({
      success: true,
      message: '매물이 삭제되었습니다',
    });
  } catch (error) {
    console.error('매물 삭제 오류:', error);
    return NextResponse.json(
      { success: false, error: '매물 삭제에 실패했습니다' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/listings/[id] - 매물 상태 변경
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // H-2 (L-sec124): 변이 IP rate limit
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `admin-listing-mut:ip:${_ip}`, limit: 60, windowMs: 10 * 60_000 });
    if (!_rl.ok) {
      return NextResponse.json(
        { success: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
      );
    }

    const { id } = await params;
    const listingId = parseInt(id);

    if (isNaN(listingId)) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // L-sec112 IDOR: 인증 + 소유권 검사
    const authz = await authorizeListingMutation(request, listingId, supabase);
    if (!authz.ok) {
      audit({
        action: 'listing.patch',
        actor: authz.actor,
        target: { type: 'listing', id: listingId },
        ip: _ip,
        status: authz.status,
        meta: { result: 'denied', reason: authz.reason },
      });
      return NextResponse.json(
        { success: false, error: authz.reason },
        { status: authz.status },
      );
    }

    const body = await request.json();
    const statusSchema = z.object({
      status: z.enum(['공개', '비공개', '계약중', '계약완료']),
    });

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 상태입니다' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('listings')
      .update({
        status: parsed.data.status,
      })
      .eq('id', listingId)
      .select()
      .single();

    if (error) {
      console.error('매물 상태 변경 오류:', error);
      return NextResponse.json(
        { success: false, error: '상태 변경에 실패했습니다' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: '매물을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // 캐시 즉시 무효화
    revalidatePath('/', 'layout');
    revalidatePath('/listings', 'page');
    revalidatePath('/map', 'page');
    revalidatePath(`/listings/${listingId}`, 'page');

    audit({
      action: 'listing.patch',
      actor: authz.actor,
      target: { type: 'listing', id: listingId },
      ip: _ip,
      status: 200,
      meta: { result: 'success', status: parsed.data.status },
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('매물 상태 변경 오류:', error);
    return NextResponse.json(
      { success: false, error: '상태 변경에 실패했습니다' },
      { status: 500 }
    );
  }
}
