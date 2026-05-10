// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: GET, DELETE, PATCH /api/admin/listings/[id]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { verifyAdminAuth as verifyAuth } from '@/lib/adminAuth';
import { authorizeListingMutation } from '@/lib/adminAuthz';
import { preferSelfHostedImages } from '@/lib/image-policy';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { audit } from '@/lib/auditLog';
// L-hub3 (2026-04-22): Zod 공용 스키마 허브 이관.
import { listingIdSchema } from '@/lib/schemas';

// L-search5 (2026-04-24): 상세 조회도 풀 데이터 (listing_images + videos +
//   features) + Supabase getUser cold-start 대기까지 합하면 vercel.json 기본
//   10s 를 넘길 수 있어 간헐적 504. 30s 로 확장.
export const maxDuration = 30;

// ─── L-sec139 (2026-04-23) ─────────────────────────────────────
//   이 파일의 local authorizeListingMutation 을 `@/lib/adminAuthz` shared
//   버전으로 이관. 함수 시그니처 동일(request, listingId, supabase), 결과 타입은
//   discriminated union (AuthzSingleResult). 호출측 사용 패턴 동일.
//   L-sec136 에서 contacts/bulk 엔드포인트들도 이미 shared 버전을 쓰고 있어
//   이걸로 단일화가 끝남. 기존 정책(master/superadmin/crawler_bridge 무제한, agent
//   는 본인 매물만, created_by null 은 unlimited role 만)은 그대로 유지됨.

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

    // L-fix-rate-limit-get (2026-04-28): admin token 유출 시 대량 조회 방어
    const _ip = getClientIp(request);
    const _rl = checkRateLimit({ key: `admin-listing-get:ip:${_ip}`, limit: 300, windowMs: 10 * 60_000 });
    if (!_rl.ok) return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } });

    const { id } = await params;
    // L-hub3: listingIdSchema 로 cap 포함 정수 검증 통일.
    const _idParsed = listingIdSchema.safeParse(id);
    if (!_idParsed.success) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }
    const listingId = _idParsed.data;

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

    // L-perf-fix-7-revert-2026-05-10 (사장님 발견 회귀): Fix 7-3 server side url 변환 disable.
    //   사장님 화면에 listings fetch 30s+ 회귀 → 즉시 revert. policed.listing_images 그대로.

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
    // L-hub3: listingIdSchema 로 cap 포함 정수 검증 통일.
    const _idParsed = listingIdSchema.safeParse(id);
    if (!_idParsed.success) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }
    const listingId = _idParsed.data;

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
    // L-hub3: listingIdSchema 로 cap 포함 정수 검증 통일.
    const _idParsed = listingIdSchema.safeParse(id);
    if (!_idParsed.success) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 매물 ID입니다' },
        { status: 400 }
      );
    }
    const listingId = _idParsed.data;

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
