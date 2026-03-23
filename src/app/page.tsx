import Link from 'next/link';
import { listings, formatPrice } from '@/data/listings';
import ListingCard from '@/components/ListingCard';

export default function HomePage() {
  const availableListings = listings.filter(l => l.status !== '계약완료');
  const featuredListings = availableListings.slice(0, 6);

  return (
    <>
      {/* Hero Section */}
      <section className="hero-gradient relative overflow-hidden">
        {/* Pattern Overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 lg:py-36">
          <div className="text-center max-w-3xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white/90 text-sm px-4 py-1.5 rounded-full mb-6">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              현재 {availableListings.length}건의 매물이 등록되어 있습니다
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 sm:mb-6 tracking-tight">
              내게 딱 맞는 방을<br className="sm:hidden" /> 찾아보세요
            </h1>
            <p className="text-base sm:text-lg text-white/70 mb-8 sm:mb-10 max-w-xl mx-auto">
              서울 관악구 · 신림동 전문<br className="sm:hidden" />
              15년 경력의 신뢰할 수 있는 중개서비스
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="flex bg-white rounded-2xl sm:rounded-full shadow-2xl overflow-hidden p-1.5">
                <input
                  type="text"
                  placeholder="지역명, 단지명으로 검색..."
                  className="flex-1 px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
                />
                <Link
                  href="/listings"
                  className="bg-brand-primary text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-full text-sm sm:text-base font-semibold hover:bg-brand-secondary transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  검색
                </Link>
              </div>

              {/* Quick Filters */}
              <div className="flex flex-wrap justify-center gap-2 mt-4 sm:mt-6">
                {['전세', '월세', '매매', '원룸', '투룸', '오피스텔'].map((tag) => (
                  <Link
                    key={tag}
                    href={`/listings?q=${tag}`}
                    className="bg-white/10 backdrop-blur-sm text-white/80 text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full hover:bg-white/20 transition-all"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" className="w-full">
            <path d="M0 80h1440V30c-240 30-480 50-720 40S240 20 0 50v30z" fill="#f9fafb" />
          </svg>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[
              { number: '15+', label: '년 경력', icon: '🏆' },
              { number: `${availableListings.length}+`, label: '등록 매물', icon: '🏠' },
              { number: '3,000+', label: '계약 실적', icon: '📋' },
              { number: '98%', label: '고객 만족도', icon: '⭐' },
            ].map((stat, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 sm:p-6 text-center shadow-sm border border-gray-100">
                <span className="text-2xl sm:text-3xl mb-2 block">{stat.icon}</span>
                <p className="text-2xl sm:text-3xl font-bold text-navy-800">{stat.number}</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-8 sm:mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-navy-800 mb-2">추천 매물</h2>
              <p className="text-sm sm:text-base text-gray-500">위시스부동산이 엄선한 매물입니다</p>
            </div>
            <Link
              href="/listings"
              className="hidden sm:flex items-center gap-1 text-sm font-medium text-brand-secondary hover:text-brand-primary transition-colors"
            >
              전체보기
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {featuredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>

          <div className="mt-8 text-center sm:hidden">
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 bg-brand-primary text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors"
            >
              전체 매물 보기
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Why WISHES */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-800 mb-3">왜 위시스부동산인가요?</h2>
            <p className="text-sm sm:text-base text-gray-500">고객의 소중한 선택을 도와드립니다</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
                title: '안전한 거래',
                desc: '법인 중개로 거래 안전성을 보장합니다. 모든 계약 과정을 투명하게 관리하며, 만약의 사고에도 중개사고배상보험으로 보호받으실 수 있습니다.',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                ),
                title: '전문 매물 정보',
                desc: '관악구 신림동 지역을 15년간 전문적으로 다뤄왔습니다. 시세, 학군, 교통, 생활 인프라까지 정확한 정보를 제공합니다.',
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                ),
                title: '맞춤형 상담',
                desc: '고객 한 분 한 분의 조건과 상황에 맞는 최적의 매물을 추천해드립니다. 입주 전 체크리스트부터 계약 후 관리까지 원스톱 서비스를 제공합니다.',
              },
            ].map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-2xl p-6 sm:p-8 text-center card-hover border border-gray-100">
                <div className="w-16 h-16 bg-brand-light text-brand-secondary rounded-2xl flex items-center justify-center mx-auto mb-5">
                  {item.icon}
                </div>
                <h3 className="text-lg font-bold text-navy-800 mb-3">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20 bg-navy-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            방을 찾고 계신가요?
          </h2>
          <p className="text-white/60 mb-8 sm:text-lg">
            전문 상담사가 조건에 딱 맞는 매물을 찾아드립니다.<br className="hidden sm:block" />
            지금 바로 상담받아보세요.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <a
              href="tel:1533-9580"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-navy-800 px-8 py-3.5 rounded-full font-bold text-base hover:bg-brand-light transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
              1533-9580
            </a>
            <a
              href="https://pf.kakao.com/_xnxaxjxj"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#FEE500] text-[#3C1E1E] px-8 py-3.5 rounded-full font-bold text-base hover:bg-[#FFD700] transition-colors"
            >
              카카오톡 상담
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
