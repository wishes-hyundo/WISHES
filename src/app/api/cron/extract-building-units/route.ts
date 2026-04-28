/**
 * /api/cron/extract-building-units (L-bldg-unit, 2026-04-28)
 *
 * 사장님 자동화 우선 정책: address_detail 의 비정형 호실 정보를 Gemini 2.5 Flash 로
 *   building_dong / building_ho 컬럼에 영구 저장. 사장님 손 X.
 *
 * 정규식이 못 잡는 변형 케이스 (B101, A-301, 가동, 1101동, 지층 1호, B102/202 등) 다 처리.
 *
 * 동작:
 *   1. listings WHERE building_unit_extracted_at IS NULL AND address_detail IS NOT NULL
 *      100건 순회
 *   2. 각 매물의 address + address_detail 를 Gemini Flash 로 호실 정보 추출 요청
 *   3. 결과 JSON {dongNm, hoNm} 파싱 → DB 저장
 *   4. 실패해도 extracted_at 만 set (재시도 방지 — 단독/다가구 매물은 영영 NULL)
 *
 * 비용: Gemini 2.5 Flash 일 100K 호출 무료. 100건 × 4회/일 = 400 호출/일 (0.4% of 무료 한도).
 *
 * Schedule: 6h 간격 (vercel.json crons 항목 추가).
 *   12K 매물 backfill ≈ 30일. POST 수동 트리거로 빠른 backfill 가능.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { captureError, captureWarning, addBreadcrumb } from '@/lib/observe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

interface ExtractResult {
  dongNm?: string;
  hoNm?: string;
  source: 'gemini' | 'gemini-empty' | 'no_detail';
}

/**
 * Gemini Flash 로 address + address_detail 에서 동/호 추출.
 * 못 찾으면 빈 문자열 반환 (다가구·단독주택 케이스 자연스럽게 처리).
 */
async function extractUnit(
  address: string,
  addressDetail: string,
): Promise<ExtractResult | null> {
  if (!GEMINI_KEY) return null;
  if (!addressDetail) return { source: 'no_detail' };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
    const prompt = `한국 부동산 주소에서 동(棟) 번호와 호(戶) 번호를 추출해주세요.

[전체 주소]
${address}

[상세 주소]
${addressDetail}

[규칙]
- 동: 단지의 동 번호 (예: "101동", "A동", "가동", "101"). 단일동 건물이면 빈 문자열.
- 호: 호실 번호 (예: "202", "B-101", "1502", "지층 1호" → "B1"). 변형 케이스 모두 정규화.
- 다가구주택/단독주택은 호실이 없을 수 있음 → 빈 문자열.
- "2층 202호" → 호=202 (층 정보 무시).
- "B101호" → 호=B101 (지하 표기 유지).
- 한국어 동 번호 ("가동" → "가", "101동" → "101")는 숫자/한글 그대로.
- 환각 금지. 정보 없으면 빈 문자열.

[출력 JSON 만, 다른 글자 X]
{"dongNm": "동 번호 또는 빈 문자열", "hoNm": "호 번호 또는 빈 문자열"}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 100 },
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;

    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { source: 'gemini-empty' };

    const parsed = JSON.parse(match[0]);
    return {
      dongNm: typeof parsed.dongNm === 'string' ? parsed.dongNm.trim().slice(0, 50) : '',
      hoNm: typeof parsed.hoNm === 'string' ? parsed.hoNm.trim().slice(0, 50) : '',
      source: 'gemini',
    };
  } catch (e) {
    console.warn('[extract-building-units] one failed:', e);
    captureError(e, { route: 'cron/extract-building-units', tags: { phase: 'gemini_fetch' } });
    return null;
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  if (!GEMINI_KEY) {
    return NextResponse.json(
      { success: false, error: 'GEMINI_API_KEY 미설정' },
      { status: 500 },
    );
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: 'Supabase client 없음' },
      { status: 500 },
    );
  }

  // 추출 안 된 매물 100개 (address_detail 있는 것만)
  const { data: targets } = await supabase
    .from('listings')
    .select('id, address, address_detail')
    .is('building_unit_extracted_at', null)
    .not('address_detail', 'is', null)
    .neq('address_detail', '')
    .limit(100);

  let updated = 0;
  let withDong = 0;
  let withHo = 0;
  const samples: Array<{ id: number; dongNm: string; hoNm: string }> = [];

  for (const t of (targets || []) as Array<{
    id: number;
    address: string | null;
    address_detail: string | null;
  }>) {
    const result = await extractUnit(t.address || '', t.address_detail || '');
    // 결과 null = API 호출 자체 실패 → 재시도 위해 extracted_at 안 set
    if (!result) continue;

    const patch: Record<string, unknown> = {
      building_unit_extracted_at: new Date().toISOString(),
    };
    if (result.dongNm) {
      patch.building_dong = result.dongNm;
      withDong++;
    }
    if (result.hoNm) {
      patch.building_ho = result.hoNm;
      withHo++;
    }

    const { error } = await supabase.from('listings').update(patch).eq('id', t.id);
    if (!error) {
      updated++;
      if (samples.length < 5) {
        samples.push({
          id: t.id,
          dongNm: result.dongNm || '',
          hoNm: result.hoNm || '',
        });
      }
    }
  }

  await addBreadcrumb('cron', 'extract-building-units', {
    scanned: targets?.length || 0, updated, with_dong: withDong, with_ho: withHo,
  });

  // 추출 실패율이 50% 넘으면 warning
  const scanned = targets?.length || 0;
  if (scanned >= 10 && updated < scanned * 0.5) {
    await captureWarning(
      `[extract-building-units] 낮은 추출 성공률: ${updated}/${scanned}`,
      { route: 'cron/extract-building-units', tags: { scanned: String(scanned), updated: String(updated) } },
    );
  }

  return NextResponse.json({
    success: true,
    scanned,
    updated,
    with_dong: withDong,
    with_ho: withHo,
    samples,
    ts: new Date().toISOString(),
  });
}

/** POST 도 동일하게 처리 — 사장님 수동 backfill 트리거용 */
export const POST = GET;
