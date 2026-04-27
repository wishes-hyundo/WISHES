/**
 * /admin/briefing/[id] (Phase 6 단계 3)
 * 매물 PDF 인쇄 친화 페이지 — Server Component
 * 표준 root layout 사용. 브라우저 Cmd+P → PDF 저장
 */

import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ListingRow {
  id: number;
  type: string | null; deal: string | null;
  address: string | null; dong: string | null; gu: string | null;
  area_m2: number | null; area_supply_m2: number | null;
  floor_current: string | null; floor_total: number | null;
  rooms: number | null; bathrooms: number | null;
  deposit: number | null; monthly: number | null; price: number | null;
  direction: string | null; heating_type: string | null;
  built_year: number | null; parking: boolean | null; elevator: boolean | null;
  description: string | null; trust_score: number | null;
  air_quality_avg: number | null; school_zone_score: number | null;
}

function fmt(n: number | null): string {
  if (n == null) return '-';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`;
  return `${n.toLocaleString()}만원`;
}

export default async function Briefing(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!/^\d+$/.test(id)) {
    return <div style={{ padding: 40 }}>잘못된 매물 ID</div>;
  }

  const supabase = createServerClient();
  const { data } = await supabase.from('listings').select('*').eq('id', Number(id)).maybeSingle();
  const l = data as ListingRow | null;
  if (!l) return <div style={{ padding: 40 }}>매물 없음</div>;

  const pyeong = l.area_m2 ? Math.round((l.area_m2 / 3.305) * 10) / 10 : null;
  const priceLabel = l.deal === '월세'
    ? `보증금 ${fmt(l.deposit)} / 월세 ${fmt(l.monthly)}`
    : fmt(l.price ?? l.deposit);

  return (
    <div style={{ fontFamily: 'GmarketSans, Pretendard, -apple-system, sans-serif', color: '#222', maxWidth: 800, margin: '0 auto' }}>
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{ background: 'linear-gradient(135deg, #2D5A27 0%, #1a3d18 100%)', color: '#fff', padding: '24px 32px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>{l.type} · {l.deal}</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>
          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.18)', marginRight: 8, fontSize: 12, fontWeight: 700 }}>{l.deal}</span>
          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.18)', marginRight: 8, fontSize: 12, fontWeight: 700 }}>{l.type}</span>
          {l.trust_score != null && (
            <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: 700 }}>신뢰도 {l.trust_score}/100</span>
          )}
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#2D5A27', margin: '16px 0' }}>{priceLabel}</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {[l.gu, l.dong, l.address].filter(Boolean).join(' ')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', margin: '24px 0' }}>
          {[
            ['전용면적', l.area_m2 ? `${l.area_m2}㎡ (${pyeong}평)` : '-'],
            ['공급면적', l.area_supply_m2 ? `${l.area_supply_m2}㎡` : '-'],
            ['층', l.floor_current ? `${l.floor_current}/${l.floor_total ?? '-'}` : '-'],
            ['방/욕실', `${l.rooms ?? '-'}/${l.bathrooms ?? '-'}`],
            ['건축년도', l.built_year ?? '-'],
            ['방향', l.direction ?? '-'],
            ['난방', l.heating_type ?? '-'],
            ['주차/엘리베이터', `${l.parking ? '주차 가능' : '-'} / ${l.elevator ? '엘리베이터' : '-'}`],
            ['학세권 점수', l.school_zone_score != null ? `${l.school_zone_score}/100` : '-'],
            ['미세먼지 PM2.5', l.air_quality_avg != null ? `${l.air_quality_avg} ㎍/㎥` : '-'],
          ].map(([label, val]) => (
            <div key={String(label)} style={{ display: 'flex', borderBottom: '1px solid #eee', padding: '8px 0' }}>
              <span style={{ color: '#666', minWidth: 100, fontSize: 13 }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{String(val)}</span>
            </div>
          ))}
        </div>

        {l.description && (
          <>
            <h3 style={{ margin: '24px 0 8px', color: '#2D5A27' }}>매물 설명</h3>
            <div style={{ background: '#f5f7f5', padding: 16, borderRadius: 6, lineHeight: 1.6, fontSize: 13 }}>
              {l.description}
            </div>
          </>
        )}

        <div className="no-print" style={{ marginTop: 32, padding: 16, background: '#f0fdf4', borderRadius: 6, fontSize: 13 }}>
          💡 <strong>PDF 저장</strong>: 브라우저에서 <kbd>Cmd+P</kbd> (Mac) 또는 <kbd>Ctrl+P</kbd> (Windows) → 대상에서 PDF 로 저장
        </div>
      </div>

      <div style={{ background: '#f8f8f8', padding: '16px 32px', fontSize: 12, color: '#666', borderTop: '2px solid #2D5A27' }}>
        WISHES · wishes.co.kr/listings/{id} · 매물 ID #{id} · 생성: {new Date().toISOString().slice(0, 10)}
      </div>
    </div>
  );
}
