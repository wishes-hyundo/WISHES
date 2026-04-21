import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500, headers: CORS_HEADERS });
    }

    const body = await req.json();
    const { listings, market_context, request_type } = body;

    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return NextResponse.json({ success: false, error: 'listings required' }, { status: 400, headers: CORS_HEADERS });
    }

    // 매물 정보를 텍스트로 변환
    const listingsText = listings.map((l: any, idx: number) => {
      let priceStr = '';
      if (l.deal === '매매') priceStr = `매매 ${l.price || 0}만원`;
      else if (l.deal === '전세') priceStr = `전세 ${l.deposit || 0}만원`;
      else priceStr = `월세 ${l.deposit || 0}/${l.monthly || 0}만원`;

      return `[매물 ${idx + 1}] ID: ${l.id}
제목: ${l.title || ''}
유형: ${l.type || ''} / ${l.deal || ''}
가격: ${priceStr}${l.maintenance_fee ? ' (관리비 ' + l.maintenance_fee + '만원)' : ''}
면적: 전용 ${l.area_m2 || 0}㎡ (${l.area_py || 0}평)
층수: ${l.floor_current || '?'}층/${l.floor_total || '?'}층
방/화장실: ${l.rooms || 0}/${l.bathrooms || 0}
방향: ${l.direction || '미상'}
주소: ${l.address || ''}
옵션: ${[l.parking ? '주차' : '', l.elevator ? '엘리베이터' : '', l.pet ? '반려동물' : '', l.full_option ? '풀옵션' : '', l.loan_available ? '대출가능' : ''].filter(Boolean).join(', ') || '없음'}
건축연도: ${l.built_year || '미상'}`;
    }).join('\n\n');

    const contextStr = market_context ? `
[시장 컨텍스트]
총 보유 매물: ${market_context.totalListings || 0}건
평균 보증금: ${market_context.avgDeposit || 0}만원
평균 월세: ${market_context.avgMonthly || 0}만원` : '';

    const prompt = `당신은 위시스부동산(WISHES)의 전문 부동산 컨설턴트입니다.
고객에게 전달할 매물 브리핑 자료를 작성해주세요.

${listingsText}
${contextStr}

[브리핑 작성 규칙]
1. 각 매물별로 아래 항목을 작성:
   - summary: 매물의 핵심 매력을 2~3문장으로 요약 (고객이 "왜 이 매물이 좋은지" 느낄 수 있게)
   - pros: 장점 3~5개 (구체적으로, 위치/교통/시설/가성비 등)
   - cons: 고려사항 1~2개 (솔직하되 부정적이지 않게)
   - recommendation: 어떤 고객에게 추천하는지 (직장인/자취생/신혼부부/사업자 등)
   - highlight: 한줄 캐치프레이즈 (고객의 관심을 끄는 문구)

2. 전문적이면서도 친근한 톤으로 작성
3. 금액, 면적 등 수치는 브리핑에 포함 가능
4. 주변 편의시설, 교통 접근성 등을 주소 기반으로 추정하여 언급

반드시 아래 JSON 형식으로 응답해주세요:
{
  "briefings": [
    {
      "listing_id": 매물ID,
      "summary": "요약",
      "pros": ["장점1", "장점2", ...],
      "cons": ["고려사항1"],
      "recommendation": "추천 대상",
      "highlight": "캐치프레이즈"
    }
  ]
}`;

    const model = body.model || 'claude-sonnet-4-20250514';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ai/briefing] API error:', response.status, errText);
      return NextResponse.json({ success: false, error: `AI API 오류 (${response.status})` }, { status: 500, headers: CORS_HEADERS });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.briefings && Array.isArray(parsed.briefings)) {
          return NextResponse.json({ success: true, briefings: parsed.briefings, model }, { headers: CORS_HEADERS });
        }
      }
    } catch {
      // JSON 파싱 실패
    }

    // Fallback: 텍스트 그대로 반환
    return NextResponse.json({
      success: true,
      briefings: listings.map((l: any) => ({
        listing_id: l.id,
        summary: text.substring(0, 200),
        pros: ['AI 분석 결과를 확인해주세요'],
        cons: [],
        recommendation: '',
        highlight: l.title || ''
      })),
      model,
      raw: text,
    }, { headers: CORS_HEADERS });

  } catch (error: any) {
    console.error('[ai/briefing] error:', error);
    return NextResponse.json(
      { success: false, error: '브리핑 생성에 실패했습니다: ' + (error?.message || '') },
      { status: 500, headers: CORS_HEADERS }
    );
  }
      }
