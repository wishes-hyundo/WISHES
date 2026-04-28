/**
 * /api/og/qr/[code] (Phase 6 단계 4)
 * 단축 URL QR PNG (qrcode npm)
 */

import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!/^[0-9A-Za-z_-]{4,32}$/.test(code)) {
    return NextResponse.json({ error: 'invalid code' }, { status: 400 });
  }
  const url = `https://wishes.me/${code}`;

  try {
    const png = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'M',
      type: 'png',
      width: 400,
      margin: 2,
      color: { dark: '#2D5A27', light: '#FFFFFF' },
    });
    return new NextResponse(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'QR 생성 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
