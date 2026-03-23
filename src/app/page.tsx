import Link from 'next/link';
import { MapPin, Search, Phone, ArrowRight, Building2, Shield, Users } from 'lucide-react';
import { db } from '@/db';
import { listings } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ListingCard } from '@/components/ListingCard';

export default async function HomePage() {
  // 최신 매물 6건 조회
  const latestListings = await db
    .select()
    .from(listings)
    .where(eq(listings.status, '가용'))
    .orderBy(desc(listings.createdAt))
    .limit(6);

  return (
    <div className="pt-16">
      {/* ━━━ 히어로 섹션 ━━━ */}
      <section className="relative bg-gradient-to-br from-wishes-primary via-wishes-secondary to-blue-700 text-white py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold leading-tight">
            서울 관악구<br className="md:hidden" /> 부동산의 새로운 기준
          </h1>
          <p className="mt-4 text-lg text-blue-200 max-w-2xl mx-auto">
            신림동·봉천동 지역 전문 위시스부동산이<br />
            고객님의 소중한 보금자리를 찾아드립니다
          </p>

          {/* 빠른 검색 */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto">
            <Link
              href="/map"
              className="flex items-center justify-center gap-2 bg-white text-wishes-primary px-6 py-3 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all"
            >
              <MapPin className="w-5 h-5" />
              지도로 매물 검색
            </Link>
            <Link
              href="/listings"
              className="flex items-center justify-center gap-2 bg-white/20 text-white px-6 py-3 rounded-xl font-bold text-lg border border-white/30 hover:bg-white/30 transition-all"
            >
              <Search className="w-5 h-5" />
              전체 매물 보기
            </Link>
          </div>

          {/* 통계 */}
          <div className="mt-12 flex justify-center gap-8 md:gap-16 text-center">
            {[
              { label: '등록 매물', value: `${latestListings.length}+`, icon: Building2 },
              { label: '전문 상담사', value: '5명', icon: Users },
              { label: '고객 만족도', value: '98%', icon: Shield },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <stat.icon className="w-6 h-6 text-blue-300 mb-1" />
                <span className="text-2xl md:text-3xl font-bold">{stat.value}</span>
                <span className="text-xs text-blue-300 mt-1">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 웨이브 */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" className="w-full h-12 md:h-16 text-wishes-bg">
            <path fill="currentColor" d="M0,40 C360,80 1080,0 1440,40 L1440,60 L0,60 Z" />
          </svg>
        </div>
      </section>

      {/* ━━━ 최신 매물 섹션 ━━━ */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-wishes-primary">최신 매물</h2>
            <p className="text-sm text-gray-500 mt-1">관악구 신림동·봉천동 지역 최신 매물입니다</p>
          </div>
          <Link
            href="/listings"
            className="flex items-center gap-1 text-sm font-medium text-wishes-secondary hover:underline"
          >
            전체보기 <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {latestListings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {latestListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing as any} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">등록된 매물이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">곧 새로운 매물이 등록됩니다</p>
          </div>
        )}
      </section>

      {/* ━━━ 서비스 특징 ━━━ */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-wishes-primary text-center mb-12">
            위시스부동산을 선택해야 하는 이유
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: '지도 기반 매물 검색',
                desc: '카카오맵에서 원하는 위치의 매물을 실시간으로 확인하세요. 지도를 이동하면 해당 지역의 매물이 자동으로 표시됩니다.',
                icon: MapPin,
              },
              {
                title: '지역 전문 상담',
                desc: '관악구 신림동·봉천동 지역에 대한 깊은 이해를 바탕으로 최적의 매물을 추천해드립니다.',
                icon: Users,
              },
              {
                title: '안전한 거래',
                desc: '공인중개사가 직접 거래를 진행하며, 모든 계약 과정에서 고객님의 권리를 보호합니다.',
                icon: Shield,
              },
            ].map((feature) => (
              <div key={feature.title} className="text-center p-6">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-7 h-7 text-wishes-secondary" />
                </div>
                <h3 className="text-lg font-bold text-wishes-primary mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ CTA 섹션 ━━━ */}
      <section className="bg-gradient-to-r from-wishes-primary to-wishes-secondary text-white py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            원하는 매물을 못 찾으셨나요?
          </h2>
          <p className="text-blue-200 mb-8">
            전문 상담사가 고객님의 조건에 맞는 매물을 직접 찾아드립니다
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="tel:1533-9580"
              className="flex items-center justify-center gap-2 bg-white text-wishes-primary px-8 py-3 rounded-xl font-bold hover:shadow-lg transition-all"
            >
              <Phone className="w-5 h-5" />
              전화 상담 1533-9580
            </a>
            <Link
              href="/contact"
              className="flex items-center justify-center gap-2 border-2 border-white text-white px-8 py-3 rounded-xl font-bold hover:bg-white/10 transition-all"
            >
              온라인 상담 신청
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
