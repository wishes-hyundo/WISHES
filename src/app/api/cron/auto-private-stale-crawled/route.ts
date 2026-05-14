// src/app/api/cron/auto-private-stale-crawled/route.ts
// GET /api/cron/auto-private-stale-crawled
// 같은 구 3회 연속 미수집 매물을 자동 비공개 처리
// 생성일: 2026-05-14

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MISS_THRESHOLD = 3;
const MAX_UPDATE_PER_RUN = 1000;
const NEW_LISTING_PROTECT_DAYS = 14;
const CRAWL_SOURCES = ['공실클럽', '온하우스'];
const PAGE_SIZE = 5000;

function extractDistrict(addr: string): string {
  if (!addr) return '';
  // "서울 강남구 ..." / "서울특별시 강남구 ..." / "경기 성남시 분당구 ..."
  const m = addr.match(/^([가-힣]+?)(?:특별시|광역시|특별자치시|특별자치도|도)?\s+([가-힣]+(?:시\s+[가-힣]+구|구|군|시))(?:\s|$)/);
  if (!m) return '';
  const region = m[1];  // "서울", "대구", "경기" 등
  return `${region} ${m[2]}`;
}

export async function GET(request: NextRequest) {
  const _t0 = Date.now();
  try {
    // 인증
    const authHeader = request.headers.get('authorization') || '';
    const cronSecret = process.env.CRON_SECRET;
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isAdmin = !isCron && (await verifyAdminAuth(request));
    if (!isCron && !isAdmin) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const execute = searchParams.get('execute') === '1';

    const supabase = createServerClient();

    // System flag 체크 — 기본 OFF
    const { data: flag } = await supabase
      .from('system_flags')
      .select('value')
      .eq('name', 'auto_private_enabled')
      .single();
    if (flag?.value !== 'true') {
      return NextResponse.json({
        success: true, mode: 'disabled',
        hint: "UPDATE system_flags SET value='true' WHERE name='auto_private_enabled' to enable",
        _ms: Date.now() - _t0,
      });
    }

    // 1) candidates 조회 (페이지네이션)
    const cutoff14d = new Date(Date.now() - NEW_LISTING_PROTECT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const candidates: any[] = [];
    let offset = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from('listings')
        .select('id, source_site, address')
        .eq('status', '공개')
        .or('auto_private_excluded.is.null,auto_private_excluded.eq.false')
        .in('source_site', CRAWL_SOURCES)
        .lt('created_at', cutoff14d)  // 14일 이내 신규 매물 보호
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        return NextResponse.json({ success: false, error: 'select failed: ' + error.message }, { status: 500 });
      }
      if (!chunk || chunk.length === 0) break;
      candidates.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (candidates.length === 0) {
      return NextResponse.json({ success: true, mode: execute ? 'execute' : 'dry_run', candidates_count: 0, marked_private: 0, _ms: Date.now() - _t0 });
    }

    // 2) (district, source) 그룹핑
    type Group = { district: string; source: string; listings: any[] };
    const groups = new Map<string, Group>();
    for (const c of candidates) {
      const district = extractDistrict(c.address);
      if (!district) continue;
      const key = `${district}||${c.source_site}`;
      if (!groups.has(key)) groups.set(key, { district, source: c.source_site, listings: [] });
      groups.get(key)!.listings.push(c);
    }

    // 3) 각 그룹의 최근 MISS_THRESHOLD 개 history 조회
    const toMakePrivate: number[] = [];
    const groupDiagnostics: any[] = [];

    for (const [key, group] of groups) {
      const { data: history } = await supabase
        .from('district_crawl_history')
        .select('id, completed_at, found_ids')
        .eq('district', group.district)
        .eq('source_site', group.source)
        .order('completed_at', { ascending: false })
        .limit(MISS_THRESHOLD);

      const histCount = history?.length || 0;
      if (histCount < MISS_THRESHOLD) {
        groupDiagnostics.push({ key, listings: group.listings.length, history_count: histCount, skipped: true });
        continue;
      }

      const everSeen = new Set<number>();
      for (const h of history!) {
        for (const id of (h.found_ids || [])) everSeen.add(id);
      }

      let groupMarked = 0;
      for (const L of group.listings) {
        if (!everSeen.has(L.id)) {
          toMakePrivate.push(L.id);
          groupMarked++;
        }
      }
      groupDiagnostics.push({ key, listings: group.listings.length, ever_seen: everSeen.size, to_private: groupMarked });
    }

    // 4) Dry-run vs Execute
    if (!execute) {
      return NextResponse.json({
        success: true, mode: 'dry_run',
        candidates_count: candidates.length,
        groups_count: groups.size,
        would_mark_private: toMakePrivate.length,
        sample_ids: toMakePrivate.slice(0, 20),
        groups: groupDiagnostics.slice(0, 50),
        _ms: Date.now() - _t0,
      });
    }

    if (toMakePrivate.length === 0) {
      return NextResponse.json({ success: true, mode: 'execute', marked_private: 0, _ms: Date.now() - _t0 });
    }

    const capped = toMakePrivate.slice(0, MAX_UPDATE_PER_RUN);

    // 5) UPDATE
    const { error: updErr, count: updatedCount } = await supabase
      .from('listings')
      .update({ status: '비공개' }, { count: 'exact' })
      .in('id', capped);

    if (updErr) {
      return NextResponse.json({ success: false, error: 'update failed: ' + updErr.message }, { status: 500 });
    }

    // 6) Audit log
    const logRows = capped.map((id) => ({
      listing_id: id,
      old_status: '공개',
      new_status: '비공개',
      changed_by: 'auto_cron',
      reason: 'missed 3 consecutive crawls',
      metadata: { trigger: 'auto-private-stale-crawled' },
    }));
    await supabase.from('listing_status_change_log').insert(logRows);

    return NextResponse.json({
      success: true, mode: 'execute',
      marked_private: updatedCount || capped.length,
      total_candidates_identified: toMakePrivate.length,
      max_per_run_hit: toMakePrivate.length > MAX_UPDATE_PER_RUN,
      _ms: Date.now() - _t0,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'unknown', _ms: Date.now() - _t0 }, { status: 500 });
  }
}
