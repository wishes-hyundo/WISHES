import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { titleLeaksAddress } from '@/lib/aiTitleSanitizer';

// ─────────────────────────────────────────────────────────────────────────
// L-crit5-B (2026-04-23): 주소 누출 ai_title 일괄 재생성 엔드포인트.
//
//   문제: L-crit4 이전에 생성된 ai_title 들은 주소/동/도로명/지번/층·호 등이
//     그대로 박제되어 있음. freeze-after-generate 정책상 상세 모달을 열어도
//     자동 재생성되지 않아 사용자에게 계속 노출됨.
//
//   해결: (A) 서버 read 시점 sanitize 는 별도 커밋으로 적용 (즉시 효과).
//         (B) 본 엔드포인트 = DB 백필. admin 이 1회 실행하여 주소 누출
//             레코드를 실제 LLM 호출로 재생성 → DB 영구 정화.
//
//   동작:
//     GET  ?dryRun=1  → 누출 의심 레코드 개수 미리보기 (LLM 호출 0)
//     POST {limit}    → 최대 N건 재생성 (default 20, max 50)
// ─────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const INTERNAL_BEARER = process.env.WISHES_ADMIN_MASTER_PASSWORD || '';
const IS_DEV = process.env.NODE_ENV !== 'production';

type LeakCandidate = {
  id: number;
  ai_title: string | null;
  address: string | null;
  dong: string | null;
  gu: string | null;
  building_name: string | null;
};

async function findLeakingCandidates(max: number): Promise<LeakCandidate[]> {
  // ai_title 이 있는 레코드만 넉넉히 가져온 뒤 titleLeaksAddress 로 필터.
  // DB 단 정규식이 없어서 Node 단 필터링이 가장 정확함.
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select('id, ai_title, address, dong, gu, building_name')
    .not('ai_title', 'is', null)
    .order('ai_generated_at', { ascending: true, nullsFirst: true })
    .limit(Math.min(500, max * 10)); // 넉넉히 가져와서 Node 필터 통과분만 사용
  if (error) throw new Error(error.message);
  if (!data) return [];
  const out: LeakCandidate[] = [];
  for (const row of data as LeakCandidate[]) {
    if (titleLeaksAddress(row.ai_title, {
      address: row.address,
      dong: row.dong,
      gu: row.gu,
      buildingInfo: row.building_name,
    })) {
      out.push(row);
      if (out.length >= max) break;
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit({ key: `regen-titles:ip:${ip}`, limit: 30, windowMs: 15 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    // dryRun 미리보기: 최대 100건 표본만 스캔해서 의심 건수와 샘플 반환.
    const leaking = await findLeakingCandidates(100);
    return NextResponse.json({
      estimated_leaking: leaking.length,
      sample: leaking.slice(0, 10).map(l => ({
        id: l.id,
        title_preview: l.ai_title?.slice(0, 40) || '',
        gu: l.gu, dong: l.dong,
      })),
      note: 'sample 은 최대 10건. estimated_leaking 은 최초 100건 스캔 내 누출 감지 개수 (전체 추정치 아님).',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: IS_DEV ? msg : '조회 실패' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  // LLM 비용 방어 — 5분 5회/IP cap
  const rl = checkRateLimit({ key: `regen-titles-post:ip:${ip}`, limit: 5, windowMs: 5 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const rawLimit = Number(body.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 20;

    const leaking = await findLeakingCandidates(limit);
    if (leaking.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        regenerated: 0,
        failed: 0,
        message: '주소 누출 제목이 감지되지 않았습니다.',
      });
    }

    const baseUrl = new URL(request.url).origin;
    const results: Array<{ id: number; success: boolean; title?: string; error?: string }> = [];

    for (const row of leaking) {
      try {
        // listingId + force:true 로 generate-description 재호출 → DB 업데이트 포함.
        const r = await fetch(`${baseUrl}/api/generate-description`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INTERNAL_BEARER}`,
          },
          body: JSON.stringify({
            listingId: row.id,
            address: row.address,
            dong: row.dong,
            gu: row.gu,
            buildingInfo: row.building_name,
            aiModel: 'haiku',
            force: true,
            regeneratedAt: new Date().toISOString(),
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.success) {
          results.push({ id: row.id, success: true, title: j.title });
        } else {
          results.push({ id: row.id, success: false, error: j.error || `HTTP ${r.status}` });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'error';
        results.push({ id: row.id, success: false, error: msg });
      }
    }

    const ok = results.filter(r => r.success).length;
    return NextResponse.json({
      success: true,
      scanned: leaking.length,
      regenerated: ok,
      failed: results.length - ok,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: IS_DEV ? msg : '처리 실패' }, { status: 500 });
  }
}
