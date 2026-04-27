/**
 * /api/og/qr/[code] — 단축 URL QR 코드 PNG (의존성 0, Satori 활용)
 * 단순 텍스트 QR 표시 (실제 QR 라이브러리 추가 시 더 정확)
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const url = `https://wishes.me/${code}`;

  // QR 라이브러리 없이 placeholder. 추후 qrcode npm 추가 시 PNG 직접 생성
  // 현재: URL + 안내 텍스트 카드
  return new ImageResponse(
    (
      <div style={{ width: 400, height: 400, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '4px solid #2D5A27', padding: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#2D5A27' }}>WISHES</div>
        <div style={{ width: 280, height: 280, background: '#000', margin: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>
          QR 코드 위치 (placeholder)
        </div>
        <div style={{ fontSize: 16, color: '#333', wordBreak: 'break-all' }}>{url}</div>
      </div>
    ),
    { width: 400, height: 400 }
  );
}
