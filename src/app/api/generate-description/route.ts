import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'wishes2026';

function validateAdmin(request: NextRequest): boolean {
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${ADMIN_TOKEN}`;
}

export async function POST(request: NextRequest) {
  if (!validateAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      listingId, address, dong, gu, type, deal,
      deposit, monthly, price, area_m2,
      floor_current, floor_total, direction,
      rooms, bathrooms, features, parking_available,
      buildingInfo, aiModel
    } = body;

    // v2.6.4 hotfix: 삼항연산자의 truthy 분기가 누락되어 있던 문법 에러 복구.
    const model = aiModel === 'opus'
      ? 'claude-opus-4-6'
      : 'claude-haiku-4-5-20251001';

    const dongName = dong || '';
    const guName = gu || '';

    const listingInfo = [
      `- 소재지: ${guName} ${dongName}`,
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

    const prompt = `당신은 서울/경기 지역에서 10년 이상 경력의 부동산 전문가입니다.
아래 매물 정보를 바탕으로 고객에게 매력적이고 정보 전달력 있는 제목과 상세설명을 작성하세요.

[매물 정보]
${listingInfo}

[절대 규칙]
1. 금액(보증금, 월세, 매매가)을 제목/설명에 절대 포함하지 마세요
2. 면적, 평수를 설명에 넣지 마세요 (이미 상세페이지에 표시됨)
3. "최고", "완벽", "꿈의" 같은 과장 마케팅 문구 금지
4. 구체적이고 근거 있는 정보만 작성

[제목 작성 규칙]
- 30자 이내
- 형식: "${dongName} [핵심차별점] · [유형]"
- 예: "신림동 2호선 도보3분 남향 원룸"

[상세설명 작성 규칙 - 400~600자]
다음 구조로 작성:
1. 한줄평: 이 매물의 핵심 매력을 감성적으로 한 줄 요약
2. 출퇴근: 가장 가까운 지하철역 + 주요 업무지구 소요시간 (추정)
3. 도보 생활권: 반경 500m 내 편의시설 (마트, 카페, 병원 등)
4. 추천 포인트 3가지: 이 매물만의 강점을 구체적 근거와 함께
5. 추천 고객: 이 매물에 가장 적합한 고객층

[SEO 키워드]
10~15개의 검색 키워드를 배열로 작성
예: ["${dongName} ${type}", "${guName} ${deal}", "${dongName} 역세권", ...]

[SEO 태그]
10~15개 해시태그
예: ["#${dongName}${type}", "#${guName}${deal}", ...]

[메타 설명]
검색엔진용 160자 이내 설명

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
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: 'AI API failed', details: err }, { status: 500 });
    }

    const aiData = await response.json();
    const aiText = aiData.content?.[0]?.text || '';

    let parsed;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: aiText }, { status: 500 });
    }

    // If listingId provided, update the listing in DB
    if (listingId) {
      const updateData: Record<string, unknown> = {
        ai_title: parsed.title,
        ai_description: parsed.description,
        seo_keywords: parsed.keywords,
        seo_tags: parsed.tags,
        seo_meta_description: parsed.meta_description,
        ai_generated_at: new Date().toISOString(),
      };

      await supabaseAdmin
        .from('listings')
        .update(updateData)
        .eq('id', listingId);
    }

    return NextResponse.json({
      success: true,
      title: parsed.title,
      description: parsed.description,
      keywords: parsed.keywords,
      tags: parsed.tags,
      meta_description: parsed.meta_description,
      model,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Batch endpoint: generate descriptions for listings without AI content
export async function PUT(request: NextRequest) {
  if (!validateAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const limit = body.limit || 10;

    // Find listings without AI description
    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      .select('id, address, dong, gu, type, deal, deposit, monthly, price, area_m2, floor_current, floor_total, direction, rooms, bathrooms, features, parking, building_name')
      .is('ai_description', null)
      .eq('status', '공개')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
            'Authorization': `Bearer ${ADMIN_TOKEN}`,
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
