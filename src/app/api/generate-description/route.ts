import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAuth } from '@/lib/adminAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// L-sec3 (2026-04-22): 박제 ADMIN_TOKEN fallback 'wishes2026' 제거 → verifyAdminAuth
//   자가호출용 bearer 는 WISHES_ADMIN_MASTER_PASSWORD 사용
const INTERNAL_BEARER = process.env.WISHES_ADMIN_MASTER_PASSWORD || '';

// L-sec40 (2026-04-22): AI 응답 raw + Anthropic 에러 상세 프로덕션에서 숨김.
//   admin 게이트가 있어도 회귀성 정보 유출 방어 (defense-in-depth).
const IS_DEV = process.env.NODE_ENV !== 'production';
function devDetail<T>(detail: T): T | undefined {
  return IS_DEV ? detail : undefined;
}

export async function POST(request: NextRequest) {
  // L-sec77 (2026-04-22): admin 토큰 leak 대비. Claude Opus/Haiku 호출 비용 보호.
  //   15분 30회/IP cap (정상 admin 작업은 섬 경우 몇 개).
  const _ip = getClientIp(request);
  const _rl = checkRateLimit({ key: `gen-desc:ip:${_ip}`, limit: 30, windowMs: 15 * 60_000 });
  if (!_rl.ok) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다.' },
      { status: 429, headers: { 'Retry-After': String(_rl.retryAfterSec) } },
    );
  }

  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      listingId, address, dong, gu, type, deal,
      deposit, monthly, price, area_m2,
      floor_current, floor_total, direction,
      rooms, bathrooms, features, parking_available,
      buildingInfo, aiModel,
      // L-crit4a (2026-04-23): freeze-after-generate + 현 시점 트렌드 컨텍스트
      force,           // true 면 기존 ai_title 이 있어도 강제 재생성
      regeneratedAt,   // 재생성 버튼 클릭 시각 (프롬프트에 주입 → 트렌드 앵커)
    } = body;

    // v2.6.4 hotfix: 삼항연산자의 truthy 분기가 누락되어 있던 문법 에러 복구.
    const model = aiModel === 'opus'
      ? 'claude-opus-4-6'
      : 'claude-haiku-4-5-20251001';

    // ─────────────────────────────────────────────────────────────────────
    // L-crit4a (2026-04-23): freeze-after-generate — 비용 절감 게이트
    //
    // 사용자 규칙:
    //   "매번 상세보기 열면 그떄마다 재생성 되게는 하지 말고
    //    한번 생성하면 고정시키고 재생성을 눌렀을때만 재생성을 해야돼
    //    비용이 절약될수 있게"
    //
    // 구현: listingId 가 주어졌고, DB 에 ai_title 이 이미 있으며, force 가
    //   아니면 DB 값을 그대로 반환 — Anthropic 호출 0 회.
    // ─────────────────────────────────────────────────────────────────────
    if (listingId && !force) {
      try {
        const { data: existing } = await supabaseAdmin
          .from('listings')
          .select('ai_title, ai_description, seo_keywords, seo_tags, seo_meta_description, ai_generated_at')
          .eq('id', listingId)
          .maybeSingle();
        if (existing && existing.ai_title && existing.ai_description) {
          return NextResponse.json({
            success: true,
            cached: true,
            frozen: true,
            title: existing.ai_title,
            description: existing.ai_description,
            keywords: existing.seo_keywords,
            tags: existing.seo_tags,
            meta_description: existing.seo_meta_description,
            ai_generated_at: existing.ai_generated_at,
            model: null,
          });
        }
      } catch { /* DB 실패 시 즉시 생성 경로로 진행 */ }
    }

    // 주소 힌트 (LLM 에 전달되긴 하지만 제목에는 절대 못 들어감 — 아래 [절대 규칙] 참조).
    const dongName = dong || '';
    const guName = gu || '';
    const addrHint = [guName, dongName].filter(Boolean).join(' ') || (address || '');

    const listingInfo = [
      addrHint ? `- 소재지(참고용, 제목 금지): ${addrHint}` : '',
      `- 유형: ${type || ''}`,
      `- 거래: ${deal || ''}`,
      area_m2 ? `- 전용면적: ${area_m2}m2` : '',
      floor_current ? `- 층수: ${floor_current}/${floor_total || '?'}층` : '',
      direction ? `- 향: ${direction}` : '',
      rooms ? `- 방/욕실: ${rooms}방/${bathrooms || 1}욕실` : '',
      features ? `- 옵션: ${features}` : '',
      parking_available ? '- 주차: 가능' : '',
      buildingInfo ? `- 건물정보: ${buildingInfo}` : '',
    ].filter(Boolean).join('\n');

    // 현 시점 컨텍스트 — LLM 이 '매일매일 현 시점 트렌드' 에 맞춰 제목/카피를 바꿀 수 있도록.
    const now = (() => {
      try { return new Date(regeneratedAt || Date.now()); } catch { return new Date(); }
    })();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const wk = ['일','월','화','수','목','금','토'][now.getDay()];
    const mn = Number(mm);
    const monthLabel = (mn >= 3 && mn <= 5) ? '봄 이사철'
      : (mn >= 6 && mn <= 8) ? '여름 장마·휴가철'
      : (mn >= 9 && mn <= 11) ? '가을 이사철'
      : '겨울 비수기';
    const todayLabel = `${yyyy}-${mm}-${dd} (${wk}) · ${monthLabel}`;

    const prompt = `당신은 서울·경기 지역 10년차 부동산 마케팅 카피라이터입니다.
오늘은 ${todayLabel} 기준입니다. 이 시점의 라이프스타일·임대수요·트렌드를 반영해
매물 제목과 상세설명을 작성하세요.

[매물 정보]
${listingInfo}

[절대 규칙 — 위반 시 응답 거부]
1. 금액(보증금/월세/매매가)을 제목·설명에 절대 포함하지 마세요
2. 면적·평수를 설명에 포함하지 마세요 (이미 상세 스펙에 표기됨)
3. 제목에 **주소 · 시/구/동/읍/면 · 도로명 · 지번 · 건물명 · 단지명**
   을 절대 포함하지 마세요. "신림동 2호선 도보3분" 같은 '동명+스펙' 템플릿
   매우 금지. 이 규칙을 어기면 재작성해야 합니다.
4. "최고", "완벽", "꿈의", "국내 최대", "업계 1위" 같은 검증 불가 과장 금지
5. 확인 안 된 편의시설·역명·소요시간을 지어내지 마세요. 매물 정보에 없는
   숫자(역 도보분·거리·층수 등)는 추정이면 "추정", "예상" 을 명시.
6. 같은 유형 매물끼리 제목 패턴이 반복되지 않도록 매번 다른 어투·리듬을
   사용. 템플릿 헤더(예: "OO동 ...") 재사용 금지.

[제목 작성 규칙]
- 18~30자
- 해당 매물 '라이프스타일·가치 제안' 중심. 예시 방향성(단, 그대로 복붙 금지):
  · 감성형: "햇살 가득한 남향, 혼자만의 리셋 공간"
  · 실용형: "출퇴근·편의·보안, 3박자 갖춘 원룸"
  · 트렌드형: "${yyyy}년 ${mn}월, 지금 입주 가능한 투자형 오피스텔"
  · 타겟형: "워크·리모트 프리 재택러를 위한 넓은 투룸"
- 위 예시를 복붙하지 말고 '매물 속성 + 오늘의 트렌드' 를 조합해 매번 새로 짜세요.
- 이모지는 쓰지 마세요.

[상세설명 작성 규칙 - 400~600자]
사실에 기반한 신뢰성 있는 문장만. 다음 구조 유지:
1. 한줄평: 이 매물의 핵심 가치를 한 문장으로
2. 입지: 가장 가까운 지하철역 '이름만 확신이 있을 때' 기재, 소요분은
   "도보 약 N분 추정" 처럼 추정임을 표시. 확신 없으면 역명 생략하고
   "대중교통 이용 환경" 수준으로만 서술.
3. 생활권: 반경 500m 일반적 편의(마트·카페·병원 등) — 특정 상호명 금지
4. 매물 강점 3가지: 매물 정보에서 확인 가능한 속성만 근거로
5. 추천 고객: 매물 스펙이 실제로 부합하는 고객층

[금지 문구]
- "역세권 확실", "바로 앞 OO역" (구체 역명 확신 없이 금지)
- "도보 3분" 같이 숫자로 단정 (확인 안 된 경우 "추정" 붙이기)
- "서울 최고", "강남 제일" 등 비교급 단정

[SEO 키워드] 10~15개, 배열.
[SEO 태그] 10~15개 해시태그, 배열.
[메타 설명] 160자 이내.

반드시 아래 JSON 형식으로만 응답:
{
  "title": "...",
  "description": "...",
  "keywords": [...],
  "tags": [...],
  "meta_description": "..."
}`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    // L-sec40: Anthropic API 30초 타임아웃 — admin UI 가 무한 대기하지 않도록.
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      return NextResponse.json({ error: 'AI API failed', details: devDetail(err) }, { status: 500 });
    }

    const aiData = await response.json();
    const aiText = aiData.content?.[0]?.text || '';

    let parsed: any = null;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: devDetail(aiText) }, { status: 500 });
    }

    // ─────────────────────────────────────────────────────────────────────
    // L-crit4a (2026-04-23): 제목 주소-누출 방어 sanitizer.
    //   프롬프트 규칙을 LLM 이 어겼을 때를 대비한 2차 방어선.
    //   주소 후보(구/동/도로명/지번/building_name) 가 제목에 포함되어 있으면
    //   해당 토큰을 제거하고 공백 정리.
    // ─────────────────────────────────────────────────────────────────────
    function sanitizeTitle(raw: string): string {
      if (!raw) return raw;
      let t = String(raw).trim();
      const banned = [
        guName, dongName,
        typeof address === 'string' ? address : '',
        typeof buildingInfo === 'string' ? buildingInfo : '',
      ]
        .map(s => String(s || '').trim())
        .filter(s => s.length >= 2);
      for (const b of banned) {
        const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        t = t.replace(new RegExp(esc, 'g'), '').trim();
      }
      // 구/동/읍/면 접미어 한글 토큰 스크럽
      t = t.replace(/[\uAC00-\uD7A3A-Za-z0-9]{1,8}(?:동|읍|면|구)\b/g, '').trim();
      // 도로명 흔한 접미어 스크럽
      t = t.replace(/[\uAC00-\uD7A3]{2,10}(?:로|길)\s?\d*/g, '').trim();
      t = t.replace(/\s+·\s+/g, ' · ').replace(/·\s*·/g, '·').replace(/\s{2,}/g, ' ').trim();
      t = t.replace(/^[·\-\s,]+|[·\-\s,]+$/g, '').trim();
      return t || (parsed.title || '');
    }

    const safeTitle = sanitizeTitle(parsed.title);
    const nowIso = new Date().toISOString();

    // If listingId provided, update the listing in DB
    if (listingId) {
      const updateData: Record<string, unknown> = {
        ai_title: safeTitle,
        ai_description: parsed.description,
        seo_keywords: parsed.keywords,
        seo_tags: parsed.tags,
        seo_meta_description: parsed.meta_description,
        ai_generated_at: nowIso,
      };

      await supabaseAdmin
        .from('listings')
        .update(updateData)
        .eq('id', listingId);
    }

    return NextResponse.json({
      success: true,
      cached: false,
      frozen: false,
      title: safeTitle,
      description: parsed.description,
      keywords: parsed.keywords,
      tags: parsed.tags,
      meta_description: parsed.meta_description,
      ai_generated_at: nowIso,
      model,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: IS_DEV ? message : '요청 처리 실패' }, { status: 500 });
  }
}

// Batch endpoint: generate descriptions for listings without AI content
export async function PUT(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    // L-sec40: limit 상한 (batch AI 호출 비용 폭증 방지)
    const rawLimit = Number(body.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 10;

    // Find listings without AI description
    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      .select('id, address, dong, gu, type, deal, deposit, monthly, price, area_m2, floor_current, floor_total, direction, rooms, bathrooms, features, parking, building_name')
      .is('ai_description', null)
      .eq('status', '공개')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: IS_DEV ? error.message : 'DB 조회 실패' }, { status: 500 });
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json({ message: 'No listings need AI description', processed: 0 });
    }

    const results: Array<{ id: number; success: boolean; title?: string }> = [];

    for (const listing of listings) {
      try {
        const internalResp = await fetch(new URL('/api/generate-description', request.url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INTERNAL_BEARER}`,
          },
          body: JSON.stringify({
            listingId: listing.id,
            address: listing.address,
            dong: listing.dong,
            gu: listing.gu,
            type: listing.type,
            deal: listing.deal,
            deposit: listing.deposit,
            monthly: listing.monthly,
            price: listing.price,
            area_m2: listing.area_m2,
            floor_current: listing.floor_current,
            floor_total: listing.floor_total,
            direction: listing.direction,
            rooms: listing.rooms,
            bathrooms: listing.bathrooms,
            features: listing.features,
            parking_available: listing.parking,
            buildingInfo: listing.building_name,
            aiModel: 'sonnet',
          }),
        });

        const result = await internalResp.json();
        results.push({ id: listing.id, success: result.success, title: result.title });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'error';
        results.push({ id: listing.id, success: false, title: msg });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: IS_DEV ? message : '요청 처리 실패' }, { status: 500 });
  }
}
