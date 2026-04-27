/**
 * /api/og/instagram/[id] (Phase 6 단계 2, Node runtime)
 * 매물 인스타 1080×1080 SNS 카드 — Satori (Next.js 내장)
 * Edge 대신 nodejs runtime 사용 (createServerClient 호환)
 */

import { ImageResponse } from 'next/og';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Params) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return new ImageResponse(
      (
        <div style={{ fontSize: 48, color: '#fff', background: '#2D5A27', width: 1080, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          잘못된 ID
        </div>
      ),
      { width: 1080, height: 1080 }
    );
  }

  const supabase = createServerClient();
  const { data: l } = await supabase
    .from('listings')
    .select('type, deal, address, dong, gu, area_m2, floor_current, rooms, deposit, monthly, price')
    .eq('id', Number(id))
    .maybeSingle();

  if (!l) {
    return new ImageResponse(
      (
        <div style={{ fontSize: 48, color: '#fff', background: '#2D5A27', width: 1080, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          매물 없음
        </div>
      ),
      { width: 1080, height: 1080 }
    );
  }

  const fmt = (n: number | null | undefined) => {
    if (n == null) return '-';
    if (n >= 10000) return `${(n / 10000).toFixed(1)}억`;
    return `${n.toLocaleString()}만`;
  };
  const priceLabel = l.deal === '월세'
    ? `${fmt(l.deposit)} / ${fmt(l.monthly)}`
    : fmt(l.price ?? l.deposit);
  const pyeong = l.area_m2 ? Math.round((l.area_m2 / 3.305) * 10) / 10 : null;
  const addr = [l.gu, l.dong, l.address].filter(Boolean).join(' ').slice(0, 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #2D5A27 0%, #1a3d18 100%)',
          color: '#fff',
          padding: 80,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 30, opacity: 0.95, display: 'flex' }}>
          {l.deal} · {l.type}
        </div>
        <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1.15, marginBottom: 40, color: '#fff', display: 'flex' }}>
          {priceLabel}
        </div>
        <div style={{ fontSize: 44, fontWeight: 600, marginBottom: 20, opacity: 0.9, display: 'flex' }}>
          {addr}
        </div>
        <div style={{ display: 'flex', gap: 30, fontSize: 36, opacity: 0.85 }}>
          {l.area_m2 ? <span>{l.area_m2}㎡ ({pyeong}평)</span> : null}
          {l.floor_current ? <span>{l.floor_current}층</span> : null}
          {l.rooms != null ? <span>방 {l.rooms}</span> : null}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 2, display: 'flex' }}>WISHES</div>
          <div style={{ fontSize: 28, opacity: 0.7, display: 'flex' }}>wishes.co.kr/listings/{id}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}
