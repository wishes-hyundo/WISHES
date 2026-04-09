import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 });
    }

    const body = await req.json();
    const {
      address, dong, type, deal, deposit, monthly, price,
      area_m2, area_supply_m2, floor_current, floor_total,
      direction, rooms, bathrooms, features, parking_available,
      buildingInfo, style, aiModel
    } = body;

    const model = aiModel === 'best' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514';

    let priceInfo = '';
    if (deal === '매매' && price) priceInfo = `매매 ${price}만원`;
    else if (deal === '전세' && deposit) priceInfo = `전세 ${deposit}만원`;
    else if (deal === '월세') priceInfo = `월세 ${deposit || 0}/${monthly || 0}만원`;

    const listingDetails = [
      `주소: ${address || ''}`,
      dong ? `동네: ${dong}` : '',
      `매물유형: ${type || ''}`,
      `거래유형: ${deal || ''}`,
      priceInfo ? `가격: ${priceInfo}` : '',
      area_m2 ? `전용면적: ${area_m2}m²` : '',
      area_supply_m2 ? `공급면적: ${area_supply_m2}m²` : '',
      floor_current ? `해당층: ${floor_current}층` : '',
      floor_total ? `총층수: ${floor_total}층` : '',
      direction ? `방향: ${direction}` : '',
      rooms ? `방: ${rooms}개` : '',
      bathrooms ? `욕실: ${bathrooms}개` : '',
      features?.length ? `특징: ${features.join(', ')}` : '',
      parking_available ? `주차: 가능` : '',
      buildingInfo ? `건축물명: ${buildingInfo.건축물명 || ''}` : '',
      buildingInfo ? `사용승인일: ${buildingInfo.사용승인일 || ''}` : '',
      buildingInfo ? `건축구조: ${buildingInfo.건축구조 || ''}` : '',
      buildingInfo ? `주차대수: ${buildingInfo.주차대수 || ''}` : '',
      buildingInfo ? `승강기대수: ${buildingInfo.승강기대수 || ''}` : '',
    ].filter(Boolean).join('\n');

    const randomSeed = Math.floor(Math.random() * 10);
    const styleVariant = style || ['trendy', 'premium', 'clean'][randomSeed % 3];

    const prompt = `당신은 서울/경기권 부동산 전문 카피라이터입니다. 아래 매물 정보를 분석하여 매력적인 제목과 상세설명을 작성해주세요.

⚠️ 핵심 규칙:
1. 제목은 25자 이내, 설명은 300자 이내
2. 실제 정보만 사용 (없는 정보 빼고, 거짓 금지)
3. 자연스러운 한국어 구어체로 작성

[분석할 매물]
${listingDetails}

[제목 작성 방법 - 매번 다른 패턴을 사용하세요!]
랜덤 시드: ${randomSeed}
아래 패턴 중 랜덤 시드에 맞는 것을 사용하세요:
0: "핵심특징 + 동네명" (예: "풀옵션 신축 역삼동 원룸")
1: "가격대 + 매물특징" (예: "월세 40만원대 남향 투룸")
2: "타겟고객 + 특징" (예: "신혼부부 추천! 역세권 투룸")
3: "위치특성 + 핵심메리트" (예: "강남역 5분, 신축 원룸")
4: "감성적 표현 + 정보" (예: "햇살 가득한 남향 원룸")
5: "직관적 정보 나열" (예: "역삼동 2층 월세 30/40")
6: "특화포인트 강조" (예: "주차 3대 가능! 역세권 아파트")
7: "비교우위 강조" (예: "이 가격에 이 조건? 역삼동 월세")
8: "생활편의 강조" (예: "편의점 몰린 역세권 원룸")
9: "공간감 강조" (예: "넓은 거실 25평 아파트")

[설명 작성 방법 - 다양한 구성을 사용하세요!]
랜덤 시드에 따라 아래 구성 중 하나를 선택:

홀수(1,3,5,7,9): 자연스러운 문장형
- 매물의 핵심 특징을 2-3문장으로 자연스럽게 설명
- 주변 환경/교통 정보를 자연스럽게 언급
- 적합한 입주자 타입을 제안
- 이모지 사용 금지, 자연스러운 문체

짝수(0,2,4,6,8): 구조화된 형식 (다양한 이모지 조합 사용)
- 3-4개 섹션으로 구분
- 각 섹션은 이모지+제목+설명 (이모지는 매번 다르게!)
- 이모지 조합 예시: 편수(0): 🏠/🚌/🏫/✨, 편수(2): 📍/💰/💪/🌟, 편수(4): ☀️/🚗/🛒/🔑, 편수(6): 🌳/🚉/🏗️/✅, 편수(8): 🌅/🚶/🎯/👍

[SEO 키워드]
- 매물 특성과 관련된 검색 키워드 5개

[해시태그]
- SNS용 해시태그 5개 (예: #역삼동월세 #신축원룸)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "제목 (25자 이내)",
  "description": "상세설명 (300자 이내)",
  "keywords": ["키워드1", "키워드2", ...],
  "tags": ["#해시태그1", "#해시태그2", ...],
  "meta_description": "SEO용 요약 (160자 이내)"
}`;

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
      return NextResponse.json({ success: false, error: `Anthropic API error: ${response.status}` }, { status: 500 });
    }

    const aiResult = await response.json();
    const text = aiResult.content?.[0]?.text || '';

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
    } catch {
      parsed = {
        title: '',
        description: text.substring(0, 300),
        keywords: [],
        tags: [],
        meta_description: '',
      };
    }

    return NextResponse.json({
      success: true,
      ...parsed,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 });
  }
}
