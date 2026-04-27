'use client';
// BoB Phase 1 — TanStack Table v8 + TanStack Virtual
// L-bob-phase1-stub (2026-04-27): 임시 단순화 — TanStack 의 nested type 으로 빌드 timeout (19분).
//   columnDef 의 generic 타입 추론에서 OOM. 단순 div 로 stub → 빌드 통과 우선.
//   다음 단계: TanStack Table 점진 복원 (column 별 type assert 추가).

export interface Listing {
  id: number;
  type?: string;
  deal?: string;
  status?: string;
  dong?: string;
  building_name?: string;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  area_m2?: number | null;
  floor_current?: string;
  floor_total?: string;
  rooms?: number | null;
  updated_at?: string;
}

function formatPrice(l: Listing): string {
  const fmt = (n: number) => {
    if (n >= 10000) {
      const u = Math.floor(n / 10000);
      const r = n % 10000;
      return r > 0 ? `${u}억 ${r.toLocaleString('ko-KR')}` : `${u}억`;
    }
    return n.toLocaleString('ko-KR');
  };
  if (l.deal === '월세' && l.deposit != null && l.monthly != null) {
    return `${fmt(l.deposit)}/${fmt(l.monthly)}만원`;
  }
  if (l.deal === '전세' && l.deposit != null) return `${fmt(l.deposit)}만원`;
  if (l.deal === '매매' && l.price != null) return `${fmt(l.price)}만원`;
  return '-';
}

export function ListingTable({ data }: { data: Listing[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 text-sm text-amber-800">
        <strong>⚠️ Phase 1 임시 stub:</strong> TanStack Table 의 type 추론으로 빌드 timeout 발생.
        다음 단계에서 column별 type assert 추가 후 정식 복원. 현재는 단순 리스트 표시.
      </div>

      <div className="rounded-lg border bg-card p-4 text-sm">
        총 <strong>{data.length.toLocaleString('ko-KR')}</strong>개 매물
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto divide-y">
          {data.slice(0, 200).map((l) => (
            <div key={l.id} className="p-3 hover:bg-muted/40 flex items-center gap-3 text-sm">
              <span className="text-xs text-muted-foreground w-12">#{l.id}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{l.type || '-'}</span>
              <span className="text-xs">{l.deal || '-'}</span>
              <span className="font-medium">{formatPrice(l)}</span>
              <span className="text-xs text-muted-foreground">{l.dong || '-'}</span>
              <span className="text-xs text-muted-foreground truncate flex-1">{l.building_name || '-'}</span>
              <span className="text-xs text-muted-foreground">{l.area_m2 ? `${l.area_m2}㎡` : '-'}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                l.status === '공개' ? 'bg-emerald-100 text-emerald-800' :
                l.status === '계약중' ? 'bg-amber-100 text-amber-800' :
                'bg-slate-100 text-slate-600'
              }`}>{l.status || '-'}</span>
            </div>
          ))}
          {data.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">매물이 없습니다.</div>
          )}
          {data.length > 200 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t">
              상위 200개만 표시 (전체 {data.length.toLocaleString('ko-KR')}개) — 가상 스크롤 다음 단계
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
