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
        ? `You are a precision privacy detection AI for Korean real estate photos.
Find ALL privacy-sensitive items and return TIGHT bounding boxes around ONLY the sensitive content.

WHAT TO DETECT:
1. PHONE NUMBERS - Korean format like 010-XXXX-XXXX, 02-XXX-XXXX, 070-XXXX-XXXX. Also numbers after "H.P:", "TEL:", "T.", "HP." on signs, banners, stickers, papers. This is the HIGHEST priority.
2. HUMAN FACES - any visible face, even partial, small, or in background
3. VEHICLE LICENSE PLATES - Korean car/motorcycle plates
4. PERSONAL ID INFO - resident registration numbers (XXXXXX-XXXXXXX), ID cards

CRITICAL RULES:
- For phone numbers: draw the box ONLY around the digits/number text, NOT the entire sign or banner
- For faces: draw the box around the face only, not the entire person
- Each detected item gets its OWN separate bounding box
- If a sign has BOTH a phone number AND a name, return TWO separate detections
- Do NOT return one giant box covering an entire sign - break it into individual items
- Add about 5% padding around each item for safety margin

COORDINATE FORMAT (percentage of image, 0-100):
x = left edge, y = top edge, width = box width, height = box height
All values as percentage of total image dimensions.

IMPORTANT: A phone number box should typically be width 15-40%, height 3-8% of image.
A face box should typically be width 5-15%, height 5-15% of image.
If your box is larger than 50% of the image in any dimension, you are probably doing it wrong.

Return ONLY valid JSON:
{"detections": [{"type": "face|phone|plate|document", "x": 0, "y": 0, "width": 0, "height": 0, "confidence": 0.9}]}
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
        max_tokens: 2048,
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
                    ? 'Scan this Korean real estate photo carefully for privacy-sensitive content. Look especially for phone numbers on signs, banners, stickers, and papers. Also check for faces, license plates, and personal ID numbers. Return TIGHT bounding boxes around ONLY the sensitive items - do NOT box entire signs. Return JSON.'
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
      return NextResponse.json({ error: 'API call failed', status: response.status }, { status: 500 });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate and clamp detection coordinates
        if (parsed.detections && Array.isArray(parsed.detections)) {
          parsed.detections = parsed.detections
            .filter((d: any) => d.x != null && d.y != null && d.width != null && d.height != null)
            .map((d: any) => ({
              type: d.type || 'unknown',
              x: Math.max(0, Math.min(100, Number(d.x) || 0)),
              y: Math.max(0, Math.min(100, Number(d.y) || 0)),
              width: Math.max(1, Math.min(100, Number(d.width) || 5)),
              height: Math.max(1, Math.min(100, Number(d.height) || 5)),
              confidence: Number(d.confidence) || 0.5,
            }));
          console.log('[MOSAIC-API] Detections:', parsed.detections.length,
            parsed.detections.map((d: any) => `${d.type}(${d.x.toFixed(0)},${d.y.toFixed(0)},${d.width.toFixed(0)}x${d.height.toFixed(0)})`).join(', '));
        }
        return NextResponse.json(parsed);
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr, 'raw:', text.substring(0, 200));
      }
    }

    return NextResponse.json(
      mode === 'mosaic' ? { detections: [] } : { parameters: null }
    );
  } catch (error) {
    console.error('analyze-photo error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
