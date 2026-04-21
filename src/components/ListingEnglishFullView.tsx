'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ListingEnglishFullView (T5-6) — 상세 페이지 영문 전체 뷰
//   외국인 고객 브리핑용 풀-스크린 영문 모드
//   - 기본 스펙, 옵션/시설, 주변 교통, 가격 정보 전부 영문화
//   - 원문 설명(listing.description)은 한국어 그대로 + "Contact agent for English translation" 안내
//   - 크롤링 매물(source_site)은 사진 표시 차단 규칙을 그대로 계승
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  MapPin, Home, Maximize, Building2, Layers, Car, DoorOpen, Dog,
  Thermometer, Compass, Bath, Banknote, Train, Calendar, ShieldCheck, Globe, Info,
} from 'lucide-react';
import { sanitizeBuildingName } from '@/lib/sanitizeBuildingName';

export type EnListing = {
  id: number | string;
  title?: string | null;
  deal?: string | null;
  type?: string | null;
  status?: string | null;
  deposit?: number | null;
  monthly?: number | null;
  price?: number | null;
  maintenance_fee?: number | null;
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
  loan?: boolean | null;
  heating?: string | null;
  address?: string | null;
  dong?: string | null;
  gu?: string | null;
  available_date?: string | null;
  built_year?: string | null;
  move_in_date?: string | null;
  description?: string | null;
  source_site?: string | null;
  created_at?: string | null;
  building_name?: string | null;
};

export type EnNearbyStation = {
  name: string;
  line: string;
  distance: number;   // meters
  walkMin: number;
};

// ── Label dictionaries ────────────────────────────────────
const DEAL_EN: Record<string, string> = {
  '전세': 'Jeonse (Lump-sum Deposit Lease)',
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
  '단독주택': 'Detached House',
  '상가': 'Commercial / Retail',
  '사무실': 'Office',
  '상가주택': 'Mixed-use Building',
};
const DIRECTION_EN: Record<string, string> = {
  '동': 'East',
  '서': 'West',
  '남': 'South',
  '북': 'North',
  '남동': 'Southeast',
  '남서': 'Southwest',
  '북동': 'Northeast',
  '북서': 'Northwest',
  '동향': 'East-facing',
  '서향': 'West-facing',
  '남향': 'South-facing',
  '북향': 'North-facing',
};
const HEATING_EN: Record<string, string> = {
  '개별난방': 'Individual Heating',
  '중앙난방': 'Central Heating',
  '지역난방': 'District Heating',
  '도시가스': 'City Gas',
  '전기': 'Electric',
};
const STATUS_EN: Record<string, string> = {
  '공개': 'Available',
  '계약중': 'Under Contract',
  '계약완료': 'Leased / Sold',
};

// ── Formatters ────────────────────────────────────────────
// 만원 → human-readable KRW with M/B suffix
function toKrw(man?: number | null, compact = true): string {
  if (man == null || man === 0) return '—';
  const won = man * 10000;
  if (compact) {
    if (won >= 1e8) return `₩${(won / 1e8).toFixed(won % 1e8 === 0 ? 0 : 2).replace(/\.00$/, '')}B KRW`;
    if (won >= 1e6) return `₩${(won / 1e6).toFixed(won % 1e6 === 0 ? 0 : 1).replace(/\.0$/, '')}M KRW`;
  }
  return '₩' + won.toLocaleString('en-US');
}

function toSqft(m2?: number | null): string {
  if (m2 == null) return '—';
  const ft2 = Math.round(m2 * 10.7639);
  return `${m2.toFixed(1)} m² (${ft2.toLocaleString('en-US')} sqft)`;
}

function priceHeadline(listing: EnListing): { label: string; value: string; sub?: string } {
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
    value: `${toKrw(listing.deposit)} / ${toKrw(listing.monthly, false)}`,
    sub: 'monthly',
  };
}

function formatMeters(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ── Component ─────────────────────────────────────────────
export default function ListingEnglishFullView({
  listing,
  stations,
  onExit,
}: {
  listing: EnListing;
  stations?: EnNearbyStation[];
  onExit?: () => void;
}) {
  const price = priceHeadline(listing);
  const typeEn = TYPE_EN[listing.type || ''] || listing.type || '—';
  const dealEn = DEAL_EN[listing.deal || ''] || listing.deal || '—';
  const statusEn = STATUS_EN[listing.status || ''] || listing.status || '—';
  const floor = listing.floor_current && listing.floor_total
    ? `${listing.floor_current} / ${listing.floor_total}F`
    : (listing.floor_current ? `${listing.floor_current}F` : '—');
  const dirEn = DIRECTION_EN[listing.direction || ''] || listing.direction || '—';
  const heatEn = HEATING_EN[listing.heating || ''] || listing.heating || '—';

  const amenities: string[] = [];
  if (listing.parking) amenities.push('Parking');
  if (listing.elevator) amenities.push('Elevator');
  if (listing.pet) amenities.push('Pets Allowed');
  if (listing.loan) amenities.push('Loan-friendly');

  return (
    <div className="space-y-5" data-lang="en">
      {/* ── EN Mode Banner ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-wishes-primary text-white shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-4 h-4 shrink-0" />
          <span className="text-sm font-bold truncate">
            English Mode · Information sheet for international clients
          </span>
        </div>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="shrink-0 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-[11px] font-semibold transition-colors"
          >
            한국어로 보기
          </button>
        )}
      </div>

      {/* ── Headline Card ── */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-br from-wishes-primary/10 via-white to-wishes-secondary/5 border-b border-gray-100">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-wishes-primary">
            <span className="inline-flex px-2 py-0.5 rounded-full bg-wishes-primary text-white">{dealEn}</span>
            <span>·</span>
            <span>{typeEn}</span>
            <span>·</span>
            <span className="text-gray-500">{statusEn}</span>
          </div>
          <h2 className="mt-2 text-lg sm:text-xl font-bold text-wishes-primary">
            {listing.dong || listing.gu || ''} {typeEn}
          </h2>
          {/* #123 : 건물명 방어선 통과 시에만 노출 (크롤링 소스·슬로건·URL 차단) */}
          {sanitizeBuildingName(listing.building_name) && (
            <div className="text-sm text-gray-600 mt-0.5">{sanitizeBuildingName(listing.building_name)}</div>
          )}
        </div>

        <div className="px-5 py-5">
          <div className="text-xs text-gray-500 font-semibold mb-1">{price.label}</div>
          <div className="text-2xl sm:text-3xl font-extrabold text-wishes-primary">
            {price.value}
            {price.sub && <span className="ml-1.5 text-xs font-semibold text-gray-500">/ {price.sub}</span>}
          </div>
          {listing.maintenance_fee ? (
            <div className="mt-1.5 text-xs text-gray-500">
              + Maintenance Fee: {toKrw(listing.maintenance_fee)} / month
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Property Specs ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
          <Home className="w-4 h-4 text-wishes-primary" /> Property Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <InfoRow icon={Maximize} label="Exclusive Area" value={toSqft(listing.area_m2)} />
          {listing.area_supply_m2 && (
            <InfoRow icon={Maximize} label="Supply Area" value={toSqft(listing.area_supply_m2)} />
          )}
          <InfoRow icon={Layers} label="Floor" value={floor} />
          <InfoRow icon={Home} label="Rooms / Baths" value={`${listing.rooms ?? '—'} / ${listing.bathrooms ?? '—'}`} />
          <InfoRow icon={Compass} label="Direction" value={dirEn} />
          <InfoRow icon={Thermometer} label="Heating" value={heatEn} />
          <InfoRow icon={Building2} label="Built Year" value={listing.built_year || '—'} />
          <InfoRow
            icon={Calendar}
            label="Available From"
            value={listing.available_date || listing.move_in_date || 'Immediately'}
          />
          {listing.dong && <InfoRow icon={MapPin} label="District" value={[listing.gu, listing.dong].filter(Boolean).join(' ')} />}
          <InfoRow icon={Bath} label="Bathrooms" value={String(listing.bathrooms ?? '—')} />
        </div>

        {listing.address && (
          <div className="mt-4 px-3.5 py-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Full Address
            </div>
            <div className="text-sm text-gray-800 break-keep">{listing.address}</div>
          </div>
        )}
      </section>

      {/* ── Amenities ── */}
      {amenities.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-wishes-primary" /> Facilities &amp; Amenities
          </h3>
          <div className="flex flex-wrap gap-2">
            {amenities.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-wishes-primary/[0.06] border border-wishes-primary/20 text-xs font-semibold text-wishes-primary"
              >
                {a === 'Parking' && <Car className="w-3 h-3" />}
                {a === 'Elevator' && <Building2 className="w-3 h-3" />}
                {a === 'Pets Allowed' && <Dog className="w-3 h-3" />}
                {a === 'Loan-friendly' && <Banknote className="w-3 h-3" />}
                {a}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Transit ── */}
      {stations && stations.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
            <Train className="w-4 h-4 text-wishes-primary" /> Nearby Subway Stations
          </h3>
          <div className="space-y-2">
            {stations.map((s, idx) => (
              <div
                key={`${s.name}-${idx}`}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-gray-200 hover:border-wishes-primary/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-wishes-primary/10 text-wishes-primary text-[11px] font-bold shrink-0">
                    {s.line}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 truncate">{s.name} Station</span>
                </div>
                <div className="text-xs text-gray-500 shrink-0 tabular-nums">
                  {formatMeters(s.distance)} · ~{s.walkMin} min walk
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Original Description (KR) ── */}
      {listing.description && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-wishes-primary" /> Agent's Notes
            </h3>
            <span className="text-[10px] uppercase tracking-wide font-bold text-gray-500">
              Original in Korean
            </span>
          </div>
          <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap break-keep">
            {listing.description}
          </div>
          <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
            The above note is written in Korean by the listing agent. For an English walkthrough,
            please contact us — we'll prepare a tailored English briefing.
          </div>
        </section>
      )}

      {/* ── Footer Disclaimer ── */}
      <div className="text-[11px] text-gray-500 leading-relaxed pt-3 pb-1 px-2">
        <strong className="text-gray-700">Disclaimer.</strong>{' '}
        This English information sheet is provided for reference and is auto-translated from the Korean
        listing record. All contracts, lease agreements, and legal documents will be executed in Korean.
        WISHES Real Estate will provide an interpreter or English-speaking agent on request.
        Listing ID: {listing.id}.
      </div>
    </div>
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
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50/30">
      <Icon className="w-4 h-4 text-wishes-primary mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{label}</div>
        <div className="text-sm text-gray-900 font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}
