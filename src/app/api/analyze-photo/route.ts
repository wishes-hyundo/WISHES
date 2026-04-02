import { NextRequest, NextResponse } from 'next/server';

const GRID_ROWS = 6;
const GRID_COLS = 8;
const CELL_W = 100 / GRID_COLS;
const CELL_H = 100 / GRID_ROWS;

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
        ? `You are a privacy detection AI for Korean real estate listing photos.

TASK: Find ALL privacy-sensitive items in the image.

GRID SYSTEM: Imagine the image divided into ${GRID_ROWS} rows (0-${GRID_ROWS - 1}, top to bottom) and ${GRID_COLS} columns (0-${GRID_COLS - 1}, left to right), forming ${GRID_ROWS * GRID_COLS} equal cells.

WHAT TO DETECT (in priority order):
1. PHONE NUMBERS - Korean formats: 010-XXXX-XXXX, 02-XXX-XXXX, 070-XXXX-XXXX. Also numbers near H.P:, TEL:, T., HP. on signs, banners, stickers, papers, windows.
2. HUMAN FACES - any visible face, even partial or small
3. VEHICLE LICENSE PLATES - Korean car/motorcycle plates
4. PERSONAL DOCUMENTS - ID cards, registration numbers

INSTRUCTIONS:
- For each detected item, report ALL grid cells it touches or overlaps
- A phone number on a sign typically spans 2-4 cells horizontally
- Include cells that contain even partial text of the phone number
- If content is near a cell boundary, include BOTH adjacent cells
- Be thorough: including extra cells is much better than missing any
- Each separate privacy item should be its own entry

Return ONLY valid JSON:
{"items": [{"type": "phone", "cells": [[row, col], [row, col], ...]}, {"type": "face", "cells": [[row, col]]}]}
If nothing found: {"items": []}`
        : `You are a professional real estate photo enhancement AI. Analyze this property photo and recommend enhancement parameters.

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
                    ? `Scan this Korean real estate photo for privacy-sensitive content. The image is divided into a ${GRID_ROWS}x${GRID_COLS} grid (rows 0-${GRID_ROWS-1} top-to-bottom, cols 0-${GRID_COLS-1} left-to-right). Report which grid cells contain phone numbers, faces, or license plates. Be thorough - include all cells that overlap with sensitive content. Return JSON only.`
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
      return NextResponse.json(
        { error: 'API call failed', status: response.status },
        { status: 500 }
      );
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);

        if (mode === 'mosaic' && parsed.items && Array.isArray(parsed.items)) {
          const detections: any[] = [];

          for (const item of parsed.items) {
            if (!item.cells || !Array.isArray(item.cells) || item.cells.length === 0) continue;

            const validCells = item.cells.filter(
              (c: any) =>
                Array.isArray(c) &&
                c.length === 2 &&
                c[0] >= 0 && c[0] < GRID_ROWS &&
                c[1] >= 0 && c[1] < GRID_COLS
            );

            if (validCells.length === 0) continue;

            const rows = validCells.map((c: number[]) => c[0]);
            const cols = validCells.map((c: number[]) => c[1]);
            const minRow = Math.min(...rows);
            const maxRow = Math.max(...rows);
            const minCol = Math.min(...cols);
            const maxCol = Math.max(...cols);

            const pad = 0.2;
            detections.push({
              type: item.type || 'unknown',
              x: Math.max(0, minCol * CELL_W - CELL_W * pad),
              y: Math.max(0, minRow * CELL_H - CELL_H * pad),
              width: Math.min(100, (maxCol - minCol + 1) * CELL_W + CELL_W * pad * 2),
              height: Math.min(100, (maxRow - minRow + 1) * CELL_H + CELL_H * pad * 2),
              confidence: 0.9,
            });
          }

          console.log(
            '[MOSAIC-API] Grid detections:',
            detections.length,
            detections
              .map(
                (d: any) =>
                  d.type + '(' + d.x.toFixed(1) + ',' + d.y.toFixed(1) + ',' + d.width.toFixed(1) + 'x' + d.height.toFixed(1) + ')'
              )
              .join(', ')
          );

          return NextResponse.json({ detections });
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
