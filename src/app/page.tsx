import Link from 'next/link';
import { MapPin, ArrowRight, Building2, Home, Shield, Award } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { HomeListingCard } from '@/components/HomeListingCard';
import HeroBackground from '@/components/HeroBackground';
import RecommendedListings from '@/components/RecommendedListings';
import HeroSearchBar from '@/components/HeroSearchBar';
import PersonalizedHome from '@/components/PersonalizedHome';
import AIMatchFinder from '@/components/AIMatchFinder';
import HomeHeroInquiryCTA from '@/components/HomeHeroInquiryCTA';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Supabase에서 최신 매물 가져오기 (타임아웃 안전 처리)
  let latestListings: any[] = [];
  let allListings: any[] = [];
  let totalListings = 0;
  let availableDongs: string[] = [];

  try {
    const supabase = createClient();

    // 5초 타임아웃 래퍼
    const withTimeout = <T,>(promise: Promise<T>, ms = 5000): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    // ※ 저작권 보호 정책: 크롤링 매물(source_site NOT NULL)도 정보는 광고 노출
    //   HomeListingCard가 isAd 감지 시 사진을 WISHES 브랜드 플레이스홀더로 치환 → 저작권 차단
    //   자체 매물(source_site IS NULL) 우선 정렬, 그 다음 최신순
    const [listingsRes, allListingsRes, countRes, dongRes] = await Promise.allSettled([
      withTimeout(supabase
        .from('listings')
        .select('*, listing_images(url, alt, sort_order)')
        .eq('status', '공개')
        .order('source_site', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: false })
        .limit(6)),
      withTimeout(supabase
        .from('listings')
        .select('*, listing_images(url, alt, sort_order)')
        .eq('status', '공개')
        .order('source_site', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: false })
        .limit(50)),
      withTimeout(supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', '공개')),
      withTimeout(supabase
        .from('listings')
        .select('dong')
        .eq('status', '공개')
        .not('dong', 'is', null)
        .limit(500)),
    ]);

    if (listingsRes.status === 'fulfilled') latestListings = (listingsRes.value as any).data || [];
    if (allListingsRes.status === 'fulfilled') allListings = (allListingsRes.value as any).data || [];
    if (countRes.status === 'fulfilled') totalListings = (countRes.value as any).count || 0;
    if (dongRes.status === 'fulfilled') {
      const rows = (dongRes.value as any).data || [];
      availableDongs = [...new Set(rows.map((r: any) => r.dong).filter(Boolean) as string[])].sort() as string[];
    }
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
          <div className="space-y-5">
            <div className="inline-block px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
              <p className="text-sm font-medium text-white/80">위시스부동산 | 종합부동산 서비스</p>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight">
              당신의 꿈, 우리의<span className="text-wishes-accent"> 약속</span>
            </h1>

            <p className="text-base md:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed font-light">
              서울·경기 부동산 전문가가 최고의 매물을 찾아드립니다
            </p>
          </div>

          {/* 통합 검색바 */}
          <HeroSearchBar availableDongs={availableDongs} />

          {/* 보조 CTA */}
          <div className="flex items-center justify-center gap-4 pt-2 flex-wrap">
            <Link
              href="/map"
              className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors border-b border-white/30 hover:border-white pb-0.5"
            >
              <MapPin className="w-4 h-4" />
              지도에서 찾기
            </Link>
            <span className="text-white/30">·</span>
            <HomeHeroInquiryCTA />
            <span className="text-white/30">·</span>
            <Link
              href="/calculator"
              className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors border-b border-white/30 hover:border-white pb-0.5"
            >
              <Award className="w-4 h-4" />
              대출 계산기
            </Link>
          </div>
        </div>
      </section>

      {/* ━━━ 신뢰 지표 섹션 ━━━ */}
      <section className="relative -mt-16 pb-4 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-3 gap-4 md:gap-6 bg-white rounded-2xl shadow-xl p-6 md:p-8 border border-gray-100">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-wishes-secondary mb-1">
                <Building2 className="w-5 h-5" />
                <p className="text-2xl md:text-3xl font-bold text-wishes-primary">
                  {totalListings.toLocaleString('ko-KR')}
                </p>
              </div>
              <p className="text-xs md:text-sm text-wishes-muted">등록 매물</p>
            </div>
            <div className="text-center border-x border-gray-100">
              <div className="flex items-center justify-center gap-2 text-wishes-secondary mb-1">
                <MapPin className="w-5 h-5" />
                <p className="text-2xl md:text-3xl font-bold text-wishes-primary">서울·경기</p>
              </div>
              <p className="text-xs md:text-sm text-wishes-muted">전담 서비스 지역</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-wishes-secondary mb-1">
                <Shield className="w-5 h-5" />
                <p className="text-2xl md:text-3xl font-bold text-wishes-primary">공인중개사</p>
              </div>
              <p className="text-xs md:text-sm text-wishes-muted">WISHES 전담 상담</p>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ 시그니처 문구 ━━━ */}
      <div className="py-12 bg-wishes-primary/[0.03]">
        <p className="text-center text-sm md:text-base tracking-[0.15em] text-wishes-primary/40 font-light italic">
          May your wishes be the seeds that bloom into beautiful realities.
        </p>
      </div>

      {/* ━━━ T5-1: AI 매물 매칭 (자연어 → 필터) ━━━ */}
      <section className="py-10 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <AIMatchFinder />
        </div>
      </section>

      {/* ━━━ T3-1: 개인화 홈 (최근 본 + 저장 검색 기반) ━━━ */}
      <PersonalizedHome />

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