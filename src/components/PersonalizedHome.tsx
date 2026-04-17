'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PersonalizedHome (T3-1)
//   - 최근 본 매물 (wishes_recently_viewed localStorage)
//   - 저장 검색 기반 추천 (SavedSearchContext 1순위 저장 검색을 실행)
//   - 둘 다 없으면 렌더하지 않음 (홈 UI 노이즈 방지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, BookmarkCheck, ChevronRight, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useSavedSearch } from '@/contexts/SavedSearchContext';
import { ListingCard } from '@/components/ListingCard';

const RECENT_KEY = 'wishes_recently_viewed';

function stripCrawled(rows: any[]) {
  return rows.map((r: any) => (r.source_site ? { ...r, listing_images: [] } : r));
}

export default function PersonalizedHome() {
  const { searches } = useSavedSearch();
  const [recentListings, setRecentListings] = useState<any[]>([]);
  const [savedMatches, setSavedMatches] = useState<any[]>([]);
  const [savedLabel, setSavedLabel] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const cols =
      'id, title, deal, type, dong, address, deposit, monthly, price, area_m2, floor_current, status, source_site, created_at, listing_images(url, sort_order)';

    const run = async () => {
      // ── 최근 본 매물 ──
      let recentIds: number[] = [];
      try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        if (Array.isArray(raw)) {
          recentIds = raw
            .map((x: any) => (typeof x === 'number' ? x : typeof x?.id === 'number' ? x.id : parseInt(x, 10)))
            .filter((n: number) => Number.isFinite(n))
            .slice(0, 8);
        }
      } catch {}

      if (recentIds.length > 0) {
        const { data } = await supabase
          .from('listings')
          .select(cols)
          .in('id', recentIds)
          .eq('status', '공개');
        const ordered = recentIds
          .map((id) => (data || []).find((r: any) => r.id === id))
          .filter(Boolean);
        setRecentListings(stripCrawled(ordered).slice(0, 4));
      }

      // ── 저장 검색 1순위 실행 ──
      if (searches.length > 0) {
        const top = searches[0];
        setSavedLabel(top.label);
        let q: any = supabase.from('listings').select(cols).eq('status', '공개');
        const query = top.query || {};
        if (query.deal) q = q.eq('deal', query.deal);
        if (query.type) q = q.eq('type', query.type);
        if (query.dong) q = q.eq('dong', query.dong);
        if (query.maxDeposit) {
          const md = parseInt(query.maxDeposit, 10);
          if (query.deal === '매매') q = q.lte('price', md);
          else if (query.deal === '월세') q = q.lte('monthly', md);
          else q = q.lte('deposit', md);
        }
        if (query.minArea) q = q.gte('area_m2', parseInt(query.minArea, 10));
        if (query.businessType) q = q.ilike('business_type', '%' + query.businessType + '%');
        if (query.maxRightsFee) q = q.lte('rights_fee', parseInt(query.maxRightsFee, 10));
        if (query.cond) {
          const condSet = new Set(String(query.cond).split(',').filter(Boolean));
          if (condSet.has('pet')) q = q.eq('pet', true);
          if (condSet.has('fullOption')) q = q.eq('full_option', true);
          if (condSet.has('parking')) q = q.eq('parking', true);
          if (condSet.has('elevator')) q = q.eq('elevator', true);
          if (condSet.has('balcony')) q = q.eq('balcony', true);
        }
        q = q.order('created_at', { ascending: false }).limit(4);
        const { data } = await q;
        setSavedMatches(stripCrawled(data || []));
      }

      setLoading(false);
    };

    run();
  }, [searches]);

  // 로딩 중엔 틈없이 비노출 / 둘 다 비면 섹션 자체 렌더 안 함
  if (loading) return null;
  if (recentListings.length === 0 && savedMatches.length === 0) return null;

  const savedHref = (() => {
    if (!searches[0]) return '/listings';
    const params = new URLSearchParams(searches[0].query || {});
    return '/listings?' + params.toString();
  })();

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 space-y-14">
        {/* 헤더 */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-wishes-primary/10 text-wishes-primary text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" /> 내 맞춤 추천
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-wishes-primary">
            회원님께 맞춘 매물
          </h2>
        </div>

        {/* 저장 검색 기반 추천 */}
        {savedMatches.length > 0 && (
          <div>
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-wishes-secondary mb-1.5">
                  <BookmarkCheck className="w-3.5 h-3.5" /> 저장하신 검색 조건
                </div>
                <h3 className="text-lg font-bold text-wishes-primary">
                  {savedLabel || '최근 저장하신 조건'}
                </h3>
              </div>
              <Link
                href={savedHref}
                className="text-xs font-medium text-wishes-primary hover:underline inline-flex items-center gap-1"
              >
                전체 보기 <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {savedMatches.map((item: any) => (
                <ListingCard key={item.id} listing={item} />
              ))}
            </div>
          </div>
        )}

        {/* 최근 본 매물 */}
        {recentListings.length > 0 && (
          <div>
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-wishes-secondary mb-1.5">
                  <Clock className="w-3.5 h-3.5" /> 이어서 보기
                </div>
                <h3 className="text-lg font-bold text-wishes-primary">
                  최근 보신 매물
                </h3>
              </div>
              <Link
                href="/mypage?tab=recent"
                className="text-xs font-medium text-wishes-primary hover:underline inline-flex items-center gap-1"
              >
                전체 보기 <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentListings.map((item: any) => (
                <ListingCard key={item.id} listing={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
