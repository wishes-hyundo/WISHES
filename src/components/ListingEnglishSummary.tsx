'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ListingEnglishSummary (T3-4) — 상세 페이지 영문 요약 블록
//   - 외국인 임차 수요 타겟: 핵심 스펙만 영문 라벨로 한눈에 확인
//   - 접기/펼치기 지원 (기본: 접힘)
//   - 크롤링 매물(source_site 존재)은 렌더하지 않음 — 자체 매물 품질 보장
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState } from 'react';
import { Globe, ChevronDown, ChevronUp, MapPin, Home, Maximize, Building2, Layers, Car, DoorOpen, Dog } from 'lucide-react';

type Listing = {
  title?: string | null;
  deal?: string | null;         // '전세' | '월세' | '매매'
  type?: string | null;         // 원룸/투룸/아파트…
  deposit?: number | null;      // 만원
  monthly?: number | null;      // 만원
  price?: number | null;        // 만원 (매매)
  maintenance_fee?: number | null; // 만원
  area_m2?: number | null;
  area_supply_m2?: number | null;
  floor_current?: string | null;
  floor_total?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  direction?: string | null;
  parking?: boolean | null;
  elevator?: boolean | null;
  pet?: boolean | null;
  address?: string | null;
  dong?: string | null;
  available_date?: string | null;
  built_year?: string | null;
  source_site?: string | null;
};

// ── 한↔영 매핑 ──
const DEAL_EN: Record<string, string> = {
  '전세': 'Jeonse (Lump-sum Deposit)',
  '월세': 'Monthly Rent',
  '매매': 'For Sale',
};
const TYPE_EN: Record<string, string> = {
  '원룸': 'Studio',
  '1.5룸': '1.5 Rooms',
  '투룸': '2 Rooms',
  '쓰리룸': '3 Rooms',
  '쓰리룸+': '3+ Rooms',
  '복층': 'Loft / Duplex',
  '오피스텔': 'Officetel',
  '아파트': 'Apartment',
  '빌라': 'Villa / Low-rise',
  '상가': 'Commercial / Retail',
  '사무실': 'Office',
};
const DIRECTION_EN: Record<string, string> = {
  '동': 'East', '서': 'West', '남': 'South', '북': 'North',
  '남동': 'Southeast', '남서': 'Southwest', '북동': 'Northeast', '북서': 'Northwest',
};

// 만원 → KRW (숫자 + 1e4)
function toKrw(man?: number | null): string {
  if (!man) return '—';
  const won = man * 10000;
  return '₩' + won.toLocaleString('en-US');
}

// m² → ft² (1 m² = 10.7639 ft²)
function toSqft(m2?: number | null): string {
  if (!m2) return '—';
  const ft2 = Math.round(m2 * 10.7639);
  return `${m2.toFixed(1)} m² (${ft2.toLocaleString('en-US')} sqft)`;
}

function priceLine(listing: Listing): { label: string; value: string } {
  const deal = listing.deal || '';
  if (deal === '매매') {
    return { label: 'Price', value: toKrw(listing.price) };
  }
  if (deal === '전세') {
    return { label: 'Lump-sum Deposit', value: toKrw(listing.deposit) };
  }
  // 월세
  return {
    label: 'Deposit / Monthly Rent',
    value: `${toKrw(listing.deposit)} / ${toKrw(listing.monthly)}`,
  };
}

export default function ListingEnglishSummary({ listing }: { listing: Listing | null | undefined }) {
  const [open, setOpen] = useState(false);

  if (!listing) return null;
  // 크롤링 매물 — 영문 요약 미노출 (정보 품질 보장 못 함)
  if (listing.source_site) return null;

  const price = priceLine(listing);
  const typeEn = TYPE_EN[listing.type || ''] || listing.type || '—';
  const dealEn = DEAL_EN[listing.deal || ''] || listing.deal || '—';
  const floor = listing.floor_current && listing.floor_total
    ? `${listing.floor_current} / ${listing.floor_total}`
    : (listing.floor_current || '—');
  const amenities: string[] = [];
  if (listing.parking) amenities.push('Parking');
  if (listing.elevator) amenities.push('Elevator');
  if (listing.pet) amenities.push('Pets Allowed');

  return (
    <section
      className="bg-gradient-to-br from-wishes-primary/5 via-white to-wishes-secondary/5 rounded-xl border border-wishes-primary/20 overflow-hidden"
      aria-label="English Summary"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-wishes-primary/[0.04] transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-wishes-primary text-white text-[11px] font-bold">
            <Globe className="w-3.5 h-3.5" /> EN
          </span>
          <span className="text-sm font-bold text-gray-800">English Summary</span>
          <span className="text-xs text-gray-500 hidden sm:inline">Quick overview for international tenants</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-3">
          {/* Headline price */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1 font-semibold">
              {dealEn} · {typeEn}
            </div>
            <div className="text-xs text-gray-500 mb-0.5">{price.label}</div>
            <div className="text-xl font-extrabold text-wishes-primary">{price.value}</div>
            {listing.maintenance_fee ? (
              <div className="mt-1.5 text-[11px] text-gray-500">
                + Maintenance Fee: {toKrw(listing.maintenance_fee)} / month
              </div>
            ) : null}
          </div>

          {/* Specs grid */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <InfoRow icon={Maximize} label="Area" value={toSqft(listing.area_m2)} />
            <InfoRow icon={Layers} label="Floor" value={floor} />
            <InfoRow icon={Home} label="Rooms / Baths" value={`${listing.rooms ?? '—'} / ${listing.bathrooms ?? '—'}`} />
            <InfoRow icon={DoorOpen} label="Facing" value={DIRECTION_EN[listing.direction || ''] || listing.direction || '—'} />
            <InfoRow icon={Building2} label="Built Year" value={listing.built_year || '—'} />
            <InfoRow icon={MapPin} label="District" value={listing.dong || '—'} />
          </div>

          {/* Address (full) */}
          {listing.address && (
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1 font-semibold flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Address
              </div>
              <div className="text-sm text-gray-800 break-keep">{listing.address}</div>
            </div>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {amenities.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-semibold text-gray-700"
                >
                  {a === 'Parking' && <Car className="w-3 h-3" />}
                  {a === 'Pets Allowed' && <Dog className="w-3 h-3" />}
                  {a}
                </span>
              ))}
            </div>
          )}

          {/* Move-in date */}
          {listing.available_date && (
            <div className="text-xs text-gray-600">
              <span className="font-semibold text-gray-700">Available from:</span> {listing.available_date}
            </div>
          )}

          {/* Footer note */}
          <div className="text-[11px] text-gray-500 leading-relaxed pt-2 border-t border-gray-100">
            This summary is auto-translated for reference. Please contact our agent for an English-speaking consultation.
            Contract terms and legal documents are written in Korean.
          </div>
        </div>
      )}
    </section>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2.5 flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-wishes-primary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
        <div className="text-xs text-gray-800 font-medium truncate">{value}</div>
      </div>
    </div>
  );
}
