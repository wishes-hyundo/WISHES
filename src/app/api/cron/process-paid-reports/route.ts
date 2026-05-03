/**
 * /api/cron/process-paid-reports — 결제 완료 → 등기부 발급 → 권리분석 자동 실행
 *
 * PR-R-3-B (RFC 0018 Phase 2.B+C wiring).
 *
 * 흐름:
 *   1) status='paid' 보고서 최대 BATCH 개 픽업
 *   2) 각각:
 *      a) status='fetching' 으로 락
 *      b) listings 에서 주소·type·가격 조회
 *      c) codef-client.fetchRegistry() 호출
 *      d) 성공: registry_raw INSERT + analyzeRights() 결과를 reports 에 저장 → status='analyzed'
 *      e) 실패 (env 미설정 등): 'paid' 로 복구하고 로그만 남김 (다음 cron 에서 재시도)
 *
 * 자동화 헌법 준수:
 *   - 사장님 손 0 (env 등록만 하면 자동 동작 시작)
 *   - 정기 cron 으로 검토 페이지 없이 자동 진행
 *   - 'analyzed' 상태에서 사장님 (admin) 검토 → 'reviewed' → 'delivered' 는
 *     별도 admin UI / cron (PR-R-3-C) 에서 처리
 *
 * graceful degradation:
 *   - CODEF 환경변수 미설정 → 'paid' 유지, 다음 cron 에서 재시도. 사용자에게는 영향 X.
 *   - listing 삭제됨 → 'failed' 처리 + failed_reason 기록.
 *
 * 보안:
 *   - Vercel Cron 은 Bearer CRON_SECRET 헤더 필수
 *   - 일반 GET 호출도 같은 검증 (수동 트리거 시)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { fetchRegistry, isCodefEnabled, type CodefRegistryRequest } from '@/lib/codef-client';
import { analyzeRights } from '@/lib/rights-analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH = 5;

/**
 * listing.type → CODEF property_type 매핑.
 * listing-rag inferTargetSegment 의 타입 분류와 일관.
 */
function mapPropertyType(
  listingType: string,
): CodefRegistryRequest['property_type'] {
  const t = String(listingType || '').trim();
  if (t.includes('아파트') || t.includes('주상복합')) return 'apt';
  if (t.includes('오피스텔')) return 'officetel';
  if (t === '토지') return 'land';
  if (t === '상가' || t === '사무실' || t === '지식산업센터' || t === '건물') return 'building';
  return 'house';
}

/**
 * 권리분석에 사용할 매물 가격 (원).
 *   매매 → price
 *   전세 → deposit
 *   월세 → deposit + monthly × 100 (깡통전세 평가 보수치)
 */
function effectivePrice(listing: {
  price?: number | null;
  deposit?: number | null;
  monthly?: number | null;
  deal?: string | null;
}): number {
  const deal = String(listing.deal || '').trim();
  if (deal === '매매' && listing.price) return Number(listing.price);
  if (deal === '전세') return Number(listing.deposit || 0);
  // 월세 / 단기 / 미지정 — deposit + monthly × 100 보수 평가
  const dep = Number(listing.deposit || 0);
  const mon = Number(listing.monthly || 0);
  return dep + mon * 100;
}

interface PaidReport {
  id: number;
  user_email: string | null;
  listing_id: number | null;
}

interface ProcessSummary {
  picked: number;
  analyzed: number;
  skipped: number;
  failed: number;
  errors: Array<{ report_id: number; reason: string }>;
}

export async function GET(request: NextRequest) {
  // CRON 인증 (Vercel cron 자동 헤더 또는 수동 트리거)
  // G-73 (2026-05-03): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 무인증 통과)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = (request.headers.get('authorization') || '');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary: ProcessSummary = { picked: 0, analyzed: 0, skipped: 0, failed: 0, errors: [] };

  // CODEF 미설정 시 즉시 no-op (정상 동작 — 다음 cron 에서 재시도)
  if (!isCodefEnabled()) {
    return NextResponse.json({
      success: true,
      no_op: true,
      reason: 'CODEF 환경변수 미설정 — env 등록 후 자동 활성화',
      summary,
    });
  }

  const supabase = createServerClient();

  // 1) 결제 완료된 paid 보고서 픽업 (오래된 것 우선)
  const { data: paid, error: pickErr } = await supabase
    .from('reports')
    .select('id, user_email, listing_id')
    .eq('status', 'paid')
    .order('created_at', { ascending: true })
    .limit(BATCH);

  if (pickErr) {
    return NextResponse.json(
      { success: false, error: 'pick_failed', detail: pickErr.message, summary },
      { status: 500 },
    );
  }

  const reports: PaidReport[] = paid || [];
  summary.picked = reports.length;

  for (const r of reports) {
    try {
      // 2-a) lock: status='fetching' (compare-and-swap, .select() 으로 실제 갱신 확인)
      // L-audit-2026-05-02: UPDATE 만 호출하면 0 rows 매칭도 error=null 반환 →
      //   다른 워커가 이미 픽업한 row 도 통과해 CODEF 중복 호출 / 결과 덮어쓰기 가능.
      //   .select('id') 로 실제 갱신된 row 를 확인해 race 차단.
      const { data: lockedRows, error: lockErr } = await supabase
        .from('reports')
        .update({ status: 'fetching' })
        .eq('id', r.id)
        .eq('status', 'paid')
        .select('id');
      if (lockErr || !lockedRows || lockedRows.length === 0) {
        // 다른 워커가 먼저 가져갔거나 사장님 수동 변경 — skip
        summary.skipped += 1;
        continue;
      }

      if (!r.listing_id) {
        await supabase
          .from('reports')
          .update({ status: 'failed', failed_reason: 'listing_id_null' })
          .eq('id', r.id)
          .eq('status', 'fetching');
        summary.failed += 1;
        summary.errors.push({ report_id: r.id, reason: 'listing_id_null' });
        continue;
      }

      // 2-b) listing 조회
      const { data: listing, error: listingErr } = await supabase
        .from('listings')
        .select('id, address, type, deal, deposit, monthly, price')
        .eq('id', r.listing_id)
        .maybeSingle();

      if (listingErr || !listing) {
        await supabase
          .from('reports')
          .update({
            status: 'failed',
            failed_reason: listingErr?.message || 'listing_not_found',
          })
          .eq('id', r.id)
          .eq('status', 'fetching');
        summary.failed += 1;
        summary.errors.push({
          report_id: r.id,
          reason: listingErr?.message || 'listing_not_found',
        });
        continue;
      }

      const address = String(listing.address || '').trim();
      if (!address) {
        await supabase
          .from('reports')
          .update({ status: 'failed', failed_reason: 'listing_address_empty' })
          .eq('id', r.id)
          .eq('status', 'fetching');
        summary.failed += 1;
        summary.errors.push({ report_id: r.id, reason: 'listing_address_empty' });
        continue;
      }

      // 2-c) CODEF 호출
      const codefResp = await fetchRegistry({
        property_address: address,
        property_type: mapPropertyType(String(listing.type || '')),
        user_consent: true, // 결제 시 동의 흐름 (PR-R-3-A) 에서 받음
      });

      if (!codefResp.ok || !codefResp.parsed) {
        // env 미설정 / API 일시 오류 — paid 로 복구해 다음 cron 재시도
        // L-audit-2026-05-02: .eq('status','fetching') 추가 — admin 수동 변경 (failed/refunded
        //   등) 을 cron 이 덮어쓰는 것 방지.
        await supabase
          .from('reports')
          .update({ status: 'paid' })
          .eq('id', r.id)
          .eq('status', 'fetching');
        summary.skipped += 1;
        summary.errors.push({
          report_id: r.id,
          reason: codefResp.error || codefResp.reason || 'codef_unknown',
        });
        continue;
      }

      // 2-d) registry_raw INSERT
      const parsed = codefResp.parsed;
      const { error: rawErr } = await supabase.from('registry_raw').insert({
        report_id: r.id,
        property_address: parsed.property_address,
        property_area_m2: parsed.property_area_m2,
        property_purpose: parsed.property_purpose,
        property_structure: parsed.property_structure,
        ownership_history: parsed.ownership_history,
        current_owner: parsed.current_owner,
        liens: parsed.liens,
        pdf_path: codefResp.raw_pdf_url || null,
      });
      if (rawErr) {
        // raw 저장 실패 — 분석은 가능하지만 보존성 위해 실패 처리
        await supabase
          .from('reports')
          .update({
            status: 'failed',
            failed_reason: `registry_raw_insert_failed: ${rawErr.message}`,
          })
          .eq('id', r.id)
          .eq('status', 'fetching');
        summary.failed += 1;
        summary.errors.push({ report_id: r.id, reason: rawErr.message });
        continue;
      }

      // 2-e) analyzeRights → reports 에 결과 저장
      const analysis = analyzeRights(parsed, effectivePrice(listing));

      const { error: updErr } = await supabase
        .from('reports')
        .update({
          status: 'analyzed',
          risk_level: analysis.level,
          risk_reasons: analysis.reasons,
        })
        .eq('id', r.id)
        .eq('status', 'fetching');

      if (updErr) {
        summary.failed += 1;
        summary.errors.push({ report_id: r.id, reason: updErr.message });
        continue;
      }

      summary.analyzed += 1;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // 예상치 못한 오류 — paid 로 복구하여 다음 cron 재시도
      await supabase.from('reports').update({ status: 'paid' }).eq('id', r.id).eq('status', 'fetching');
      summary.skipped += 1;
      summary.errors.push({ report_id: r.id, reason: `unexpected: ${msg}` });
    }
  }

  return NextResponse.json({
    success: true,
    summary,
    next_cron_in_minutes: 5,
  });
}
