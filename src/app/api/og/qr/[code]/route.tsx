/**
 * /api/og/qr/[code] — 단축 URL QR PNG (qrcode npm)
 * 위시스 로고 + 그래디언트 배경 + 정확한 QR
 */

import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'QR 생성 실패' }, { status: 500 });
  }
}
