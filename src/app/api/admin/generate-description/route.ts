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
        message: 'AI API í¤ê° ìì´ ííë¦¿ ê¸°ë°ì¼ë¡ ìì±ëììµëë¤.',
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
        message: `AI API ì¤ë¥(${resp.status})ë¡ ííë¦¿ ê¸°ë°ì¼ë¡ ìì±ëììµëë¤.`,
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
      { success: false, message: 'ì¤ëª ìì± ì¤ ì¤ë¥ê° ë°ìíìµëë¤.' },
      { status: 500 }
    );
  }
}

function buildPrompt(data: ListingData): string {
  const pt = data.transactionType === 'ìì¸'
    ? `ë³´ì¦ê¸ ${data.deposit.toLocaleString()}ë§ì / ìì¸ ${data.monthlyRent.toLocaleString()}ë§ì`
    : data.transactionType === 'ì ì¸'
    ? `ì ì¸ ${data.price.toLocaleString()}ë§ì`
    : `ë§¤ë§¤ ${data.price.toLocaleString()}ë§ì`;

  const featArr = ensureFeaturesArray(data.features);
  const features = featArr.length > 0 ? `í¹ì§: ${featArr.join(', ')}` : '';
  const bldg = data.buildingInfo ? `
ê±´ì¶ë¬¼ ì ë³´:
- ê±´ë¬¼ëª: ${data.buildingInfo.buildingName || 'ìì'}
- êµ¬ì¡°: ${data.buildingInfo.structure || 'ì² ê·¼ì½í¬ë¦¬í¸'}
- ì¹ì¸ì¼: ${data.buildingInfo.approvalDate || 'ë¯¸íì¸'}
- ìë¦¬ë² ì´í°: ${data.buildingInfo.elevatorCount}ë
- ì£¼ì°¨: ${data.buildingInfo.parkingCount}ë` : '';

  return `ë¹ì ì ìì¸/ê²½ê¸° ì ë¬¸ ë¶ëì° ì¤ê°ì¬ìëë¤. ìë ë§¤ë¬¼ ì ë³´ë¡ ë§¤ë ¥ì ì´ê³  ì ë¬¸ì ì¸ ìê°ê¸ì ìì±í´ì£¼ì¸ì.

ë§¤ë¬¼ ì ë³´:
- ê±°ëì í: ${data.transactionType}
- ë¶ëì° ì í: ${data.propertyType}
- ì£¼ì: ${data.address}
- ë©´ì : ${data.area}mÂ² (ì½ ${Math.round(data.area * 0.3025)}í)
- ì¸µì: ${data.floor}/${data.totalFloors}ì¸µ
- ë°©: ${data.rooms}ê°, ìì¤: ${data.bathrooms}ê°
- ë°©í¥: ${data.direction}
- ê°ê²©: ${pt}
- ìì£¼ê°ë¥ì¼: ${data.moveInDate}
${features}
${bldg}
${data.additionalNotes ? `ì¶ê° ë©ëª¨: ${data.additionalNotes}` : ''}

ê·ì¹: 3~5ë¬¸ë¨, 300~500ì, ì´ëª¨ì§ ë¯¸ì¬ì©, ê±°ì§ ì ë³´ ë¯¸í¬í¨, ì ë¬¸ì +ì¹ê·¼í í¤`;
}

function generateTemplate(data: ListingData): string {
  const pt = data.transactionType === 'ìì¸'
    ? `ë³´ì¦ê¸ ${data.deposit.toLocaleString()}ë§ì / ìì¸ ${data.monthlyRent.toLocaleString()}ë§ì`
    : data.transactionType === 'ì ì¸'
    ? `ì ì¸ ${data.price.toLocaleString()}ë§ì`
    : `ë§¤ë§¤ ${data.price.toLocaleString()}ë§ì`;

  const py = Math.round(data.area * 0.3025);
  let desc = `${data.address} ì¸ê·¼ ${data.propertyType} ${data.transactionType} ë§¤ë¬¼ì ìê°í©ëë¤.\n\n`;
  desc += `${data.area}mÂ²(ì½ ${py}í) ê·ëª¨ì `;
  if (data.rooms > 0) desc += `ë°© ${data.rooms}ê°, `;
  if (data.bathrooms > 0) desc += `ìì¤ ${data.bathrooms}ê° `;
  desc += `êµ¬ì¡°ë¡, ${data.floor}ì¸µ/${data.totalFloors}ì¸µì ìì¹í´ ììµëë¤. `;
  if (data.direction) desc += `${data.direction} ë°©í¥ì¼ë¡ ì±ê´ì´ ì¢ìµëë¤.\n\n`;
  desc += `${pt}ì´ë©°, `;
  if (data.moveInDate) desc += `${data.moveInDate} ìì£¼ ê°ë¥í©ëë¤. `;
  const featArr = ensureFeaturesArray(data.features);
  if (featArr.length > 0) desc += `\n\nì£¼ì í¹ì§: ${featArr.join(', ')}`;
  desc += '\n\nìì¸í ìë´ì ììì¤ë¶ëì°ì¼ë¡ ë¬¸ìí´ì£¼ì¸ì.';
  return desc;
}