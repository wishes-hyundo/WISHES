import { NextRequest, NextResponse } from 'next/server';

interface ListingData {
  title: string;
  transactionType: string;
  propertyType: string;
  address: string;
  area: number;
  floor: number;
  totalFloors: number;
  price: number;
  deposit: number;
  monthlyRent: number;
  rooms: number;
  bathrooms: number;
  direction: string;
  moveInDate: string;
  features: string[] | string;
  buildingInfo?: {
    buildingName: string;
    mainPurpose: string;
    structure: string;
    approvalDate: string;
    elevatorCount: number;
    parkingCount: number;
  };
  additionalNotes?: string;
}

function ensureFeaturesArray(features: string[] | string | undefined): string[] {
  if (!features) return [];
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') return features.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const data: ListingData = await request.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        description: generateTemplate(data),
        source: 'template',
        message: 'AI API 키가 없어 템플릿 기반으로 생성되었습니다.',
      });
    }

    const prompt = buildPrompt(data);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6-20250320',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errorBody = await resp.text();
      console.error('Anthropic API error:', resp.status, errorBody);
      return NextResponse.json({
        success: true,
        description: generateTemplate(data),
        source: 'template',
        message: `AI API 오류(${resp.status})로 템플릿 기반으로 생성되었습니다.`,
      });
    }

    const result = await resp.json();
    return NextResponse.json({
      success: true,
      description: result.content[0]?.text || '',
      source: 'ai',
    });
  } catch (error) {
    console.error('Description generation error:', error);
    return NextResponse.json(
      { success: false, message: '설명 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

function buildPrompt(data: ListingData): string {
  const pt = data.transactionType === '월세'
    ? `보증금 ${data.deposit.toLocaleString()}만원 / 월세 ${data.monthlyRent.toLocaleString()}만원`
    : data.transactionType === '전세'
    ? `전세 ${data.price.toLocaleString()}만원`
    : `매매 ${data.price.toLocaleString()}만원`;

  const featArr = ensureFeaturesArray(data.features);
  const features = featArr.length > 0 ? `특징: ${featArr.join(', ')}` : '';
  const bldg = data.buildingInfo ? `
건축물 정보:
- 건물명: ${data.buildingInfo.buildingName || '없음'}
- 구조: ${data.buildingInfo.structure || '철근콘크리트'}
- 승인일: ${data.buildingInfo.approvalDate || '미확인'}
- 엘리베이터: ${data.buildingInfo.elevatorCount}대
- 주차: ${data.buildingInfo.parkingCount}대` : '';

  return `당신은 서울/경기 전문 부동산 중개사입니다. 아래 매물 정보로 매력적이고 전문적인 소개글을 작성해주세요.

매물 정보:
- 거래유형: ${data.transactionType}
- 부동산 유형: ${data.propertyType}
- 주소: ${data.address}
- 면적: ${data.area}m² (약 ${Math.round(data.area * 0.3025)}평)
- 층수: ${data.floor}/${data.totalFloors}층
- 방: ${data.rooms}개, 욕실: ${data.bathrooms}개
- 방향: ${data.direction}
- 가격: ${pt}
- 입주가능일: ${data.moveInDate}
${features}
${bldg}
${data.additionalNotes ? `추가 메모: ${data.additionalNotes}` : ''}

규칙: 3~5문단, 300~500자, 이모지 미사용, 거짓 정보 미포함, 전문적+친근한 톤`;
}

function generateTemplate(data: ListingData): string {
  const pt = data.transactionType === '월세'
    ? `보증금 ${data.deposit.toLocaleString()}만원 / 월세 ${data.monthlyRent.toLocaleString()}만원`
    : data.transactionType === '전세'
    ? `전세 ${data.price.toLocaleString()}만원`
    : `매매 ${data.price.toLocaleString()}만원`;

  const py = Math.round(data.area * 0.3025);
  let desc = `${data.address} 인근 ${data.propertyType} ${data.transactionType} 매물을 소개합니다.\n\n`;
  desc += `${data.area}m²(약 ${py}평) 규모의 `;
  if (data.rooms > 0) desc += `방 ${data.rooms}개, `;
  if (data.bathrooms > 0) desc += `욕실 ${data.bathrooms}개 `;
  desc += `구조로, ${data.floor}층/${data.totalFloors}층에 위치해 있습니다. `;
  if (data.direction) desc += `${data.direction} 방향으로 채광이 좋습니다.\n\n`;
  desc += `${pt}이며, `;
  if (data.moveInDate) desc += `${data.moveInDate} 입주 가능합니다. `;
  const featArr = ensureFeaturesArray(data.features);
  if (featArr.length > 0) desc += `\n\n주요 특징: ${featArr.join(', ')}`;
  desc += '\n\n자세한 상담은 위시스부동산으로 문의해주세요.';
  return desc;
}