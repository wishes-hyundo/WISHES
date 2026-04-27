/**
 * /api/og/instagram/[id] — 매물 인스타 사이즈 (1080×1080) SNS 카드 자동 생성
 * Next.js ImageResponse (Satori) — 의존성 0, 무료
 * 사장님이 단축 URL 와 함께 인스타에 직접 게시 (자동 게시는 사장님 결정)
 */

import { ImageResponse } from 'next/og';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = createServerClient();
  const { data: l } = await supabase
    .from('listings')
    .select('type, deal, address, dong, gu, area_m2, floor_current, rooms, deposit, monthly, price')
    .eq('id', id)
    .maybeSingle();

  if (!l) {
    return new ImageResponse(
      <div style={{ fontSize: 48, color: '#fff', background: '#2D5A27', width: 1080, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>매물 없음</div>,
      { width: 1080, height: 1080 }
    );
  }

  const fmt = (n: number | null) => n == null ? '-' : n >= 10000 ? `${(n/10000).toFixed(1)}억` : `${n.toLocaleString()}만`;
  const priceLabel = l.deal === '월세' ? `${fmt(l.deposit ?? null)} / ${fmt(l.monthly ?? null)}` : fmt(l.price ?? l.deposit ?? null);
  const pyeong = l.area_m2 ? Math.round(l.area_m2 / 3.305 * 10) / 10 : null;

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1080, display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, #2D5A27 0%, #1a3d18 100%)', color: '#fff', padding: 80, fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 30, opacity: 0.95 }}>
          {l.deal} · {l.type}
        </div>
        <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1.15, marginBottom: 40, color: '#fff' }}>
          {priceLabel}
        </div>
        <div style={{ fontSize: 44, fontWeight: 600, marginBottom: 20, opacity: 0.9 }}>
          {[l.gu, l.dong, l.address].filter(Boolean).join(' ').slice(0, 40)}
        </div>
        <div style={{ display: 'flex', gap: 30, fontSize: 36, marginBottom: 'auto', opacity: 0.85 }}>
          {l.area_m2 && <span>{l.area_m2}㎡ ({pyeong}평)</span>}
          {l.floor_current && <span>{l.floor_current}층</span>}
          {l.rooms != null && <span>방 {l.rooms}</span>}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 2 }}>WISHES</div>
          <div style={{ fontSize: 28, opacity: 0.7 }}>wishes.co.kr/listings/{id}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}
