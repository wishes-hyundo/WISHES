'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SimilarListings — 매물 상세 "이 매물과 비슷한 매물" 섹션 (#39)
//
//   목적: 상세 페이지 하단에 유형/지역/가격대가 비슷한 매물을 3~4개 추천해
//          이탈 대신 다른 매물 탐색을 유도 (네모 벤치마크).
//
//   데이터 소스: /api/listings/[id]/recommend  (동일 gu/dong, ±30% 가격 등 스코어링)
//   렌더: 가로 스크롤 카드(모바일) · 2~4열 그리드(데스크톱)
//   스타일: 네모 톤 (가격 히어로 + ◆ 칩 체인 + 빨간 CTA 팔레트)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, Loader2 } from 'lucide-react';
import { sanitizeBuildingName } from '@/lib/sanitizeBuildingName';

interface SimilarListing {
  id: number;
  title: string;
  type: string;
  deal: string;
  deposit: number;
  monthly: number;
  price: number;
  area_m2: number;
  rooms: number;
  floor_current: number;
  floor_total: number;
  dong: string;
  address: string;
  building_name: string;
  elevator: boolean;
  parking: boolean;
  created_at: string;
  matchPercent: number;
  reasons: string[];
}

interface Props {
  listingId: number;
  dong?: string;
  /** 노출 개수 (기본 4) */
  limit?: number;
}

const sqmToPyeong = (m2: number) => (m2 > 0 ? (m2 / 3.3).toFixed(1) : null);

const formatAmount = (n: number) => {
  if (!n || n <= 0) return '-';
  if (n >= 10000) {
    const uk = Math.floor(n / 10000);
    const man = n % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString('ko-KR')}` : `${uk}억`;
  }
  return `${n.toLocaleString('ko-KR')}`;
};

const formatPrice = (l: SimilarListing): string => {
  if (l.deal === '매매') return formatAmount(l.price);
  if (l.deal === '전세') return formatAmount(l.deposit);
  return `${formatAmount(l.deposit)} / ${l.monthly || 0}`;
};

const getDealBadge = (deal: string) => {
  switch (deal) {
    case '전세': return 'bg-wishes-secondary text-white';
    case '월세': return 'bg-emerald-500 text-white';
    case '매매': return 'bg-wishes-accent text-white';
    default: return 'bg-gray-400 text-white';
  }
};

const formatFloorShort = (cur: number | null | undefined, total: number | null | undefined) => {
  if (!cur || cur <= 0) return null;
  if (total && total > 0) return `${cur}/${total}층`;
  return `${cur}층`;
};

export default function SimilarListings({ listingId, dong, limit = 4 }: Props) {
  const [items, setItems] = useState<SimilarListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`/api/listings/${listingId}/recommend`)
      .then(async (res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list: SimilarListing[] = (data?.recommendations || []).slice(0, limit);
        setItems(list);
      })
      .catch(() => {
        if (cancelled) return;
        setError('비슷한 매물을 불러오지 못했습니다.');
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [listingId, limit]);

  // 로딩 스켈레톤
  if (loading) {
    return (
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <header className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base md:text-lg font-extrabold text-wishes-primary flex items-center gap-2">
              이 매물과 비슷한 매물
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">유형 · 지역 · 가격대를 종합해 추천합니다</p>
          </div>
          <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
        </header>
        <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-100 bg-gray-50 aspect-[4/5]" />
          ))}
        </div>
      </section>
    );
  }

  if (error || items.length === 0) {
    // 에러/결과 없음 — 섹션 자체를 숨겨 빈 공간 방지
    return null;
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <header className="flex items-end justify-between px-5 pt-5 pb-3 gap-3">
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-extrabold text-wishes-primary flex items-center gap-2">
            이 매물과 비슷한 매물
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
            {dong ? `${dong} · ` : ''}같은 유형 · 비슷한 가격대 {items.length}건
          </p>
        </div>
        <Link
          href="/map"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-wishes-secondary hover:text-wishes-primary transition-colors"
        >
          전체 매물 <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      {/* 데스크톱 그리드 */}
      <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3 px-5 pb-5">
        {items.map((it) => (
          <SimilarCard key={it.id} item={it} />
        ))}
      </div>

      {/* 모바일 가로 스크롤 */}
      <div className="md:hidden px-5 pb-5">
        <div className="flex gap-3 overflow-x-auto -mx-1 px-1 snap-x snap-mandatory scrollbar-none">
          {items.map((it) => (
            <div key={it.id} className="snap-start shrink-0 w-[70%] max-w-[260px]">
              <SimilarCard item={it} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ━━━ 개별 카드 (네모 스타일: 가격 히어로 + ◆ 칩 체인) ━━━
function SimilarCard({ item }: { item: SimilarListing }) {
  const pyeong = sqmToPyeong(item.area_m2);
  const floor = formatFloorShort(item.floor_current, item.floor_total);
  const chips = [
    item.type,
    pyeong ? `${pyeong}평` : null,
    floor,
    item.dong,
  ].filter(Boolean) as string[];

  return (
    <Link
      href={`/listings/${item.id}`}
      className="group block h-full rounded-xl border border-gray-200 hover:border-wishes-secondary/50 bg-white hover:shadow-md transition-all overflow-hidden"
    >
      {/* 상단 배지 */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${getDealBadge(item.deal)}`}>
          {item.deal}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {item.matchPercent}% 매치
        </span>
      </div>

      {/* 가격 히어로 */}
      <div className="px-3 pb-2">
        <div className="text-[20px] md:text-[22px] font-extrabold text-wishes-primary leading-tight tabular-nums">
          {formatPrice(item)}
          <span className="text-[11px] font-semibold text-gray-500 ml-0.5">만</span>
        </div>
        <p className="text-xs text-gray-700 font-medium truncate mt-0.5">
          {/* #123 : 건물명 방어선 통과 시에만 사용 (크롤링 소스·슬로건·URL 차단) */}
          {sanitizeBuildingName(item.building_name) || item.title || item.dong}
        </p>
      </div>

      {/* ◆ 칩 체인 */}
      <div className="px-3 pb-2 flex items-center gap-1 text-[10px] text-gray-500 flex-wrap">
        {chips.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">◆</span>}
            <span>{c}</span>
          </span>
        ))}
      </div>

      {/* 하단 메타 */}
      <div className="px-3 pb-3 flex items-center justify-between text-[10px] text-gray-500">
        <span className="inline-flex items-center gap-1 truncate">
          <MapPin className="w-2.5 h-2.5" />
          <span className="truncate">{item.address || item.dong}</span>
        </span>
        <span className="font-semibold text-wishes-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          상세 →
        </span>
      </div>
    </Link>
  );
}
