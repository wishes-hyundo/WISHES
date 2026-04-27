/**
 * /admin/briefing/[id] — 매물 브리핑 페이지 (PDF 인쇄 친화)
 * 사장님이 브라우저에서 Cmd+P → PDF 저장 (즉시 사용)
 * Phase 6 추가 진행 시 Puppeteer 자동화 가능
 */

import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Listing = {
  id: number; type?: string|null; deal?: string|null;
  address?: string|null; dong?: string|null; gu?: string|null;
  area_m2?: number|null; area_supply_m2?: number|null;
  floor_current?: string|null; floor_total?: number|null;
  rooms?: number|null; bathrooms?: number|null;
  deposit?: number|null; monthly?: number|null; price?: number|null;
  direction?: string|null; heating_type?: string|null;
  built_year?: number|null; parking?: boolean|null; elevator?: boolean|null;
  description?: string|null; trust_score?: number|null;
  air_quality_avg?: number|null; school_zone_score?: number|null;
};

function fmt(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n >= 10000) return `${(n/10000).toFixed(1)}억`;
  return `${n.toLocaleString()}만원`;
}

export default async function Briefing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data } = await supabase.from('listings').select('*').eq('id', id).maybeSingle();
  const l = data as Listing | null;

  if (!l) return <div style={{ padding: 40 }}>매물 없음</div>;

  const pyeong = l.area_m2 ? Math.round(l.area_m2 / 3.305 * 10) / 10 : null;
  const priceLabel = l.deal === '월세'
    ? `보증금 ${fmt(l.deposit)} / 월세 ${fmt(l.monthly)}`
    : `${fmt(l.price ?? l.deposit)}`;

  return (
    <html lang="ko">
      <head>
        <title>매물 브리핑 #{id} — WISHES</title>
        <style>{`
          @page { size: A4; margin: 18mm; }
          body { font-family: 'GmarketSans', 'Pretendard', -apple-system, sans-serif; color: #222; margin: 0; padding: 0; }
          .head { background: linear-gradient(135deg, #2D5A27 0%, #1a3d18 100%); color: #fff; padding: 24px 32px; }
          .head h1 { margin: 0 0 8px; font-size: 28px; }
          .head .meta { opacity: 0.9; font-size: 14px; }
          .body { padding: 24px 32px; }
          .price { font-size: 32px; font-weight: 800; color: #2D5A27; margin: 16px 0; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin: 24px 0; }
          .row { display: flex; border-bottom: 1px solid #eee; padding: 8px 0; }
          .label { color: #666; min-width: 100px; font-size: 13px; }
          .val { font-size: 14px; font-weight: 600; }
          .desc { background: #f5f7f5; padding: 16px; border-radius: 6px; margin: 16px 0; line-height: 1.6; font-size: 13px; }
          .footer { background: #f8f8f8; padding: 16px 32px; font-size: 12px; color: #666; border-top: 2px solid #2D5A27; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; background: #FFF3E0; color: #E65100; font-size: 12px; font-weight: 700; margin-right: 8px; }
          .trust { background: #E8F5E9; color: #2D5A27; }
          @media print {
            .no-print { display: none !important; }
            .head { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        `}</style>
      </head>
      <body>
        <div className="head">
          <h1>{l.type} · {l.deal}</h1>
          <div className="meta">
            <span className="badge">{l.deal}</span>
            <span className="badge">{l.type}</span>
            {l.trust_score != null && <span className="badge trust">신뢰도 {l.trust_score}/100</span>}
          </div>
        </div>

        <div className="body">
          <div className="price">{priceLabel}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {[l.gu, l.dong, l.address].filter(Boolean).join(' ')}
          </div>

          <div className="grid">
            <div className="row"><span className="label">전용면적</span><span className="val">{l.area_m2 ? `${l.area_m2}㎡ (${pyeong}평)` : '-'}</span></div>
            <div className="row"><span className="label">공급면적</span><span className="val">{l.area_supply_m2 ? `${l.area_supply_m2}㎡` : '-'}</span></div>
            <div className="row"><span className="label">층</span><span className="val">{l.floor_current ? `${l.floor_current}/${l.floor_total ?? '-'}` : '-'}</span></div>
            <div className="row"><span className="label">방/욕실</span><span className="val">{l.rooms ?? '-'}/{l.bathrooms ?? '-'}</span></div>
            <div className="row"><span className="label">건축년도</span><span className="val">{l.built_year ?? '-'}</span></div>
            <div className="row"><span className="label">방향</span><span className="val">{l.direction ?? '-'}</span></div>
            <div className="row"><span className="label">난방</span><span className="val">{l.heating_type ?? '-'}</span></div>
            <div className="row"><span className="label">주차/엘리베이터</span><span className="val">{l.parking ? '주차 가능' : '-'} / {l.elevator ? '엘리베이터' : '-'}</span></div>
            <div className="row"><span className="label">학세권 점수</span><span className="val">{l.school_zone_score != null ? `${l.school_zone_score}/100` : '-'}</span></div>
            <div className="row"><span className="label">미세먼지</span><span className="val">{l.air_quality_avg != null ? `${l.air_quality_avg} ㎍/㎥` : '-'}</span></div>
          </div>

          {l.description && (
            <>
              <h3 style={{ margin: '24px 0 8px', color: '#2D5A27' }}>매물 설명</h3>
              <div className="desc">{l.description}</div>
            </>
          )}

          <div className="no-print" style={{ marginTop: 32, padding: 16, background: '#f0fdf4', borderRadius: 6, fontSize: 13 }}>
            💡 <strong>PDF 저장</strong>: 브라우저에서 <kbd>Cmd+P</kbd> (Mac) 또는 <kbd>Ctrl+P</kbd> (Windows) → 대상에서 "PDF 로 저장"
          </div>
        </div>

        <div className="footer">
          WISHES · wishes.co.kr/listings/{id} · 매물 ID #{id} · 생성: {new Date().toISOString().slice(0,10)}
        </div>
      </body>
    </html>
  );
}
