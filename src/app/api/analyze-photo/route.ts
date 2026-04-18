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
      ? `You are an image analysis AI for a real estate website. Analyze this property photo and detect any privacy-sensitive areas that need to be blurred/mosaicked.

Look for:
1. Human faces (residents, visitors)
2. Vehicle license plates (parking lot, exterior photos)
3. Personal documents (whiteboards, papers, contracts)
4. Visible phone numbers, ID numbers, or personal text

Return ONLY a JSON object with this exact format:
{
  "detections": [
    { "type": "face|plate|document|text", "x": number, "y": number, "width": number, "height": number, "confidence": number }
  ]
}
Coordinates should be in percentages (0-100) of image dimensions. If nothing is detected, return {"detections": []}`
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
      return NextResponse.json(
        { error: 'Anthropic API error: ' + response.status, details: errorData },
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
