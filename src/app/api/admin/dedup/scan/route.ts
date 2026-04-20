// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin API: POST /api/admin/dedup/scan
//
// 목적: "100% 중복" 후보를 탐지하고 사유와 함께 반환.
// 정책:
//   1) 현재 '공개' 상태만 대상 (이미 중복정리/계약완료 제외)
//   2) 모드:
//      - strict (기본): 소재지(address+address_detail)+거래(deal)+가격(deposit/monthly/price) 정확일치.
//                        address_detail 이 비어있거나 '-' 이면 제외 (동호수 없는 크롤 거짓 매칭 방지)
//      - loose       : 소재지(address만)+거래(deal)+가격 정확일치.
//                        상세주소 없이 훑되 신뢰도 -10 감점 + 면적/층/제목 mismatch 시 가중 감점
//   3) 그룹 내 한 건을 "대표"로 자동 지정 (최신 updated_at + 사진 수 많은 쪽 우선)
//   4) 면적 비교 / 제목 유사도 등 mismatch 시 신뢰도 하향 → 관리자 리뷰 권장 표시
// 반환:
//   groups: [{ group_id, kept: {…}, duplicates: [{…}], reason, confidence, mismatches }]
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { createHash } from 'crypto';

type Row = {
  id: number;
  title: string | null;
  type: string | null;
  deal: string | null;
  deposit: number | null;
  monthly: number | null;
  price: number | null;
  address: string | null;
  address_detail: string | null;
  dong: string | null;
  area_m2: number | null;
  area_supply_m2: number | null;
  floor_current: string | null;
  floor_total: string | null;
  source_site: string | null;
  source_id: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  listing_images?: Array<{ url: string; is_thumbnail?: boolean }>;
};

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/\s+/g, '').trim();
}

function groupKey(r: Row, mode: 'strict' | 'loose' = 'strict'): string | null {
  const addr = norm(r.address);
  if (!addr) return null;
  const deal = norm(r.deal);
  if (!deal) return null;
  const dep = String(r.deposit ?? 0);
  const mon = String(r.monthly ?? 0);
  const pr = String(r.price ?? 0);

  if (mode === 'loose') {
    // 상세주소 없이 address만 기준 (주소·거래·가격 일치면 1차 후보)
    return [addr, '*', deal, dep, mon, pr].join('|');
  }

  // strict: 동·호수까지 정확히 일치해야 함
  const detail = norm(r.address_detail);
  if (!detail) return null;
  if (detail === '-' || detail === '_' || detail === '.' || detail.length < 2) return null;
  return [addr, detail, deal, dep, mon, pr].join('|');
}

function pickKept(a: Row, b: Row): Row {
  // 1) 사진 많은 쪽
  const ai = a.listing_images?.length ?? 0;
  const bi = b.listing_images?.length ?? 0;
  if (ai !== bi) return ai > bi ? a : b;
  // 2) updated_at 최신
  const au = a.updated_at ? new Date(a.updated_at).getTime() : 0;
  const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0;
  if (au !== bu) return au > bu ? a : b;
  // 3) id 큰 쪽(최신 등록)
  return a.id > b.id ? a : b;
}

function similarityTitle(a: string, b: string): number {
  const aa = a.replace(/[\s,\.!@#$%^&*()\-_=+\[\]{}|\\:;"'<>?/~`]/g, '').toLowerCase();
  const bb = b.replace(/[\s,\.!@#$%^&*()\-_=+\[\]{}|\\:;"'<>?/~`]/g, '').toLowerCase();
  if (!aa || !bb) return 0;
  const short = aa.length < bb.length ? aa : bb;
  const long = aa.length < bb.length ? bb : aa;
  let m = 0;
  for (const ch of short) if (long.includes(ch)) m++;
  return Math.round((m / short.length) * 100);
}

function buildReasonAndConfidence(
  kept: Row,
  dup: Row,
  mode: 'strict' | 'loose' = 'strict',
): { reason: string; confidence: number; mismatches: string[] } {
  const mismatches: string[] = [];
  let confidence = 100;

  // loose 모드: 상세주소 없이 판정하므로 기본 -10 감점 (동호수 다를 가능성)
  if (mode === 'loose') {
    confidence -= 10;
    const detailMissing =
      !norm(kept.address_detail) || !norm(dup.address_detail);
    if (detailMissing) mismatches.push(`상세주소 누락 (동·호수 비교 불가)`);
    else if (norm(kept.address_detail) !== norm(dup.address_detail)) {
      mismatches.push(
        `상세주소 다름 (${kept.address_detail} vs ${dup.address_detail})`,
      );
      confidence -= 20;
    }
  }

  // 면적 비교 (허용 오차 0.5m²)
  const ka = kept.area_m2 ?? 0;
  const da = dup.area_m2 ?? 0;
  if (Math.abs(ka - da) > 0.5) {
    mismatches.push(`면적 차이 (${ka}m² vs ${da}m²)`);
    confidence -= 25;
  }

  // 층수 비교
  const kf = norm(kept.floor_current);
  const df = norm(dup.floor_current);
  if (kf && df && kf !== df) {
    mismatches.push(`층수 차이 (${kf} vs ${df})`);
    confidence -= 20;
  }

  // 유형 비교
  if (norm(kept.type) !== norm(dup.type)) {
    mismatches.push(`유형 차이 (${kept.type} vs ${dup.type})`);
    confidence -= 15;
  }

  // 제목 유사도
  const sim = similarityTitle(kept.title || '', dup.title || '');
  if (sim < 50) {
    mismatches.push(`제목 유사도 낮음 (${sim}%)`);
    confidence -= 15;
  }

  // 출처 비교 (같은 크롤 출처+같은 source_id → 사실상 동일 건)
  const ks = norm(kept.source_site);
  const ds = norm(dup.source_site);
  const sourceSame = !!ks && ks === ds && !!kept.source_id && kept.source_id === dup.source_id;
  if (sourceSame) confidence = Math.min(100, confidence + 10); // 같은 출처·ID면 강력한 증거

  const parts: string[] = [];
  if (mode === 'loose') {
    parts.push(`동일 주소 (${kept.address})`);
    parts.push(`※ 상세주소 미비교 (느슨 모드)`);
  } else {
    parts.push(`동일 소재지 (${kept.address} ${kept.address_detail})`);
  }
  parts.push(`동일 거래유형 (${kept.deal})`);
  parts.push(`동일 가격 (보증금 ${kept.deposit ?? 0}/월세 ${kept.monthly ?? 0}${kept.price ? `/매매 ${kept.price}` : ''})`);
  if (Math.abs(ka - da) <= 0.5) parts.push(`면적 일치 (${ka}m²)`);
  if (kf && df && kf === df) parts.push(`층수 일치 (${kf})`);
  if (sim >= 80) parts.push(`제목 유사 (${sim}%)`);
  if (sourceSame) parts.push(`동일 출처·ID (${ks}/${kept.source_id})`);

  const reason = parts.join(' · ');
  confidence = Math.max(0, Math.min(100, confidence));
  return { reason, confidence, mismatches };
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as any));
    const minConfidence = typeof body.minConfidence === 'number' ? body.minConfidence : 80;
    const limitGroups = typeof body.limit === 'number' ? Math.min(body.limit, 500) : 200;
    const mode: 'strict' | 'loose' = body.mode === 'loose' ? 'loose' : 'strict';

    const supabase = createServerClient();

    // 공개 상태만 조회 (이미 숨김/계약완료/중복정리 제외)
    const { data, error } = await supabase
      .from('listings')
      .select(`
        id, title, type, deal, deposit, monthly, price,
        address, address_detail, dong,
        area_m2, area_supply_m2, floor_current, floor_total,
        source_site, source_id, status,
        created_at, updated_at,
        listing_images(url, is_thumbnail)
      `)
      .eq('status', '공개')
      .order('id', { ascending: true })
      .limit(20000);

    if (error) {
      console.error('dedup scan query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows = (data || []) as unknown as Row[];

    // 그룹화
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = groupKey(r, mode);
      if (!k) continue;
      const arr = groups.get(k) || [];
      arr.push(r);
      groups.set(k, arr);
    }

    // 중복 그룹만 필터 + 대표 선출 + 사유 생성
    const result: Array<{
      group_id: string;
      kept: any;
      duplicates: Array<any>;
      reason: string;
      confidence: number;
      mismatches: string[];
    }> = [];

    for (const [k, arr] of groups) {
      if (arr.length < 2) continue;

      // 대표 1건 선출
      let kept = arr[0];
      for (let i = 1; i < arr.length; i++) kept = pickKept(kept, arr[i]);
      const dups = arr.filter((x) => x.id !== kept.id);

      // 그룹 전체 신뢰도 = dup 중 최저 confidence
      let groupReason = '';
      let groupConf = 100;
      const groupMismatches: string[] = [];
      const dupSummaries: any[] = [];

      for (const d of dups) {
        const { reason, confidence, mismatches } = buildReasonAndConfidence(kept, d, mode);
        if (!groupReason) groupReason = reason;
        groupConf = Math.min(groupConf, confidence);
        mismatches.forEach((m) => {
          if (!groupMismatches.includes(m)) groupMismatches.push(m);
        });
        dupSummaries.push({
          id: d.id,
          title: d.title,
          type: d.type,
          address: d.address,
          address_detail: d.address_detail,
          area_m2: d.area_m2,
          floor_current: d.floor_current,
          deposit: d.deposit,
          monthly: d.monthly,
          price: d.price,
          source_site: d.source_site,
          source_id: d.source_id,
          created_at: d.created_at,
          updated_at: d.updated_at,
          image_count: d.listing_images?.length ?? 0,
          thumbnail: d.listing_images?.[0]?.url ?? null,
          confidence,
          mismatches,
        });
      }

      if (groupConf < minConfidence) continue;

      const group_id = createHash('md5').update(k).digest('hex').slice(0, 12);

      result.push({
        group_id,
        kept: {
          id: kept.id,
          title: kept.title,
          type: kept.type,
          address: kept.address,
          address_detail: kept.address_detail,
          area_m2: kept.area_m2,
          floor_current: kept.floor_current,
          deposit: kept.deposit,
          monthly: kept.monthly,
          price: kept.price,
          source_site: kept.source_site,
          source_id: kept.source_id,
          created_at: kept.created_at,
          updated_at: kept.updated_at,
          image_count: kept.listing_images?.length ?? 0,
          thumbnail: kept.listing_images?.[0]?.url ?? null,
        },
        duplicates: dupSummaries,
        reason: groupReason,
        confidence: groupConf,
        mismatches: groupMismatches,
      });
    }

    // 신뢰도 내림차순 정렬
    result.sort((a, b) => b.confidence - a.confidence);

    return NextResponse.json({
      success: true,
      mode,
      total_listings: rows.length,
      total_groups: result.length,
      total_duplicates: result.reduce((s, g) => s + g.duplicates.length, 0),
      groups: result.slice(0, limitGroups),
      min_confidence: minConfidence,
      scanned_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('dedup scan error:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
