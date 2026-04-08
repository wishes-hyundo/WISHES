'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TrendingUp, Check, ArrowRight } from 'lucide-react';
import { getFormattedPrice, getDealColor, sqmToPyeong } from '@/lib/utils';

interface RecommendedListing {
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

interface SmartRecommendationsProps {
  listingId: number;
  dong: string;
}

export default function SmartRecommendations({ listingId, dong }: SmartRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<RecommendedListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!listingId) return;

    const fetchRecommendations = async () => {
      try {
        const res = await fetch(`/api/listings/${listingId}/recommend`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setRecommendations(data.recommendations || []);
      } catch (err) {
        console.error('[SmartRecommendations]', err);
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [listingId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-wishes-primary mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          AI 스마트 추천
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse bg-gray-100 rounded-lg h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-wishes-primary mb-1 flex items-center gap-2">
        <TrendingUp className="w-5 h-5" />
        AI 스마트 추천
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        유형 · 가격 · 지역 · 면적 · 옵션을 종합 분석하여 추천합니다
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {recommendations.map((item) => {
          const dealColor = getDealColor(item.deal);
          const dep = item.deposit || 0;
          const mon = item.monthly || 0;
          const prc = item.price || 0;
          let priceText = "";
          if (item.deal === "매매") {
            priceText = prc >= 10000 ? (prc / 10000).toFixed(prc % 10000 === 0 ? 0 : 1) + "억" : prc > 0 ? prc + "만" : "가격문의";
          } else if (item.deal === "전세") {
            priceText = dep >= 10000 ? (dep / 10000).toFixed(dep % 10000 === 0 ? 0 : 1) + "억" : dep > 0 ? dep + "만" : "가격문의";
          } else {
            const depStr = dep >= 10000 ? (dep / 10000).toFixed(dep % 10000 === 0 ? 0 : 1) + "억" : dep > 0 ? dep + "만" : "0";
            priceText = depStr + "/" + mon + "만";
          }

          return (
            <Link
              key={item.id}
              href={`/listings/${item.id}`}
              className="group block bg-gray-50 hover:bg-wishes-bg/80 rounded-lg p-4 border border-gray-100 hover:border-wishes-primary/30 transition-all duration-200 hover:shadow-md"
            >
              {/* Match Badge */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: item.matchPercent >= 70 ? '#2D5A27' : item.matchPercent >= 50 ? '#5A8F3C' : '#8B9E6B' }}
                >
                  {item.matchPercent}% 일치
                </span>
                <span className="text-[10px] text-gray-400">
                  {item.dong}
                </span>
              </div>

              {/* Type & Deal */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-600">{item.type}</span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white"
                  style={{ backgroundColor: dealColor }}
                >
                  {item.deal}
                </span>
              </div>

              {/* Price */}
              <div className="text-base font-extrabold mb-2" style={{ color: dealColor }}>
                {priceText}
              </div>

              {/* Details */}
              <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2">
                {item.area_m2 > 0 && <span>{sqmToPyeong(item.area_m2)}평</span>}
                {item.floor_current > 0 && <span>· {item.floor_current}층</span>}
                {item.rooms > 0 && <span>· {item.rooms}방</span>}
                {item.parking && <span>· 🅿️</span>}
              </div>

              {/* Match Reasons */}
              <div className="space-y-0.5">
                {item.reasons.map((reason, idx) => (
                  <div key={idx} className="flex items-center gap-1 text-[10px] text-wishes-primary">
                    <Check className="w-3 h-3 flex-shrink-0" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-2 flex items-center justify-end text-[11px] text-wishes-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                상세보기 <ArrowRight className="w-3 h-3 ml-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
