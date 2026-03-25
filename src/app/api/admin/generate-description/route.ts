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
        model: 'claude-sonnet-4-20250514',
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
  const pt = data.transactionType === 'monthly' 
    ? `보증금 ${(data.deposit || 0).toLocaleString()}만원 / 월세 ${(data.monthlyRent || 0).toLocaleString()}만원`
    : data.transactionType === 'jeonse'
    ? `전세 ${(data.price || 0).toLocaleString()}만원`
    : `매매 ${(data.price || 0).toLocaleString()}만원`;

  const featArr = ensureFeaturesArray(data.features);
  const features = featArr.length > 0 ? featArr.join(', ') : '';

  const bldg = data.buildingInfo ? `
건축물대장 정보:
- 사용승인일: ${data.buildingInfo.approvalDate || '미상'}
- 엘리베이터: ${data.buildingInfo.elevator ? '있음' : '없음'}
- 주차: ${data.buildingInfo.parking || '미상'}
- 용도지역: ${data.buildingInfo.zoning || '미상'}
- 건폐율: ${data.buildingInfo.coverageRatio || '미상'}
- 용적률: ${data.buildingInfo.floorAreaRatio || '미상'}` : '';

  return `당신은 위시스부동산의 전문 부동산 매물 설명 작성 AI입니다.

아래 매물 정보를 바탕으로 고객에게 전달할 매물 설명을 작성해주세요.

[매물 정보]
- 거래유형: ${data.transactionType === 'monthly' ? '월세' : data.transactionType === 'jeonse' ? '전세' : '매매'}
- 매물유형: ${data.propertyType || ''}
- 소재지: ${data.address || ''}
- 가격: ${pt}
- 면적: ${data.area || ''}평
- 해당층/총층: ${data.floor || ''}층/${data.totalFloors || ''}층
- 방/욕실: ${data.rooms || ''}방 / ${data.bathrooms || ''}욕실
- 방향: ${data.direction || ''}
- 입주가능일: ${data.moveInDate || ''}
${features ? `- 특징: ${features}` : ''}
${data.additionalNotes ? `- 추가정보: ${data.additionalNotes}` : ''}
${bldg}

[작성 규칙]
1. 아래 포맷을 반드시 준수해주세요:

✨ [매물유형] - [1줄 핵심 캐치프레이즈]

🏠 기본 정보
• 위치: [address]
• 면적: [area]평
• 구조: [rooms]방/[bathrooms]욕실
• 해당층: [floor]층/[totalFloors]층
• 방향: [direction]

📍 주변 환경 & 입지 분석
(주소에서 추측할 수 있는 교통, 학구, 편의시설 등 생활환경 장점을 자연스럽게 작성)

✅ 매물 하이라이트
(특징, 기능을 기반으로 3~5개 핵심 장점을 불릿으로)

📅 입주 정보
• 입주가능일: [moveInDate]

📉 가격 정보
• [transactionType]: [금액]

---
📞 자세한 안내는 위시스부동산으로 문의해주세요.

2. 문체 규칙:
- 고객 눈높이에서 읽기 좋게 작성
- 전문적이면서도 따딱하지 않은 친균한 어투
- 용어가 어렵지 않을것(예: "종합병원 바로 옆, 학교 걸어서 5분" 등 생활에 와닿는 표현)
- 이모지 사용을 적절히 활용하여 시각적으로 구분되는 느낌
- 전체 글자수 300~500자 이내
- 좋은 점을 강조하되 과장하지 말것
- 불필요한 행간격 없이 컴팩트하게

3. 결과물만 출력하세요. "매물 설명" 같은 제목이나 불필요한 접두어 없이 바로 내용을 작성해주세요.`;
}

function generateTemplate(data: ListingData): string {
  const pt = data.transactionType === 'monthly'
    ? `보증금 ${(data.deposit || 0).toLocaleString()}만원 / 월세 ${(data.monthlyRent || 0).toLocaleString()}만원`
    : data.transactionType === 'jeonse'
    ? `전세 ${(data.price || 0).toLocaleString()}만원`
    : `매매 ${(data.price || 0).toLocaleString()}만원`;

  const py = data.area ? `${data.area}평` : '';
  const featArr = ensureFeaturesArray(data.features);
  const features = featArr.length > 0 ? featArr.join(', ') : '';

  let desc = `✨ ${data.propertyType || '매물'} ${data.transactionType === 'monthly' ? '월세' : data.transactionType === 'jeonse' ? '전세' : '매매'} - ${data.address || ''} 좋은 입지의 매물\n\n`;
  desc += `🏠 기본 정보\n`;
  desc += `• 위치: ${data.address || ''}\n`;
  if (py) desc += `• 면적: ${py}\n`;
  if (data.rooms) desc += `• 구조: ${data.rooms}방/${data.bathrooms || ''}욕실\n`;
  if (data.floor) desc += `• 해당층: ${data.floor}층/${data.totalFloors || ''}층\n`;
  if (data.direction) desc += `• 방향: ${data.direction}\n`;
  desc += `\n📉 가격 정보\n• ${pt}\n`;
  if (data.moveInDate) desc += `\n📅 입주 정보\n• 입주가능일: ${data.moveInDate}\n`;
  if (features) desc += `\n✅ 매물 하이라이트\n• ${features}\n`;
  desc += `\n---\n📞 자세한 안내는 위시스부동산으로 문의해주세요.`;
  return desc;
}

