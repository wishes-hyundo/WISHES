/**
 * /api/cron/ad-law-audit (Tier 4 Phase 2 Step 5, 2026-04-28)
 *
 * 사장님 법적 책임 자동 보호:
 *   매물 등록 후 background 에서 Gemini Flash 가 광고법 §18·§20·§25 자동 점검.
 *   위반 발견 시 sentry warning + ad_law_violations 테이블 기록.
 *
 * 비용 0원: Gemini 2.5 Flash 일 100K 무료. 매물 1건당 1 호출.
 *
 * 실행: 6시간 간격, 최근 24h 신규/수정 매물 50건 audit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { captureWarning, addBreadcrumb } from '@/lib/observe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

interface AdLawCheck {
  violations: Array<{
    article: string;  // §18 / §20 / §25 등
    severity: 'low' | 'medium' | 'high';
    issue: string;    // 구체적 위반 내용
    suggestion: string; // 수정 제안
  }>;
  overall: 'pass' | 'warning' | 'violation';
  summary: string;
}

async function auditListing(listing: any): Promise<AdLawCheck | null> {
  if (!GEMINI_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
    const facts = JSON.stringify({
      title: listing.title,
      description: listing.description,
      type: listing.type,
      deal: listing.deal,
      area_m2: listing.area_m2,
      area_supply_m2: listing.area_supply_m2,
      illegal_building: listing.illegal_building,
      address: listing.address,
      deposit: listing.deposit,
      monthly: listing.monthly,
      price: listing.price,
    });

    const prompt = `한국 공인중개사법 광고법 검증. 다음 매물 정보가 §18(전용·공급면적 표시 의무), §20(허위·과장 광고 금지), §25(위반건축물 고지 의무) 위반인지 점검.

[매물 정보]
${facts}

[규칙]
- §18: area_m2 (전용) AND area_supply_m2 (공급) 둘 다 있어야 함. 한쪽 NULL = 위반 (low).
- §18: 두 면적이 같으면 (전용=공급) 데이터 의심. 사장님 입력 오류 가능성. (low)
- §20: title/description 에 "최저가", "100% 보장", "특가" 등 과장 광고 → 위반 (high).
- §20: description 에 "임차인 절대 만족", "환상의 매물" 등 주관적 절대표현 → 위반 (medium).
- §25: illegal_building === true 면 description 에 "위반건축물" 고지 명시 필수. 누락 시 위반 (high).
- §25: illegal_building === null 도 (오피스텔/아파트가 아닌 경우) 확인 필요 → low.

[출력 JSON 만, 다른 글자 X]
{
  "violations": [{"article": "§XX", "severity": "low|medium|high", "issue": "...", "suggestion": "..."}],
  "overall": "pass|warning|violation",
  "summary": "한 줄 요약"
}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
    };

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(tid));
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as AdLawCheck;
  } catch (e) {
    console.warn('[ad-law-audit] failed', e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  // G-73 (2026-05-03): fail-safe — CRON_SECRET 미설정이면 500 (이전엔 무인증 통과)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = (request.headers.get('authorization') || '');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!GEMINI_KEY) {
    return NextResponse.json({ success: false, error: 'GEMINI_KEY missing' }, { status: 500 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'No supabase' }, { status: 500 });
  }

  // 최근 24h 신규/수정 매물 50개
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: targets } = await supabase
    .from('listings')
    .select('id, title, description, type, deal, area_m2, area_supply_m2, illegal_building, address, deposit, monthly, price')
    .gt('updated_at', since)
    .eq('status', '공개')
    .limit(50);

  let checked = 0;
  let violations = 0;
  let warnings = 0;
  const sample: Array<{ id: number; overall: string; summary: string; count: number }> = [];

  for (const lst of (targets || []) as any[]) {
    const result = await auditListing(lst);
    if (!result) continue;
    checked++;
    if (result.overall === 'violation') violations++;
    else if (result.overall === 'warning') warnings++;

    if (sample.length < 5) {
      sample.push({
        id: lst.id,
        overall: result.overall,
        summary: result.summary,
        count: result.violations.length,
      });
    }

    // 위반 발견 시 audit log + sentry
    if (result.overall !== 'pass') {
      await captureWarning(
        `[ad-law] ${result.overall} #${lst.id}: ${result.summary}`,
        {
          route: 'cron/ad-law-audit',
          tags: { id: String(lst.id), overall: result.overall },
          extra: { violations: result.violations },
        },
      );
    }
  }

  await addBreadcrumb('cron', 'ad-law-audit', {
    candidates: targets?.length || 0,
    checked,
    violations,
    warnings,
  });

  return NextResponse.json({
    success: true,
    candidates: targets?.length || 0,
    checked,
    violations,
    warnings,
    sample,
    ts: new Date().toISOString(),
  });
}

export const POST = GET;
