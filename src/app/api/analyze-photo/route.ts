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

    const systemPrompt =
      mode === 'mosaic'
        ? `You are a privacy detection AI for a Korean real estate listing website.
Detect ONLY these two categories of privacy-sensitive visual elements:

1. VEHICLE LICENSE PLATES
   - Korean license plates on any vehicle (cars, motorcycles, trucks)
   - Include the full plate area with 15% margin on each side
   - Plates can be at various angles

2. PERSONAL DOCUMENTS
   - Paper documents, contracts, letters visible on desks/tables/walls
   - Whiteboards or screens showing personal information
   - ID cards, business cards with personal details
   - Any handwritten notes with personal content

DO NOT DETECT (these are handled by other systems):
- Human faces (handled by face-api.js)
- Phone numbers or any text (handled by OCR)
- Signs, banners, advertisements
- Building numbers, addresses, prices

COORDINATE FORMAT:
- x, y = top-left corner as percentage (0-100) of image dimensions
- width, height = size as percentage (0-100)
- Make detection boxes generous enough to cover the full item

Return ONLY valid JSON:
{"detections": [{"type": "plate", "x": 0, "y": 0, "width": 0, "height": 0, "confidence": 0.0}]}

If nothing found: {"detections": []}`
        : `You are a professional photo enhancement AI for a real estate website (wishes.co.kr).
Analyze this property photo and determine optimal enhancement parameters.

Evaluate: shadows, highlights, contrast, haze, vibrancy, sharpness, vignetting.

Return ONLY JSON:
{
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
