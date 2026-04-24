// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/backfill-maintenance — L-maint-exc (2026-04-24 pm)
//
// 크롤링 매물의 ai_description / description 에서 관리비 포함/별도 항목을
// 정규식으로 추출해 listings.maintenance_includes / maintenance_excludes 에
// UPDATE.  관리자 1회성 작업.
//
// 호출:  POST /api/admin/backfill-maintenance        (default: dry-run)
//        POST /api/admin/backfill-maintenance?commit=1  (실제 UPDATE)
//        POST /api/admin/backfill-maintenance?commit=1&limit=100  (배치 크기)
//
// 패턴 예시:
//   "관리비 포함: 전기, 수도" → includes = ['전기', '수도']
//   "전기 별도 / 가스 별도" → excludes = ['전기', '가스']
//   "인터넷 TV 포함"        → includes = ['인터넷', 'TV']
//   "수도세 본인부담"        → excludes = ['수도']
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminAuthStrict } from '@/lib/adminAuth';

// 관리비 분류 대상 항목 (정규식 앵커).  포함/별도 양방향으로 사용.
const MAINT_ITEMS = [
  { key: '전기', pat: /전기(세|료)?/ },
  { key: '가스', pat: /가스(세|료)?/ },
  { key: '수도', pat: /수도(세|료)?/ },
  { key: '난방', pat: /난방(비|료)?/ },
  { key: '인터넷', pat: /인터넷/ },
  { key: 'TV', pat: /TV|티비|케이블/ },
  { key: '청소', pat: /청소(비|료)?/ },
  { key: '경비', pat: /경비(비|료)?/ },
  { key: '승강기', pat: /승강기|엘리베이터/ },
];

// "포함" 키워드 (우측 토큰) · "별도/본인부담" 키워드
const INC_KEYWORDS = ['포함', '무료', '공용'];
const EXC_KEYWORDS = ['별도', '본인부담', '개별', '미포함', '제외'];

/** 단일 텍스트에서 maintenance_includes / maintenance_excludes 추출.
 *  · 문장을 구두점(./,·/·/\n) 으로 쪼개고, 각 문장에서 항목 pat 매치 + 포함/별도 키워드 검사.
 *  · 같은 항목이 inc/exc 양쪽에 걸리면 가장 마지막 언급 (문장 순서) 을 채택. */
function extractMaintenance(text: string | null): { includes: string[]; excludes: string[] } {
  const inc = new Set<string>();
  const exc = new Set<string>();
  if (!text) return { includes: [], excludes: [] };
  const src = String(text).replace(/\s+/g, ' ');

  // 문장/절 단위 분리
  const sentences = src.split(/[\.\n,·•\/]+/).map((s) => s.trim()).filter(Boolean);

  for (const sent of sentences) {
    // 이 문장이 '포함' 문맥인지 '별도' 문맥인지
    const isInc = INC_KEYWORDS.some((k) => sent.includes(k));
    const isExc = EXC_KEYWORDS.some((k) => sent.includes(k));
    if (!isInc && !isExc) continue;

    for (const item of MAINT_ITEMS) {
      if (!item.pat.test(sent)) continue;
      // 별도 우선 (더 분명한 의사표시), 포함은 있을 때만
      if (isExc) {
        inc.delete(item.key);
        exc.add(item.key);
      } else if (isInc) {
        // 이미 별도로 표시된 항목은 포함으로 덮지 않음
        if (!exc.has(item.key)) inc.add(item.key);
      }
    }
  }

  // "관리비 포함: X, Y, Z" 패턴 별도 처리 — 콜론 뒤 항목 나열
  const colonPat = /관리비\s*(포함|별도|제외)?\s*[:\-]\s*([^\.\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = colonPat.exec(src)) !== null) {
    const bucket = (m[1] === '별도' || m[1] === '제외') ? exc : inc;
    const payload = m[2] || '';
    for (const item of MAINT_ITEMS) {
      if (item.pat.test(payload)) bucket.add(item.key);
    }
  }

  return { includes: Array.from(inc), excludes: Array.from(exc) };
}

interface Row {
  id: number;
  ai_description: string | null;
  description: string | null;
  maintenance_includes: string[] | null;
  maintenance_excludes: string[] | null;
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const commit = searchParams.get('commit') === '1';
  const limit = Math.min(5000, parseInt(searchParams.get('limit') || '1000', 10) || 1000);

  // 관리자 인증
  const auth = await verifyAdminAuthStrict(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.reason || 'unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();

  // 이미 채워진 매물은 스킵 — maintenance_includes OR maintenance_excludes 가 NULL 인 것만 대상.
  const { data, error } = await supabase
    .from('listings')
    .select('id, ai_description, description, maintenance_includes, maintenance_excludes')
    .or('maintenance_includes.is.null,maintenance_excludes.is.null')
    .limit(limit);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  const updates: { id: number; includes: string[] | null; excludes: string[] | null }[] = [];
  const samples: unknown[] = [];

  for (const r of rows) {
    const text = r.ai_description || r.description || '';
    const { includes, excludes } = extractMaintenance(text);

    // 기존 값이 있으면 우선 존중.  재백필 덮어쓰기 방지.
    const nextInc = r.maintenance_includes && r.maintenance_includes.length > 0
      ? r.maintenance_includes
      : (includes.length > 0 ? includes : null);
    const nextExc = r.maintenance_excludes && r.maintenance_excludes.length > 0
      ? r.maintenance_excludes
      : (excludes.length > 0 ? excludes : null);

    // 변경이 있을 때만 update 후보
    const incChanged = JSON.stringify(r.maintenance_includes ?? null) !== JSON.stringify(nextInc);
    const excChanged = JSON.stringify(r.maintenance_excludes ?? null) !== JSON.stringify(nextExc);
    if (!incChanged && !excChanged) continue;

    updates.push({ id: r.id, includes: nextInc, excludes: nextExc });
    if (samples.length < 10) {
      samples.push({ id: r.id, text_snippet: text.slice(0, 120), inc: nextInc, exc: nextExc });
    }
  }

  if (!commit) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      scanned: rows.length,
      would_update: updates.length,
      samples,
      note: 'Pass ?commit=1 to apply UPDATE.',
    });
  }

  // 실제 UPDATE — Supabase 는 bulk update 를 1회 RPC 로 지원하지 않아 배치 loop.
  let ok = 0;
  let fail = 0;
  for (const u of updates) {
    const { error: e2 } = await supabase
      .from('listings')
      .update({ maintenance_includes: u.includes, maintenance_excludes: u.excludes })
      .eq('id', u.id);
    if (e2) fail += 1;
    else ok += 1;
  }

  return NextResponse.json({
    success: true,
    committed: true,
    scanned: rows.length,
    updated: ok,
    failed: fail,
    samples,
  });
}
