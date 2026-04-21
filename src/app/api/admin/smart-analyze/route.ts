import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/adminAuth';

interface AnalyzeRequest {
  address: string;
  transactionType: string;
  propertyType: string;
  price: number;
  deposit?: number;
  monthlyRent?: number;
}

export async function POST(request: NextRequest) {
  // L-sec3 (2026-04-22): 인증 미보호 → verifyAdminAuth 추가 (Anthropic 유료 호출 보호)
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const data: AnalyzeRequest = await request.json();
    const { address } = data;

    if (!address) {
      return NextResponse.json({ error: '주소를 입력해주세요.' }, { status: 400 });
    }

    // Step 1: Analyze address to extract dong, area info
    const addressInfo = parseAddress(address);

    // Step 2: Generate AI-powered area analysis
    const apiKey = process.env.ANTHROPIC_API_KEY;
    let areaAnalysis = '';
    let suggestedDescription = '';

    if (apiKey) {
      const prompt = buildAnalysisPrompt(data, addressInfo);
      
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (resp.ok) {
        const result = await resp.json();
        const text = result.content[0]?.text || '';
        
        // Parse structured response
        const sections = text.split('---');
        areaAnalysis = sections[0]?.trim() || '';
        suggestedDescription = sections[1]?.trim() || text;
      }
    }

    // Step 3: Suggest auto-fill values based on address and type
    const suggestedValues = generateSuggestions(data, addressInfo);

    return NextResponse.json({
      success: true,
      addressInfo,
      areaAnalysis,
      suggestedDescription,
      suggestedValues,
    });
  } catch (error) {
    console.error('Smart analyze error:', error);
    return NextResponse.json(
      { error: '분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

function parseAddress(address: string) {
  // Extract district, dong, and area details from Korean address
  const siMatch = address.match(/(서울|경기|인천)[시도]?/);
  const guMatch = address.match(/([가-힣]+[구시군])/);
  const dongMatch = address.match(/([가-힣]+[동일면에로길로])/);
  
  return {
    city: siMatch?.[1] || '',
    district: guMatch?.[1] || '',
    dong: dongMatch?.[1] || '',
    fullAddress: address,
  };
}

function buildAnalysisPrompt(data: AnalyzeRequest, addressInfo: ReturnType<typeof parseAddress>) {
  const priceInfo = data.transactionType === '월세'
    ? `보증금 ${(data.deposit || 0).toLocaleString()}만원 / 월세 ${(data.monthlyRent || 0).toLocaleString()}만원`
    : data.transactionType === '전세'
    ? `전세 ${data.price.toLocaleString()}만원`
    : `매매 ${data.price.toLocaleString()}만원`;

  return `당신은 서울/경기 전문 부동산 중개사입니다.

주소: ${data.address}
부동산 유형: ${data.propertyType}
거래 유형: ${data.transactionType}
가격: ${priceInfo}

위 주소의 주변 환경을 정확하고 상세하게 분석해주세요:

1. 교통: 가장 가까운 지하철역, 버스정류장, 주요 도로 접근성
2. 생활편의: 대형마트, 편의점, 병원, 약국, 은행
3. 교육: 초등학교, 중학교, 고등학교, 학원가
4. 자연/여가: 공원, 하천, 산책로
5. 특이사항: 지역 특성, 개발 호재, 전망

---

그리고 위 정보를 바탕으로 전문적이고 매력적인 매물 소개글(300~500자)을 작성해주세요.
이모지 미사용, 거짓 정보 미포함, 전문적+친근한 톤으로 작성해주세요.

반드시 주변 분석과 소개글을 --- 구분자로 나눠서 응답해주세요.`;
}

function generateSuggestions(data: AnalyzeRequest, addressInfo: ReturnType<typeof parseAddress>) {
  // Suggest common values based on property type
  const defaults: Record<string, any> = {
    '원룸': { rooms: 1, bathrooms: 1, direction: '남향' },
    '투룸': { rooms: 2, bathrooms: 1, direction: '남향' },
    '쓰리룸': { rooms: 3, bathrooms: 1, direction: '남향' },
    '아파트': { rooms: 3, bathrooms: 2, direction: '남향' },
    '오피스텔': { rooms: 1, bathrooms: 1, direction: '남향' },
    '상가': { rooms: 0, bathrooms: 1, direction: '' },
    '사무실': { rooms: 0, bathrooms: 1, direction: '' },
  };

  const suggestion = defaults[data.propertyType] || { rooms: 2, bathrooms: 1, direction: '남향' };

  return {
    dong: addressInfo.dong,
    ...suggestion,
    moveInDate: '협의',
  };
}
