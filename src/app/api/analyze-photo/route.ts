import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { image, mode } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const systemPrompt = mode === 'mosaic'
      ? `You are a privacy detection AI for a Korean real estate website. Your job is to find ALL areas containing phone numbers, personal information, or faces that must be blurred.

CRITICAL: You must detect ALL Korean phone numbers in the image. Phone numbers in Korea follow these formats:
- 010-XXXX-XXXX (mobile)
- 02-XXX-XXXX or 02-XXXX-XXXX (Seoul landline)
- 0XX-XXX-XXXX or 0XX-XXXX-XXXX (other regions)
- H.P: followed by numbers
- Numbers on real estate signs (임대, 매매, 분양 signs)

Also detect:
1. Human faces (residents, visitors, pedestrians)
2. Vehicle license plates
3. Personal documents, ID numbers
4. ANY text containing phone numbers, even if partially visible or at an angle

IMPORTANT RULES:
- Be AGGRESSIVE in detection. It is better to over-detect than to miss a phone number.
- For phone numbers on signs, include the ENTIRE phone number area with generous margins.
- x,y coordinates are the TOP-LEFT corner of the detection area.
- width,height define the size of the area from that top-left corner.
- All values are PERCENTAGES (0-100) of the full image dimensions.
- Make detection areas LARGE ENOUGH to fully cover the text. Add 10-15% extra margin.

Return ONLY a JSON object:
{
  "detections": [
    {
      "type": "face|plate|document|text",
      "x": number,
      "y": number, 
      "width": number,
      "height": number,
      "confidence": number
    }
  ]
}

If nothing is detected, return {"detections": []}`
      : `You are a professional photo enhancement AI for a real estate website (wishes.co.kr).
Analyze this property photo and determine optimal enhancement parameters.

Evaluate the image for:
1. Shadow areas that need HDR lift
2. Blown highlights that need recovery
3. Overall contrast needs
4. Haze/fog level
5. Color vibrancy
6. Sharpness
7. Vignetting benefit

Return ONLY a JSON object with this exact format:
{
  "analysis": {
    "overall_quality": "low|medium|high",
    "issues": ["list of detected issues"]
  },
  "parameters": {
    "shadow_lift": 0.0-1.0,
    "highlight_recovery": 0.0-1.0,
    "contrast_strength": 0.0-0.5,
    "dehaze_strength": 0.0-0.5,
    "vibrance": 0.0-0.6,
    "sharpen_detail": 0.0-1.0,
    "sharpen_edge": 0.0-0.8,
    "color_temperature": -0.3-0.3,
    "vignette_strength": 0.0-0.4
  }
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: image.replace(/^data:image\/[^;]+;base64,/, ''),
                },
              },
              { type: 'text', text: systemPrompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Anthropic API error:', response.status, errorData.substring(0, 200));
      return NextResponse.json(
        { error: 'Anthropic API error: ' + response.status, details: errorData.substring(0, 200) },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '{}';

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return NextResponse.json(result);
  } catch (error) {
    console.error('Photo analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze photo', details: String(error) },
      { status: 500 }
    );
  }
}
