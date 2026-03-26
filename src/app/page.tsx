import Link from 'next/link';
import { MapPin, Search, ArrowRight, Building2, Calendar, UserCheck, ShieldCheck, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { HomeListingCard } from '@/components/HomeListingCard';

export default async function HomePage() {
  // Supabase에서 최신 매물 6건 가져오기
  const supabase = createClient();
  const { data: listings } = await supabase
    .from('listings')
    .select('*, listing_images(url, alt, sort_order)')
    .eq('status', '가용')
    .order('created_at', { ascending: false })
    .limit(6);

  const latestListings = listings || [];

  return (
    <div className="pt-16 bg-wishes-bg">
      {/* 히어로 섹션 */}
      <section className="relative min-h-[80vh] flex items-center justify-center pt-12 pb-28 overflow-hidden">
        {/* 배경 */}
        <div className="absolute inset-0 bg-gradient-to-b from-wishes-primary to-[#162044]">
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </div>

        {/* 배경 장식 */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-wishes-secondary/8 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-wishes-accent/6 rounded-full blur-[120px]"></div>

        <div className="relative max-w-4xl mx-auto px-4 text-center space-y-10 animate-fade-in-up">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/[0.07] border border-white/[0.12] backdrop-blur-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-wishes-accent animate-pulse"></div>
              <p className="text-sm font-medium text-white/70 tracking-wide">서울·경기 종합부동산 서비스</p>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.15] tracking-tight">
              당신의 꾿,<br className="sm:hidden" /> 우리의<span className="text-wishes-accent"> 약속</span>
            </h1>

            <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
              15년 경험의 부동산 전문가가<br />
              <span className="text-white/80">최적의 매물을 찾아드립니다</span>
            </p>
          </div>

          {/* CTA 버튼 */}
          <div className="flex flex-col sm:flex-row gap-3.5 justify-center pt-2">
            <Link
              href="/map"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-wishes-accent text-wishes-primary font-bold text-base shadow-lg shadow-wishes-accent/25 hover:shadow-xl hover:shadow-wishes-accent/35 hover:brightness-110 transition-all duration-200 group"
            >
              <MapPin className="w-5 h-5" />
              지도로 검색
            </Link>
            <Link
              href="/listings"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-white/[0.08] text-white font-bold text-base border border-white/[0.15] hover:bg-white/[0.14] backdrop-blur-sm transition-all duration-200 group"
            >
              <Search className="w-5 h-5" />
              매물 보기
            </Link>
          </div>
        </div>
      </section>

      {/* 신뢰 배지 섹션 */}
      <section className="max-w-4xl mx-auto px-4 -mt-14 relative z-10 mb-20 animate-fade-in-up">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[
            { Icon: Calendar, label: '15년 경력', desc: '신뢰의 기록' },
            { Icon: UserCheck, label: '전문 상담', desc: '고객 맞춤형' },
            { Icon: ShieldCheck, label: '안전 거래', desc: '계약 보호' },
            { Icon: Clock, label: '신속 대응', desc: '항시 상담 가능' },
          ].map((badge) => (
            <div key={badge.label} className="flex flex-col items-center p-5 md:p-6 rounded-2xl bg-white border border-gray-100/80 shadow-sm hover:shadow-md hover:border-wishes-secondary/15 transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-wishes-secondary/[0.07] flex items-center justify-center mb-3">
                <badge.Icon className="w-5 h-5 text-wishes-secondary" />
              </div>
              <p className="font-bold text-sm text-wishes-primary">{badge.label}</p>
              <p className="text-xs text-gray-400 mt-1">{badge.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 최신 매물 섹션 */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-10 animate-fade-in-up">
            <div>
              <p className="text-sm font-semibold text-wishes-secondary tracking-wide mb-1.5">NEW LISTINGS</p>
              <h2 className="text-2xl md:text-3xl font-bold text-wishes-primary">
                최신 매물
              </h2>
              <p className="text-gray-400 mt-2 text-sm">새로 등록된 매물을 확인하세요</p>
            </div>
            <Link
              href="/listings"
              className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-wishes-secondary border border-wishes-secondary/20 hover:bg-wishes-secondary/5 transition-all"
            >
              전체보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {latestListings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in-up">
              {latestListings.map((listing: any, idx: number) => (
                <div key={listing.id} style={{ animationDelay: `${idx * 60}ms` }} className="animate-fade-in-up">
                  <HomeListingCard listing={listing} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-gray-50 rounded-2xl">
              <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">등록된 매물이 없습니다</p>
            </div>
          )}

          <div className="mt-10 text-center md:hidden">
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-wishes-secondary border border-wishes-secondary/20 hover:bg-wishes-secondary/5 transition-all"
            >
              전체보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
