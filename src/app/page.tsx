import Link from 'next/link';
import { MapPin, ArrowRight, Building2, Home, Shield, Store, LayoutGrid, Building } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { HomeListingCard } from '@/components/HomeListingCard';
import HeroBackground from '@/components/HeroBackground';
import HeroSearchBar from '@/components/HeroSearchBar';

export const dynamic = 'force-dynamic';

// 핵심 매물 카테고리 바로가기 (홈 → /listings 진입 단축)
const CATEGORY_SHORTCUTS = [
  { label: '원/투룸', query: '?property=원룸,투룸', icon: Home },
  { label: '아파트', query: '?property=아파트', icon: Building },
  { label: '오피스텔', query: '?property=오피스텔', icon: Building2 },
  { label: '빌라', query: '?property=빌라', icon: LayoutGrid },
  { label: '상가·사무실', query: '?property=상가,사무실', icon: Store },
];

export default async function HomePage() {
  let latestListings: any[] = [];
  let totalListings = 0;
  let availableDongs: string[] = [];

  try {
    const supabase = createClient();

    const withTimeout = <T,>(thenable: PromiseLike<T>, ms = 5000): Promise<T> =>
      Promise.race([
        Promise.resolve(thenable),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    // ※ 저작권 보호: 크롤링 매물(source_site NOT NULL)도 광고 노출,
    //   HomeListingCard가 isAd 감지 시 사진을 브랜드 플레이스홀더로 치환
    const [listingsRes, countRes, dongRes] = await Promise.allSettled([
      withTimeout(supabase
        .from('listings')
        .select('*, listing_images(url, alt, sort_order)')
        .eq('status', '공개')
        .order('source_site', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: false })
        .limit(6) as unknown as PromiseLike<any>),
      withTimeout(supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', '공개') as unknown as PromiseLike<any>),
      withTimeout(supabase
        .from('listings')
        .select('dong')
        .eq('status', '공개')
        .not('dong', 'is', null)
        .limit(500) as unknown as PromiseLike<any>),
    ]);

    if (listingsRes.status === 'fulfilled') latestListings = (listingsRes.value as any).data || [];
    if (countRes.status === 'fulfilled') totalListings = (countRes.value as any).count || 0;
    if (dongRes.status === 'fulfilled') {
      const rows = (dongRes.value as any).data || [];
      availableDongs = [...new Set(rows.map((r: any) => r.dong).filter(Boolean) as string[])].sort() as string[];
    }
  } catch (e) {
    console.error('Homepage Supabase error:', e);
  }

  return (
    <div className="pt-16 bg-wishes-bg">
      {/* ━━━ 히어로: 검색 직진 ━━━ */}
      <section className="relative flex items-center justify-center pt-16 pb-20 md:pt-20 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-wishes-primary via-wishes-primary to-wishes-secondary">
          <HeroBackground />
        </div>

        <div className="relative w-full max-w-5xl mx-auto px-4 text-center space-y-6 animate-fade-in-up">
          <div className="space-y-3">
            <div className="inline-block px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
              <p className="text-sm font-medium text-white/80">위시스부동산 | 서울·경기 전문</p>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              지금 찾는 매물, <span className="text-wishes-accent">한눈에</span>
            </h1>

            <p className="text-sm md:text-base text-white/70 max-w-xl mx-auto font-light">
              동·지하철역·단지로 바로 검색하세요
            </p>
          </div>

          {/* 강력한 통합 검색바 */}
          <HeroSearchBar availableDongs={availableDongs} />

          {/* 보조 진입: 지도 */}
          <div className="flex items-center justify-center pt-2">
            <Link
              href="/map"
              className="inline-flex items-center gap-1.5 text-sm text-white/90 hover:text-white transition-colors bg-white/10 hover:bg-white/20 border border-white/30 rounded-full px-5 py-2 backdrop-blur-sm"
            >
              <MapPin className="w-4 h-4" />
              지도에서 찾기
            </Link>
          </div>
        </div>
      </section>

      {/* ━━━ 카테고리 바로가기 ━━━ */}
      <section className="relative -mt-10 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 md:p-6">
            <div className="grid grid-cols-5 gap-2 md:gap-3">
              {CATEGORY_SHORTCUTS.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Link
                    key={cat.label}
                    href={`/listings${cat.query}`}
                    className="flex flex-col items-center justify-center gap-2 py-3 md:py-4 rounded-xl hover:bg-wishes-bg transition-colors"
                  >
                    <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-wishes-primary/5 flex items-center justify-center text-wishes-primary">
                      <Icon className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <span className="text-xs md:text-sm font-medium text-wishes-primary text-center leading-tight">
                      {cat.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ 신뢰 지표 ━━━ */}
      <section className="py-8 md:py-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-3 gap-3 md:gap-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-wishes-secondary mb-1">
                <Building2 className="w-4 h-4 md:w-5 md:h-5" />
                <p className="text-lg md:text-2xl font-bold text-wishes-primary">
                  {totalListings.toLocaleString('ko-KR')}
                </p>
              </div>
              <p className="text-xs md:text-sm text-wishes-muted">등록 매물</p>
            </div>
            <div className="text-center border-x border-gray-100">
              <div className="flex items-center justify-center gap-1.5 text-wishes-secondary mb-1">
                <MapPin className="w-4 h-4 md:w-5 md:h-5" />
                <p className="text-base md:text-xl font-bold text-wishes-primary">서울·경기</p>
              </div>
              <p className="text-xs md:text-sm text-wishes-muted">전담 지역</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-wishes-secondary mb-1">
                <Shield className="w-4 h-4 md:w-5 md:h-5" />
                <p className="text-base md:text-xl font-bold text-wishes-primary">공인중개사</p>
              </div>
              <p className="text-xs md:text-sm text-wishes-muted">전담 상담</p>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ 최신 매물 미리보기 ━━━ */}
      <section className="py-10 md:py-14 bg-wishes-bg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-end justify-between mb-6 md:mb-8">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-wishes-primary">최신 매물</h2>
              <p className="text-xs md:text-sm text-wishes-muted mt-1">방금 올라온 매물을 확인하세요</p>
            </div>
            <Link
              href="/listings"
              className="hidden md:inline-flex items-center gap-1.5 text-sm font-medium text-wishes-secondary hover:text-wishes-primary transition-colors"
            >
              전체보기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {latestListings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              {latestListings.map((listing: any) => (
                <HomeListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className="text-center py-14 bg-white rounded-xl border border-gray-200">
              <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">등록된 매물이 없습니다</p>
            </div>
          )}

          <div className="mt-8 text-center md:hidden">
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-wishes-secondary text-white font-semibold hover:shadow-lg transition-all"
            >
              전체보기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
