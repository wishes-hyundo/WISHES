import Link from 'next/link';
import { MapPin, Search, ArrowRight, Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { HomeListingCard } from '@/components/HomeListingCard';
import HeroBackground from '@/components/HeroBackground';
import RecommendedListings from '@/components/RecommendedListings';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Supabase에서 최신 매물 가져오기 (타임아웃 안전 처리)
  let latestListings: any[] = [];
  let allListings: any[] = [];

  try {
    const supabase = createClient();

    // 5초 타임아웃 래퍼
    const withTimeout = <T,>(promise: Promise<T>, ms = 5000): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    // ※ 저작권 보호: 크롤링 매물(source_site NOT NULL)은 "사진만" 차단, 정보는 광고 노출
    //   최신매물 & 추천은 사진이 있는 자체 매물만 우선 노출 (사진 없는 카드 방지)
    const [listingsRes, allListingsRes] = await Promise.allSettled([
      withTimeout(supabase
        .from('listings')
        .select('*, listing_images(url, alt, sort_order)')
        .eq('status', '공개')
        .is('source_site', null)
        .order('created_at', { ascending: false })
        .limit(6)),
      withTimeout(supabase
        .from('listings')
        .select('*, listing_images(url, alt, sort_order)')
        .eq('status', '공개')
        .is('source_site', null)
        .order('created_at', { ascending: false })
        .limit(50)),
    ]);

    if (listingsRes.status === 'fulfilled') latestListings = (listingsRes.value as any).data || [];
    if (allListingsRes.status === 'fulfilled') allListings = (allListingsRes.value as any).data || [];
  } catch (e) {
    // Supabase 연결 실패 시 빈 배열로 렌더링 (페이지는 정상 표시)
    console.error('Homepage Supabase error:', e);
  }

  return (
    <div className="pt-16 bg-wishes-bg">
      {/* ━━━ 프리미엄 히어로 섹션 ━━━ */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 pb-32 overflow-hidden">
        {/* 애니메이션 배경 */}
        <div className="absolute inset-0 bg-gradient-to-br from-wishes-primary via-wishes-primary to-wishes-secondary">
          <HeroBackground />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 text-center space-y-8 animate-fade-in-up">
          {/* 메인 타이틀 */}
          <div className="space-y-6">
            <div className="inline-block px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
              <p className="text-sm font-medium text-white/80">위시스부동산 | 종합부동산 서비스</p>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight">
              당신의 꿈, 우리의<span className="text-wishes-accent"> 약속</span>
            </h1>

            <p className="text-xl md:text-2xl text-white/70 max-w-3xl mx-auto leading-relaxed font-light">
              서울·경기 부동산 전문가가<br />
              <span className="text-white">최고의 매물을 찾아드립니다</span>
            </p>
          </div>

          {/* 빠른 검색 CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link
              href="/map"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-wishes-accent text-wishes-primary font-bold text-lg shadow-lg shadow-wishes-accent/30 hover:shadow-xl hover:shadow-wishes-accent/40 hover:scale-105 transition-all group"
            >
              <MapPin className="w-5 h-5 group-hover:scale-110 transition-transform" />
              지도로 검색
            </Link>
            <Link
              href="/listings"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/10 text-white font-bold text-lg border border-white/30 hover:bg-white/20 backdrop-blur-sm transition-all group"
            >
              <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
              매물 보기
            </Link>
          </div>
        </div>
      </section>

      {/* ━━━ 시그니처 문구 ━━━ */}
      <div className="py-12 bg-wishes-primary/[0.03]">
        <p className="text-center text-sm md:text-base tracking-[0.15em] text-wishes-primary/40 font-light italic">
          May your wishes be the seeds that bloom into beautiful realities.
        </p>
      </div>

      {/* ━━━ 맞춤 추천 매물 섹션 (로그인 사용자만) ━━━ */}
      <RecommendedListings allListings={allListings} />

      {/* ━━━ 최신 매물 섹션 ━━━ */}
      <section className="py-24 bg-wishes-bg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-12 animate-fade-in-up">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-wishes-primary">
                최신 매물
              </h2>
              <p className="text-wishes-muted mt-2">최신 등록 매물을 확인하세요</p>
            </div>
            <Link
              href="/listings"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-wishes-secondary text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all hidden md:flex"
            >
              더보기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {latestListings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
              {latestListings.map((listing: any, idx: number) => (
                <div key={listing.id} style={{ animationDelay: `${idx * 50}ms` }} className="animate-fade-in-up">
                  <HomeListingCard listing={listing} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">등록된 매물이 없습니다</p>
            </div>
          )}

          <div className="mt-12 text-center md:hidden">
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-wishes-secondary text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              더보기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}