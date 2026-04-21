'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { HomeListingCard } from '@/components/HomeListingCard';
import { Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface RecommendedListingsProps {
  allListings: any[];
}

export default function RecommendedListings({ allListings }: RecommendedListingsProps) {
  const { user, session } = useAuth();
  const [recommended, setRecommended] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileAreas, setProfileAreas] = useState<string[]>([]);
  const [profileTypes, setProfileTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!user || !session?.access_token) {
      setRecommended([]);
      return;
    }

    setLoading(true);
    fetch('/api/profile', {
      headers: { 'Authorization': 'Bearer ' + session.access_token },
    })
      .then(r => r.json())
      .then(profile => {
        const areas: string[] = profile.preferred_areas || [];
        const types: string[] = profile.preferred_types || [];
        setProfileAreas(areas);
        setProfileTypes(types);

        if (areas.length === 0 && types.length === 0) {
          setRecommended([]);
          setLoading(false);
          return;
        }

        // 프로필 기반 필터링
        const filtered = allListings.filter((listing: any) => {
          const matchArea = areas.length === 0 || areas.some(a =>
            (listing.dong || '').includes(a) ||
            (listing.address || '').includes(a) ||
            (listing.gu || '').includes(a)
          );
          const matchType = types.length === 0 || types.includes(listing.type);
          return matchArea || matchType;
        });

        // 점수 계산 후 정렬
        const scored = filtered.map((listing: any) => {
          let score = 0;
          if (areas.some(a => (listing.dong || '').includes(a) || (listing.address || '').includes(a) || (listing.gu || '').includes(a))) score += 2;
          if (types.includes(listing.type)) score += 1;
          return { ...listing, _score: score };
        });

        scored.sort((a: any, b: any) => b._score - a._score);
        setRecommended(scored.slice(0, 6));
        setLoading(false);
      })
      .catch((err) => {
        console.error('[RecommendedListings] 프로필 기반 추천 실패:', err);
        setLoading(false);
      });
  }, [user, session, allListings]);

  // 비로그인 또는 추천 결과 없으면 미표시
  if (!user || (recommended.length === 0 && !loading)) return null;

  return (
    <section className="py-24 bg-gradient-to-b from-wishes-secondary/5 to-wishes-bg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-12 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-wishes-secondary to-wishes-accent flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-wishes-primary">
                맞춤 추천 매물
              </h2>
              <p className="text-wishes-muted mt-1 text-sm">
                {profileAreas.length > 0 && profileTypes.length > 0
                  ? profileAreas.slice(0, 2).join(', ') + ' · ' + profileTypes.slice(0, 2).join(', ') + ' 기반 추천'
                  : profileAreas.length > 0
                  ? profileAreas.slice(0, 3).join(', ') + ' 지역 기반 추천'
                  : profileTypes.slice(0, 3).join(', ') + ' 유형 기반 추천'
                }
              </p>
            </div>
          </div>
          <Link
            href="/mypage"
            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-wishes-secondary hover:bg-wishes-secondary/10 transition-colors"
          >
            관심 설정 변경
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl bg-white border border-gray-100 overflow-hidden">
                <div className="aspect-[16/10] bg-gray-200" />
                <div className="p-4 space-y-3">
                  <div className="h-6 bg-gray-200 rounded w-1/2" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
            {recommended.map((listing: any, idx: number) => (
              <div key={listing.id} style={{ animationDelay: `${idx * 50}ms` }} className="animate-fade-in-up">
                <HomeListingCard listing={listing} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}