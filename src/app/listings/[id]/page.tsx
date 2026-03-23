import { notFound } from 'next/navigation';
import Link from 'next/link';
import { listings, getListingById, formatPrice } from '@/data/listings';
import type { Metadata } from 'next';

export function generateStaticParams() {
  return listings.map((l) => ({ id: l.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const listing = getListingById(params.id);
  if (!listing) return {};
  return {
    title: `${listing.title} - ${formatPrice(listing)}`,
    description: listing.description,
  };
}

export default function ListingDetailPage({ params }: { params: { id: string } }) {
  const listing = getListingById(params.id);
  if (!listing) notFound();

  const dealColors = { '전세': 'bg-blue-500', '월세': 'bg-emerald-500', '매매': 'bg-orange-500' };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/" className="hover:text-gray-600">홈</Link>
        <span>/</span>
        <Link href="/listings" className="hover:text-gray-600">매물</Link>
        <span>/</span>
        <span className="text-gray-600">{listing.title}</span>
      </nav>

      {/* Image Area */}
      <div className="relative aspect-[16/9] sm:aspect-[2/1] bg-gradient-to-br from-navy-100 to-navy-200 rounded-2xl overflow-hidden mb-6 sm:mb-8">
        <div className="absolute inset-0 flex items-center justify-center text-navy-300">
          <div className="text-center">
            <svg className="w-20 h-20 mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
            <p className="text-sm">매물 사진 준비 중</p>
          </div>
        </div>
        <span className={`absolute top-4 left-4 ${dealColors[listing.deal]} text-white text-sm font-bold px-4 py-1.5 rounded-full`}>
          {listing.deal}
        </span>
        {listing.status === '계약중' && (
          <div className="absolute top-4 right-4 bg-red-500 text-white text-sm font-bold px-4 py-1.5 rounded-full">
            계약중
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title & Price */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-brand-light text-brand-secondary text-xs font-medium px-2.5 py-1 rounded-full">{listing.type}</span>
              <span className="text-xs text-gray-400">{listing.dong}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-navy-800 mb-2">{listing.title}</h1>
            <p className="text-xl sm:text-2xl font-bold text-brand-secondary">{formatPrice(listing)}</p>
          </div>

          {/* Details Table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3">
              {[
                { label: '매물유형', value: listing.type },
                { label: '거래유형', value: listing.deal },
                { label: '전용면적', value: `${listing.area}㎡ (${(listing.area * 0.3025).toFixed(1)}평)` },
                { label: '해당층', value: listing.floor },
                { label: '입주가능일', value: listing.availableDate || '-' },
                { label: '준공년도', value: listing.built ? `${listing.built}년` : '-' },
                { label: '주차', value: listing.parking ? '가능' : '불가' },
                { label: '엘리벤이터', value: listing.elevator ? '있음' : '없음' },
                { label: '반려동물', value: listing.pet ? '가능' : '불가' },
              ].map((item, i) => (
                <div key={i} className="px-4 sm:px-5 py-3 sm:py-4 border-b border-r border-gray-50">
                  <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                  <p className="text-sm font-medium text-navy-800">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Features */}
          <div>
            <h2 className="text-lg font-bold text-navy-800 mb-3">옵션 / 시설</h2>
            <div className="flex flex-wrap gap-2">
              {listing.features.map((f) => (
                <span key={f} className="bg-brand-light text-brand-secondary text-sm px-3 py-1.5 rounded-lg font-medium">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <h2 className="text-lg font-bold text-navy-800 mb-3">상세 설명</h2>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed whitespace-pre-wrap">
              {listing.description}
            </p>
          </div>

          {/* Address */}
          <div>
            <h2 className="text-lg font-bold text-navy-800 mb-3">위치</h2>
            <p className="text-sm text-gray-600 mb-3">{listing.address}</p>
            <div className="aspect-[16/9] bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">
              카카오맵 연동 예정
            </div>
          </div>
        </div>

        {/* Sidebar - Contact */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 sticky top-24 shadow-sm">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-brand-light rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🏢</span>
              </div>
              <h3 className="font-bold text-navy-800">위시스뵠동산</h3>
              <p className="text-xs text-gray-400 mt-1">서울 관악구 싣림동</p>
            </div>

            <div className="space-y-3">
              <a
                href="tel:1533-9580"
                className="flex items-center justify-center gap-2 w-full bg-brand-primary text-white py-3 rounded-xl font-semibold hover:bg-brand-secondary transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
                전화 상담
              </a>
              <a
                href="https://pf.kakao.com/_xnxaxjxj"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-[#FEE500] text-[#3C1E1E] py-3 rounded-xl font-semibold hover:bg-[#FFD700] transition-colors"
              >
                카카오톡 상담
              </a>
              <Link
                href="/contact"
                className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                온라인 문의
              </Link>
            </div>

            <p className="text-[11px] text-gray-400 text-center mt-4 leading-relaxed">
              영업시간: 평일 09:00~19:00<br />
              토요일 10:00~17:00 (일·공휴일 휴무)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
