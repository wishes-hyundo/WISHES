/**
 * PR-R-1 (RFC 0018 Phase 2.A) — V-World 건축물대장 자동 fetch
 *
 * 매일 새벽 3:30 cron — 미fetch 매물 100건 처리.
 * 사장님 도메인 통찰: 아파트/오피스텔/상가/사무실만 (전유부/등록 명확).
 *                      빌라/주택은 도면/실측 필수 → 자동 X.
 *
 * env: VWORLD_API_KEY
 *   - data.go.kr 또는 vworld.kr 무료 발급 (5분)
 *   - Vercel 환경변수 등록 후 자동 시작
 *
 * V-World API:
 *   - 건축물대장 표제부 (getBrTitleInfo) — 위반/사용승인일/주용도/연면적
 *   - 무료 일 1,000건 한도 (사용량 0 → 다음 날 reset)
 *
 * 헌법 §"사용자 UI 부정적 표시 X":
 *   - is_violation_building TRUE → admin 만 표시
 *   - 사용자 UI 영향 0 (별도 PR-R-1-FE 에서 단순 라벨)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VWORLD_KEY = process.env.VWORLD_API_KEY || '';
const BATCH_SIZE = 100;
const VWORLD_ENDPOINT = 'https://api.vworld.kr/ned/data/getBrTitleInfo';

// 사장님 도메인 통찰 — auto-eligible types (전유부/등록 명확한 것만)
const AUTO_ELIGIBLE = new Set(['아파트', '오피스텔', '상가', '사무실']);

interface ListingRow {
  id: number;
  address: string | null;
  type_normalized: string | null;
  jibun: string | null; // 지번 주소 (있는 경우)
}

interface VWorldBuildingResult {
  ok: boolean;
  is_violation: boolean;
  violation_reason: string | null;
  approval_date: string | null;
  purpose: string | null;
  total_floor_area: number | null;
  raw?: unknown;
  error?: string;
}

async function fetchBuildingRegister(jibun: string): Promise<VWorldBuildingResult> {
  if (!jibun) return { ok: false, is_violation: false, violation_reason: null, approval_date: null, purpose: null, total_floor_area: null, error: 'no_jibun' };

  const url = new URL(VWORLD_ENDPOINT);
  url.searchParams.set('key', VWORLD_KEY);
  url.searchParams.set('domain', 'wishes.co.kr');
  url.searchParams.set('format', 'json');
  url.searchParams.set('numOfRows', '1');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('ldCode', jibun.slice(0, 10)); // 법정동 코드 추정

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'WISHES-PR-R1-Bot' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, is_violation: false, violation_reason: null, approval_date: null, purpose: null, total_floor_area: null, error: `vworld_${res.status}` };
    }
    const data = await res.json();
    const item = data?.buldRgstStnd?.field?.[0] || data?.field?.[0] || null;

    if (!item) {
      return { ok: false, is_violation: false, violation_reason: null, approval_date: null, purpose: null, total_floor_area: null, error: 'no_data' };
    }

    // V-World 응답 필드 매핑 (응답 spec 변동 대비 fallback)
    const violationFlag = String(item.vlNoticeYn || item.violation_yn || '').toUpperCase();
    const isViolation = violationFlag === 'Y' || violationFlag === 'TRUE';
    const violationReason = isViolation ? (item.vlNoticeRsnCn || item.violation_reason || '위반건축물') : null;
    const approvalDate = item.useAprDay || item.approval_date || null;
    const purpose = item.mainPurpsCdNm || item.main_purpose || null;
    const totalFloorAreaRaw = item.totArea || item.total_floor_area || null;
    const totalFloorArea = totalFloorAreaRaw ? Number.parseFloat(String(totalFloorAreaRaw)) : null;

    return {
      ok: true,
      is_violation: isViolation,
      violation_reason: violationReason,
      approval_date: approvalDate,
      purpose: purpose,
      total_floor_area: Number.isFinite(totalFloorArea) ? totalFloorArea : null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, is_violation: false, violation_reason: null, approval_date: null, purpose: null, total_floor_area: null, error: `fetch_${msg}` };
  }
}

export async function GET(request: NextRequest) {
  // Vercel cron 인증
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  const isUserSecret = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (cronSecret && !isUserSecret && !isVercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // VWORLD_API_KEY 미설정 시 graceful return
  if (!VWORLD_KEY) {
    return NextResponse.json({
      success: false,
      reason: 'vworld_api_key_missing',
      action: 'data.go.kr 또는 vworld.kr 무료 등록 후 Vercel env VWORLD_API_KEY 추가',
      docs: 'docs/setup/vworld-api-key.md',
    });
  }

  const supabase = createServerClient();

  // 미fetch 매물 조회 (auto-eligible types 만)
  const { data: targets, error } = await supabase
    .from('listings')
    .select('id, address, type_normalized, jibun')
    .eq('status', '공개')
    .in('type_normalized', Array.from(AUTO_ELIGIBLE))
    .is('building_register_fetched_at', null)
    .not('jibun', 'is', null)
    .limit(BATCH_SIZE)
    .returns<ListingRow[]>();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: 'no_pending' });
  }

  let succeeded = 0;
  let failed = 0;
  let violations = 0;

  for (const listing of targets) {
    if (!listing.jibun) {
      // jibun 없으면 fetch 시도 X, fetched_at 만 마킹 (다음 cron 에서 skip)
      await supabase
        .from('listings')
        .update({
          building_register_fetched_at: new Date().toISOString(),
          building_register_source: 'vworld',
        })
        .eq('id', listing.id);
      failed++;
      continue;
    }

    const result = await fetchBuildingRegister(listing.jibun);

    const updatePayload: Record<string, unknown> = {
      building_register_fetched_at: new Date().toISOString(),
      building_register_source: 'vworld',
    };

    if (result.ok) {
      updatePayload.is_violation_building = result.is_violation;
      if (result.violation_reason) updatePayload.violation_reason = result.violation_reason;
      if (result.approval_date) updatePayload.approval_date = result.approval_date;
      if (result.purpose) updatePayload.building_purpose = result.purpose;
      if (result.total_floor_area && result.total_floor_area > 0) {
        updatePayload.total_floor_area = result.total_floor_area;
      }
      if (result.is_violation) violations++;
      succeeded++;
    } else {
      failed++;
    }

    await supabase.from('listings').update(updatePayload).eq('id', listing.id);

    // V-World 무료 한도 보호 — 600ms 간격 (분당 100 req)
    await new Promise((r) => setTimeout(r, 600));
  }

  return NextResponse.json({
    success: true,
    processed: targets.length,
    succeeded,
    failed,
    violations,
    eligible_types: Array.from(AUTO_ELIGIBLE),
  });
}
