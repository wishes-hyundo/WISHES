import Link from 'next/link';
import { MapPin, Search, ArrowRight, Building2, Shield, Users, Clock, Zap, CheckCircle } from 'lucide-react';
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

          {/* 통합 검색 바 (히어로 바로 아래) — 거래유형 + 키워드 직접 검색 */}
          <form
            action="/listings"
            method="GET"
            className="max-w-3xl mx-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-2 md:p-3 flex flex-col md:flex-row gap-2 pt-2"
          >
            <select
              name="deal"
              defaultValue=""
              className="px-4 py-3 rounded-xl border-0 bg-transparent text-wishes-primary font-semibold focus:outline-none focus:ring-2 focus:ring-wishes-accent/50 md:border-r md:border-gray-200"
            >
              <option value="">거래유형</option>
              <option value="전세">전세</option>
              <option value="월세">월세</option>
              <option value="매매">매매</option>
            </select>
            <input
              name="search"
              type="text"
              placeholder="지역·지하철·매물번호로 검색 (예: 신림동, 강남역, W-10819)"
              className="flex-1 px-4 py-3 rounded-xl border-0 bg-transparent text-wishes-primary placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-wishes-accent/50"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-wishes-accent text-wishes-primary font-bold hover:scale-105 transition-all shadow-lg"
            >
              <Search className="w-5 h-5" /> 검색
            </button>
          </form>

          {/* 빠른 검색 CTA (보조) */}
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

      {/* ━━━ 위시스 강점 / 서비스 특징 섹션 ━━━ */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-14 animate-fade-in-up">
            <h2 className="text-3xl md:text-4xl font-bold text-wishes-primary">
              위시스부동산을 선택하는 이유
            </h2>
            <p className="text-wishes-muted mt-3">
              서울·경기 부동산 법인 중개의 신뢰 · 경험 · 속도
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ServiceFeature
              icon={Shield}
              title="법인 중개의 안정성"
              desc="주식회사 위시스부동산중개법인(등록 제11620-2021-00078호)의 공식 계약. 안전거래와 책임시공을 약속합니다."
            />
            <ServiceFeature
              icon={Users}
              title="서울·경기 전 지역 커버"
              desc="관악 본사 기반으로 강남·서초·송파부터 경기 신도시까지 폭넓은 매물 네트워크를 보유합니다."
            />
            <ServiceFeature
              icon={Zap}
              title="AI 기반 빠른 매칭"
              desc="AI 상담 챗봇 · 맞춤 추천 · 지도 기반 정밀 검색으로 원하는 매물을 가장 빠르게 찾아드립니다."
            />
            <ServiceFeature
              icon={Building2}
              title="다양한 매물 유형"
              desc="원룸·투룸·오피스텔·아파트·상가·사무실까지 주거와 상업용 모두 한 번에 상담받으세요."
            />
            <ServiceFeature
              icon={Clock}
              title="신속한 상담 응답"
              desc="이메일 · 사이트 문의폼으로 접수된 상담은 영업일 기준 평균 1시간 이내 회신을 원칙으로 합니다."
            />
            <ServiceFeature
              icon={CheckCircle}
              title="실거래 기반 투명 가격"
              desc="국토부 실거래가 참조 시세 안내와 대출계산기로 투명하고 예측 가능한 거래를 지원합니다."
            />
          </div>
        </div>
      </section>

      {/* ━━━ 고객 후기 섹션 ━━━ */}
      <section className="py-24 bg-wishes-primary/[0.03]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-14 animate-fade-in-up">
            <h2 className="text-3xl md:text-4xl font-bold text-wishes-primary">
              고객 후기
            </h2>
            <p className="text-wishes-muted mt-3">
              실제 거래를 진행하신 고객님들의 생생한 리뷰입니다
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Testimonial
              name="김○○ 님"
              role="신림동 원룸 월세 계약"
              text="처음 서울 올라와서 막막했는데, 매물 3곳을 꼼꼼히 안내해주셔서 믿고 계약했습니다. 계약서 설명도 친절하셨어요."
            />
            <Testimonial
              name="박○○ 대표"
              role="강남 오피스 전세 계약"
              text="법인 사무실 옮기면서 급하게 알아봤는데, 필요한 조건에 딱 맞는 곳을 3일 만에 찾아주셨습니다. 감사합니다."
            />
            <Testimonial
              name="이○○ 님"
              role="경기 신도시 아파트 매매"
              text="자금 계획부터 등기까지 전 과정을 케어해주셨어요. 대출계산기 기능도 사전 시뮬레이션에 큰 도움이 됐습니다."
            />
          </div>
          <p className="text-center text-xs text-wishes-muted mt-8">
            ※ 개인정보 보호를 위해 고객명은 일부만 표기했습니다.
          </p>
        </div>
      </section>
    </div>
  );
}

function ServiceFeature({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="group relative p-8 rounded-2xl bg-white border border-gray-100 hover:border-wishes-secondary/20 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-br from-wishes-secondary/5 to-wishes-accent/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-wishes-secondary/10 to-wishes-accent/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
          <Icon className="w-7 h-7 text-wishes-secondary" />
        </div>
        <h3 className="text-lg font-bold text-wishes-primary mb-3">{title}</h3>
        <p className="text-sm text-wishes-muted leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function Testimonial({ name, role, text }: { name: string; role: string; text: string }) {
  return (
    <div className="p-6 rounded-2xl bg-white border border-gray-100">
      <div className="flex gap-1 mb-4">
        {[...Array(5)].map((_, i) => (
          <span key={i} className="text-wishes-accent">★</span>
        ))}
      </div>
      <p className="text-sm text-wishes-text leading-relaxed mb-4">&ldquo;{text}&rdquo;</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-wishes-secondary to-wishes-accent"></div>
        <div>
          <p className="font-semibold text-sm text-wishes-primary">{name}</p>
          <p className="text-xs text-wishes-muted">{role}</p>
        </div>
      </div>
    </div>
  );
}