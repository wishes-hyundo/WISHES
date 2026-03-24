'use client';

import Link from 'next/link';
import { MapPin, Search, Phone, ArrowRight, Building2, Shield, Users, Clock, Zap, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ListingCard } from '@/components/ListingCard';

// Simulated data - in real app would be fetched server-side
const latestListings = [
  {
    id: 1,
    title: '신림역 근첨 깔끔한 원룸',
    address: '서울특별시 관악구 신림동',
    dong: '신림동',
    type: '원룸',
    area: 25,
    floor: '3층',
    deal: '월세',
    deposit: 1000,
    monthly: 45,
    price: 0,
    images: [{ url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=300&fit=crop' }],
    parking: true,
    elevator: false,
    pet: false,
    createdAt: new Date(),
    status: '가용',
  },
  {
    id: 2,
    title: '봉천역 전세 아파트',
    address: '서울특별시 관악구 봉천동',
    dong: '봉천동',
    type: '아파트',
    area: 60,
    floor: '5층',
    deal: '전세',
    deposit: 40000,
    monthly: 0,
    price: 0,
    images: [{ url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=300&fit=crop' }],
    parking: true,
    elevator: true,
    pet: true,
    createdAt: new Date(),
    status: '가용',
  },
  {
    id: 3,
    title: '신림동 역세권 매매 아파트',
    address: '서울특별시 관악구 신림동',
    dong: '신림동',
    type: '아파트',
    area: 84,
    floor: '12층',
    deal: '매매',
    deposit: 0,
    monthly: 0,
    price: 650000,
    images: [{ url: 'https://images.unsplash.com/photo-1545324418-cc1ee142d993?w=400&h=300&fit=crop' }],
    parking: true,
    elevator: true,
    pet: false,
    createdAt: new Date(),
    status: '가용',
  },
  {
    id: 4,
    title: '봉천 투룸 월세',
    address: '서울특별시 관악구 봉천동',
    dong: '봉천동',
    type: '투룸',
    area: 45,
    floor: '2층',
    deal: '월세',
    deposit: 3000,
    monthly: 55,
    price: 0,
    images: [{ url: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=400&h=300&fit=crop' }],
    parking: false,
    elevator: false,
    pet: true,
    createdAt: new Date(),
    status: '가용',
  },
  {
    id: 5,
    title: '신림역 고급 오피스텔',
    address: '서울특별시 관악구 신림동',
    dong: '신림동',
    type: '오피스텔',
    area: 35,
    floor: '8층',
    deal: '월세',
    deposit: 2000,
    monthly: 60,
    price: 0,
    images: [{ url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop' }],
    parking: true,
    elevator: true,
    pet: false,
    createdAt: new Date(),
    status: '가용',
  },
  {
    id: 6,
    title: '봉천 근린상가',
    address: '서울특별시 관악구 봉천동',
    dong: '봉천동',
    type: '상가',
    area: 25,
    floor: '1층',
    deal: '월세',
    deposit: 5000,
    monthly: 80,
    price: 0,
    images: [{ url: 'https://images.unsplash.com/photo-1554995207-c18210cc2e38?w=400&h=300&fit=crop' }],
    parking: false,
    elevator: false,
    pet: false,
    createdAt: new Date(),
    status: '가용',
  },
];

const TrustBadges = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {[
      { icon: '📅', label: '15년 경력', desc: '신뢰의 기록' },
      { icon: '👨‍💼', label: '전문 상담', desc: '고객 맞춤형' },
      { icon: '🔒', label: '안전 거래', desc: '계약 보호' },
      { icon: '24', label: '24시간', desc: '항시 대응' },
    ].map((badge) => (
      <div key={badge.label} className="flex flex-col items-center p-4 rounded-xl bg-white border border-gray-100 hover:border-wishes-accent/30 hover:shadow-sm transition-all">
        <span className="text-3xl mb-2">{badge.icon}</span>
        <p className="font-semibold text-sm text-wishes-primary">{badge.label}</p>
        <p className="text-xs text-wishes-muted mt-1">{badge.desc}</p>
      </div>
    ))}
  </div>
);

const StatCounter = ({ value, label }: { value: string; label: string }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const numValue = parseInt(value) || 0;
    if (numValue === 0) return;

    let current = 0;
    const increment = Math.ceil(numValue / 20);
    const interval = setInterval(() => {
      current += increment;
      if (current >= numValue) {
        setCount(numValue);
        clearInterval(interval);
      } else {
        setCount(current);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [value]);

  return (
    <div className="text-center">
      <div className="text-4xl md:text-5xl font-bold text-wishes-accent mb-2">{count}{value.includes('+') ? '+' : ''}</div>
      <p className="text-sm text-wishes-muted">{label}</p>
    </div>
  );
};

const ServiceFeature = ({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) => (
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

const Testimonial = ({ name, role, text }: { name: string; role: string; text: string }) => (
  <div className="p-6 rounded-2xl bg-white border border-gray-100">
    <div className="flex gap-1 mb-4">
      {[...Array(5)].map((_, i) => (
        <span key={i} className="text-wishes-accent">★</span>
      ))}
    </div>
    <p className="text-sm text-wishes-text leading-relaxed mb-4">"{text}"</p>
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-wishes-secondary to-wishes-accent"></div>
      <div>
        <p className="font-semibold text-sm text-wishes-primary">{name}</p>
        <p className="text-xs text-wishes-muted">{role}</p>
      </div>
    </div>
  </div>
);

export default function HomePage() {
  return (
    <div className="pt-16 bg-wishes-bg">
      {/* ━━━ 프리미엄 히어로 섹션 ━━━ */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 pb-32 overflow-hidden">
        {/* 배경 패턴 */}
        <div className="absolute inset-0 bg-gradient-to-br from-wishes-primary via-wishes-primary to-wishes-secondary">
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, #fff 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}></div>
        </div>

        {/* 헤드카운트 */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-wishes-accent/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-20 w-96 h-96 bg-wishes-secondary/5 rounded-full blur-3xl"></div>

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

      {/* ━━━ 신뢰도 배지 섹션 ━━━ */}
      <section className="max-w-6xl mx-auto px-4 -mt-20 relative z-10 mb-32 animate-fade-in-up">
        <TrustBadges />
      </section>

      {/* ━━━ 통계 섹션 ━━━ */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-3xl md:text-4xl font-bold text-wishes-primary mb-4">
              위시스부동산의 성과
            </h2>
            <p className="text-lg text-wishes-muted">신뢰의 기록으로 더 나은 내일을 만들어갑니다</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <StatCounter value="500+" label="거래 건수" />
            <StatCounter value="15" label="년 경력" />
            <StatCounter value="98" label="고객 만족도 %" />
            <StatCounter value="24" label="시간 상담" />
          </div>
        </div>
      </section>

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
              더보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
            {latestListings.map((listing, idx) => (
              <div key={listing.id} style={{ animationDelay: `${idx * 50}ms` }} className="animate-fade-in-up">
                <ListingCard listing={listing as any} />
              </div>
            ))}
          </div>

          <div className="mt-12 text-center md:hidden">
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-wishes-secondary text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              더보기 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ━━━ 서비스 특징 섹션 ━━━ */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-3xl md:text-4xl font-bold text-wishes-primary mb-4">
              위시스부동산이 특별한 이유
            </h2>
            <p className="text-lg text-wishes-muted">고객 중심, 신뢰 기반의 서비스를 제공합니다</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
            <ServiceFeature
              icon={MapPin}
              title="스마트 매물 검색"
              desc="카카오맵 기반의 직관적 검색으로 원하는 위치의 매물을 실시간으로 확인하세요."
            />
            <ServiceFeature
              icon={Users}
              title="지역 전문가"
              desc="서울·경기 전 지역에 대한 15년의 깊은 이해로 최적의 매물을 추처합니다."
            />
            <ServiceFeature
              icon={Shield}
              title="안전한 거래"
              desc="공인중개사 직접 거래로 계약 과정의 모든 단계에서 고객 권리를 보호합니다."
            />
            <ServiceFeature
              icon={Zap}
              title="빠른 상담"
              desc="24시간 언제든 전화, 카톡, 온라인으로 신속한 상담을 받으세요."
            />
            <ServiceFeature
              icon={Clock}
              title="유연한 일정"
              desc="주말·야간 예약상담으로 바쁜 일정에 맞춰 편하게 상담합니다."
            />
            <ServiceFeature
              icon={CheckCircle}
              title="투명한 정보"
              desc="숨겠진 정보 없이 매물에 대한 모든 정보를 명확하게 공개합니다."
            />
          </div>
        </div>
      </section>

      {/* ━━━ 고객 후기 섹션 ━━━ */}
      <section className="py-24 bg-wishes-bg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-3xl md:text-4xl font-bold text-wishes-primary mb-4">
              고객 후기
            </h2>
            <p className="text-lg text-wishes-muted">실제 고객의 소중한 피드백입니다</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
            <Testimonial
              name="김민준"
              role="강남구 거주 | 전세 계약"
              text="처음 부동산 계약이라 걱정 많았는데, 전문가답게 하나하나 설명해주셜서 안심할 수 있었습니다."
            />
            <Testimonial
              name="이지은"
              role="봉천동 거주 | 원세 계약"
              text="지도로 위치를 확인하고 빠르게 계약할 수 있었어요. 정말 편리합니다!"
            />
            <Testimonial
              name="박준호"
              role="신림역 근처 | 투자 맠매"
              text="시장 정보가 정확하고 전문적인 조언이 정말 도움이 많이 되습니다. 감사합니다!"
            />
          </div>
        </div>
      </section>

      {/* ━━━ 최종 CTA 섹션 ━━━ */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-wishes-primary via-wishes-primary to-wishes-secondary">
          <div className="absolute top-0 right-0 w-80 h-80 bg-wishes-accent/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-4xl mx-auto px-4 text-center space-y-8 animate-fade-in-up">
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            원하는 매물이 없으신가요?
          </h2>

          <p className="text-xl text-white/80 max-w-2xl mx-auto">
            전문 상담사가 고객님의 조건에 맞춰 최적의 매물을 직접 찾앀드립니다
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Link
              href="/contact"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/10 text-white font-bold text-lg border border-white/30 hover:bg-white/20 backdrop-blur-sm transition-all group"
            >
              온라인 상담
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
