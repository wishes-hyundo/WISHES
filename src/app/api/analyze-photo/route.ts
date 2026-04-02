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

    const base64Data = image.replace(/^data:image\/[^;]+;base64,/, '');
    const mediaType = image.match(/^data:(image\/[^;]+);base64,/)?.[1] || 'image/jpeg';

    const systemPrompt =
      mode === 'mosaic'
        ? `You are a privacy detection AI for a Korean real estate listing website.
Your job is to find ALL privacy-sensitive elements in the photo.

DETECT ALL OF THESE:
1. HUMAN FACES - any visible face, even partial or small
2. PHONE NUMBERS - any text containing phone numbers (Korean format: 010-XXXX-XXXX, 02-XXX-XXXX, etc). Look for "H.P:", "TEL:", "T.", numbers on signs, banners, stickers
3. VEHICLE LICENSE PLATES - any car/motorcycle plates
4. PERSONAL DOCUMENTS - ID cards, contracts, resident registration numbers (XXXXXX-XXXXXXX)
5. PERSONAL NAMES with phone numbers - if a person's name appears next to contact info

Be AGGRESSIVE in detection. It is much better to over-detect than to miss something.
For phone numbers on signs/banners, make sure to cover the ENTIRE number including any prefix like "H.P:" or "TEL:".

COORDINATE FORMAT:
- x, y = top-left corner as percentage (0-100) of image dimensions
- width, height = size as percentage (0-100) of image dimensions
- Make bounding boxes generous - add padding around detected items

Return ONLY valid JSON:
{"detections": [{"type": "face|phone|plate|document", "x": 0, "y": 0, "width": 0, "height": 0, "confidence": 0.0}]}
If nothing found: {"detections": []}`
        : `You are a professional real estate photo enhancement AI.
Analyze this property photo and recommend enhancement parameters.
Return ONLY valid JSON with these parameters (values 0.0-1.0):
{"parameters": {"shadow_lift": 0.6, "highlight_recovery": 0.4, "contrast_strength": 0.3, "dehaze_strength": 0.5, "vibrance": 0.5, "sharpen_detail": 0.6, "sharpen_edge": 0.4, "color_temperature": 0.1, "vignette_strength": 0.15}}`;

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
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text:
                  mode === 'mosaic'
                    ? 'Detect ALL privacy-sensitive elements in this Korean real estate photo. Be thorough - check for faces, phone numbers on signs/banners/stickers, license plates, and personal documents. Return JSON with detections array.'
                    : 'Analyze this real estate photo and recommend enhancement parameters. Return JSON.',
              },
            ],
          },
        ],
        system: systemPrompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return NextResponse.json({ error: 'API call failed' }, { status: 500 });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json(parsed);
    }

    return NextResponse.json(
      mode === 'mosaic' ? { detections: [] } : { parameters: null }
    );
  } catch (error) {
    console.error('analyze-photo error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
