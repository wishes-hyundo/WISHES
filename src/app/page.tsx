import Link from 'next/link';
import { MapPin, Search, ArrowRight, Building2, Droplets, ShieldCheck, Zap } from 'lucide-react';
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
      {/* ━━━ 히어로 섹션 — Fresh Green Droplet ━━━ */}
      <section className="relative min-h-[80vh] flex items-center justify-center pt-12 pb-28 overflow-hidden bg-gradient-hero">
        {/* 배경 보케 글로우 */}
        <div className="absolute top-[-5%] left-[60%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(76,175,80,0.15),transparent_70%)] blur-[60px] animate-float"></div>
        <div className="absolute bottom-[10%] left-[-5%] w-[350px] h-[350px] rounded-full bg-[radial-gradient(circle,rgba(129,199,132,0.12),transparent_70%)] blur-[60px] animate-float" style={{ animationDelay: '3s', animationDuration: '15s' }}></div>
        <div className="absolute top-[40%] right-[-3%] w-[280px] h-[280px] rounded-full bg-[radial-gradient(circle,rgba(165,214,167,0.15),transparent_70%)] blur-[60px] animate-float" style={{ animationDelay: '6s', animationDuration: '18s' }}></div>

        {/* 배경 물방울 도형 */}
        <div className="absolute top-[15%] left-[8%] w-14 h-16 rounded-droplet border border-wishes-accent/10 bg-wishes-accent/[0.04] animate-droplet-bob"></div>
        <div className="absolute top-[70%] left-[75%] w-9 h-11 rounded-droplet border border-wishes-light/10 bg-wishes-light/[0.04] animate-droplet-bob" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-[50%] left-[87%] w-[70px] h-[82px] rounded-droplet border border-wishes-accent/8 bg-wishes-accent/[0.03] animate-droplet-bob" style={{ animationDelay: '3s' }}></div>

        <div className="relative max-w-4xl mx-auto px-4 text-center space-y-10 animate-fade-in-up">
          <div className="space-y-7">
            {/* 뱃지 */}
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/70 border border-wishes-secondary/8 backdrop-blur-lg shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-green-500 to-green-700 animate-pulse"></div>
              <p className="text-sm font-medium text-wishes-secondary tracking-wider">서울·경기 종합부동산 서비스</p>
            </div>

            {/* 타이틀 */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-wishes-text leading-[1.2] tracking-tight">
              당신의 꿈,<br className="sm:hidden" /> 우리의 <span className="text-gradient">약속</span>
            </h1>
          </div>

          {/* CTA 버튼 — 물방울 둥근 스타일 */}
          <div className="flex flex-col sm:flex-row gap-3.5 justify-center pt-2">
            <Link
              href="/map"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-gradient-to-r from-wishes-secondary to-wishes-primary text-white font-bold text-base shadow-lg shadow-wishes-secondary/30 hover:shadow-xl hover:shadow-wishes-secondary/40 hover:-translate-y-1 transition-all duration-300 group"
            >
              <MapPin className="w-5 h-5" />
              지도 검색
            </Link>
            <Link
              href="/listings"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-white/75 text-wishes-text font-bold text-base border border-wishes-secondary/10 hover:bg-white/90 hover:-translate-y-1 backdrop-blur-sm shadow-sm transition-all duration-300 group"
            >
              <Search className="w-5 h-5" />
              매물 보기
            </Link>
          </div>
        </div>

        {/* 한단 whisper */}
        <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-light tracking-[1.5px] text-wishes-secondary/[0.18] whitespace-nowrap pointer-events-none animate-fade-in" style={{ animationDelay: '3.5s' }}>
          May your wishes be the seeds that bloom into beautiful realities.
        </p>
      </section>

      {/* ━━━ 신뢰 배지 섹션 — 물방울 아이콘 + 통통 바운스 ━━━ */}
      <section className="max-w-4xl mx-auto px-4 -mt-14 relative z-10 mb-20">
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {[
            { Icon: Droplets, label: '전문 상담', desc: '고객 맞춤형', color: 'from-green-400 to-green-600', delay: '0s' },
            { Icon: ShieldCheck, label: '안전 거래', desc: '계약 보호', color: 'from-lime-400 to-lime-600', delay: '0.15s' },
            { Icon: Zap, label: '신속 대응', desc: '실시간 상담', color: 'from-teal-400 to-teal-600', delay: '0.3s' },
          ].map((badge) => (
            <div
              key={badge.label}
              className="flex flex-col items-center p-5 md:p-6 rounded-2xl bg-white border border-wishes-border/60 shadow-card hover:shadow-card-hover hover:border-wishes-accent/20 transition-all duration-300 animate-fade-in-up"
              style={{ animationDelay: badge.delay }}
            >
              <div className={`w-11 h-11 icon-droplet bg-gradient-to-br ${badge.color} flex items-center justify-center mb-3 shadow-droplet animate-bounce-soft`} style={{ animationDelay: badge.delay }}>
                <badge.Icon className="w-5 h-5 text-white" />
              </div>
              <p className="font-bold text-sm text-wishes-text">{badge.label}</p>
              <p className="text-xs text-wishes-muted mt-1">{badge.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━ 최신 매물 섹션 ━━━ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-10 animate-fade-in-up">
            <div>
              <p className="text-sm font-semibold text-wishes-accent tracking-wide mb-1.5">NEW LISTINGS</p>
              <h2 className="text-2xl md:text-3xl font-bold text-wishes-text">
                최신 매물
              </h2>
              <p className="text-wishes-muted mt-2 text-sm">새로 등록된 매물을 확인하세요</p>
            </div>
            <Link
              href="/listings"
              className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-wishes-secondary border border-wishes-secondary/20 hover:bg-wishes-secondary/5 transition-all"
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
            <div className="text-center py-20 bg-wishes-cream/50 rounded-2xl">
              <Building2 className="w-12 h-12 text-wishes-light mx-auto mb-3" />
              <p className="text-wishes-muted text-sm">등록된 매물이 없습니다</p>
            </div>
          )}

          <div className="mt-10 text-center md:hidden">
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-wishes-secondary border border-wishes-secondary/20 hover:bg-wishes-secondary/5 transition-all"
            >
              전체보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
