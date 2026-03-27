import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 });
    }

    const body = await req.json();
    const { address, dong, type, deal, deposit, monthly, price, area_m2, area_supply_m2,
            floor_current, floor_total, direction, rooms, bathrooms, features,
            parking_available, buildingInfo, style, aiModel } = body;

    // 모델 선택: best = Opus 4 (최고 품질), latest = Sonnet 4 (최신/빠름)
    const model = aiModel === 'best' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514';

    // 매물 정보 요약
    let priceInfo = '';
    if (deal === '매매' && price) priceInfo = `매매 ${price}만원`;
    else if (deal === '전세' && deposit) priceInfo = `전세 ${deposit}만원`;
    else if (deal === '월세') priceInfo = `월세 ${deposit || 0}/${monthly || 0}만원`;

    const listingInfo = [
      `주소: ${address || ''}`,
      dong ? `동: ${dong}` : '',
      `매물유형: ${type || ''}`,
      `거래유형: ${deal || ''}`,
      priceInfo ? `가격: ${priceInfo}` : '',
      area_m2 ? `전용면적: ${area_m2}㎡` : '',
      area_supply_m2 ? `공급면적: ${area_supply_m2}㎡` : '',
      floor_current ? `층수: ${floor_current}층${floor_total ? '/' + floor_total + '층' : ''}` : '',
      direction ? `방향: ${direction}` : '',
      rooms ? `방: ${rooms}개` : '',
      bathrooms ? `화장실: ${bathrooms}개` : '',
      features?.length ? `특징: ${features.join(', ')}` : '',
      parking_available ? '주차 가능' : '',
      buildingInfo?.건물명 ? `건물명: ${buildingInfo.건물명}` : '',
      buildingInfo?.사용승인일 ? `사용승인일: ${buildingInfo.사용승인일}` : '',
    ].filter(Boolean).join('\n');

    const styleGuide = style === 'premium'
      ? '고급스럽고 전문적인 톤으로 작성해주세요. 품격 있고 신뢰감 있는 문체로 작성해주세요.'
      : style === 'clean'
      ? '깔끔하고 간결한 정보 전달 위주로 작성해주세요.'
      : '트렌디하고 캐주얼한 부동산 광고 문체로 작성해주세요. 이모지를 적극 활용하고, 자취생/직장인 타겟으로 캐치프레이즈를 사용해주세요.';

    const prompt = `당신은 한국 서울/경기권 부동산 중개업소의 매물 광고 전문가입니다.
아래 매물 정보를 바탕으로 매력적인 매물 제목과 설명을 생성해주세요.

${styleGuide}

[매물 정보]
${listingInfo}

[요구사항]
1. 제목: 40자 이내, 핵심 키워드 포함, 클릭을 유도하는 매력적인 문구
2. 설명: 300자 이상, 이모지 활용, 위치/교통/편의시설/매물장점/가격 메리트 등 포함
3. 마지막에 문의 유도 문구 추가
4. 건축물대장 정보(면적, 층수 등)는 설명에 포함하지 마세요 (별도 표시됨)

반드시 아래 JSON 형식으로만 응답해주세요:
{"title": "매물 제목", "description": "매물 설명"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[generate-description] API error:', errText);
      return NextResponse.json({ success: false, error: `AI API 오류 (${response.status})` }, { status: 500 });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // JSON 파싱 시도
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          success: true,
          title: parsed.title || '',
          description: parsed.description || text,
          model,
        });
      }
    } catch {
      // JSON 파싱 실패 시 텍스트 그대로 반환
    }

    return NextResponse.json({
      success: true,
      title: '',
      description: text,
      model,
    });

  } catch (error) {
    console.error('[generate-description] error:', error);
    return NextResponse.json(
      { success: false, error: '설명 생성에 실패했습니다' },
      { status: 500 }
    );
  }
}
