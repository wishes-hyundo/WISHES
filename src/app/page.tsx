import Link from 'next/link';
import { MapPin, Search, ArrowRight, Building2 } from 'lucide-react';
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
      {/* ━━━ 프리미엄 히어로 섹션 ━━━ */}
      <section className="relative min-h-[85vh] flex items-center justify-center pt-16 pb-28 overflow-hidden">
        {/* 배경 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-br from-wishes-primary via-wishes-primary to-wishes-secondary">
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, #fff 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}></div>
        </div>

        {/* 배경 장식 */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-wishes-accent/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-20 w-96 h-96 bg-wishes-secondary/5 rounded-full blur-3xl"></div>

        <div className="relative max-w-5xl mx-auto px-4 text-center space-y-8 animate-fade-in-up">
          <div className="space-y-6">
            <div className="inline-block px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
              <p className="text-sm font-medium text-white/80">위시스부동산 | 종합봀동산 서비스</p>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight">
              당신의 꿈, 우리의<span className="text-wishes-accent"> 약속</span>
            </h1>

            <p className="text-xl md:text-2xl text-white/70 max-w-3xl mx-auto leading-relaxed font-light">
              서울·경기 부동산 전문가가<br />
              <span className="text-white">최고의 매물을 찾아드립니다</span>
            </p>
          </div>

          {/* CTA 버튼 */}
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

      {/* ━━━ 신뢰 배지 섹션 ━━━ */}
      <section className="max-w-5xl mx-auto px-4 -mt-16 relative z-10 mb-20 animate-fade-in-up">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '📅', label: '15년 경력', desc: '신뢰의 기록' },
            { icon: '👨‍💼', label: '전문 상담', desc: '고객 맞춤형' },
            { icon: '🔒', label: '안전 거래', desc: '계약 보호' },
            { icon: '⏰', label: '24시간', desc: '항시 대응' },
          ].map((badge) => (
            <div key={badge.label} className="flex flex-col items-center p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-wishes-accent/20 transition-all duration-300">
              <span className="text-2xl mb-2">{badge.icon}</span>
              <p className="font-semibold text-sm text-wishes-primary">{badge.label}</p>
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
              <h2 className="text-3xl md:text-4xl font-bold text-wishes-primary">
                최신 매물
              </h2>
              <p className="text-wishes-muted mt-2">새로 등록된 매물을 확인하세요</p>
            </div>
            <Link
              href="/listings"
              className="hidden md:flex items-center gap-2 px-6 py-3 rounded-xl bg-wishes-secondary text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              전체보기 <ArrowRight className="w-4 h-4" />
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
            <div className="text-center py-16 bg-wishes-bg rounded-2xl border border-gray-100">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">등록된 매물이 없습니다</p>
            </div>
          )}

          <div className="mt-10 text-center md:hidden">
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-wishes-secondary text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              전체보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
