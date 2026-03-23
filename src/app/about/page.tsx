import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '회사소개',
  description: '위시스부동산중개법인 - 서울 관악구 신림동 전문 부동산 중개법인. 15년 경력의 전문 중개서비스.',
};

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-navy-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">회사소개</h1>
          <p className="text-white/60 text-base sm:text-lg max-w-xl mx-auto">
            관악구 신림동에서 15년, 고객의 내 집 마련을 함께해온 위시스부동산입니다.
          </p>
        </div>
      </section>

      {/* Company Info */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <span className="text-brand-secondary text-sm font-semibold mb-2 block">ABOUT WISHES</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-navy-800 mb-6">
                신뢰와 전문성으로<br />부동산의 가치를 잇습니다
              </h2>
              <div className="space-y-4 text-sm sm:text-base text-gray-600 leading-relaxed">
                <p>
                  주식회사 위시스부동산중개법인은 서울 관악구 신림동을 거점으로 15년 이상 부동산 중개 서비스를 제공해온 전문 법인입니다. 원룸, 투룸, 오피스텔, 아파트, 상가까지 다양한 매물을 취급하고 있습니다.
                </p>
                <p>
                  저희는 단순한 중개를 넘어, 고객 한 분 한 분의 조건과 상황에 맞는 최적의 매물을 찾아드리고, 안전한 거래가 이루어질 수 있도록 전 과정을 책임지고 관리합니다.
                </p>
                <p>
                  법인 중개의 장점인 체계적인 거래 관리와 중개사고배상보험을 통해 고객 여러분의 소중한 재산을 안전하게 보호합니다.
                </p>
              </div>
            </div>
            <div className="bg-gradient-to-br from-navy-100 to-brand-light rounded-2xl p-8 sm:p-10">
              <div className="space-y-5">
                {[
                  { label: '회사명', value: '주식회사 위시스부동산중개법인' },
                  { label: '대표이사', value: '전유진' },
                  { label: '사업자등록번호', value: '445-86-01981' },
                  { label: '소재지', value: '서울특별시 관악구 신림로64길 23, 8층(신림동)' },
                  { label: '대표전화', value: '1533-9580' },
                  { label: '팩스', value: '02-888-8501' },
                  { label: '이메일', value: 'wishes@wishes.co.kr' },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <span className="text-xs sm:text-sm font-medium text-gray-500 w-28 flex-shrink-0">{item.label}</span>
                    <span className="text-sm sm:text-base text-navy-800 font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-navy-800 mb-3">위시스의 약속</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '🛡️', title: '안전한 거래', desc: '법인 중개와 배상보험으로 거래 안전성을 보장합니다.' },
              { icon: '🔍', title: '정확한 정보', desc: '매물 상태, 시세, 주변 환경 정보를 정확히 제공합니다.' },
              { icon: '🤝', title: '고객 중심', desc: '고객의 조건에 맞는 최적의 매물을 추천합니다.' },
              { icon: '📞', title: '신속한 응대', desc: '문의부터 계약까지 빠르고 정확하게 처리합니다.' },
            ].map((item, i) => (
              <div key={i} className="text-center p-6 rounded-2xl bg-gray-50 border border-gray-100">
                <span className="text-3xl mb-3 block">{item.icon}</span>
                <h3 className="font-bold text-navy-800 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Map / Location */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-navy-800 mb-6 text-center">오시는 길</h2>
          <div className="bg-gray-100 rounded-2xl aspect-[16/9] sm:aspect-[2/1] flex items-center justify-center text-gray-400 mb-6">
            카카오맵 연동 예정
          </div>
          <div className="text-center text-sm text-gray-500 space-y-1">
            <p className="font-medium text-navy-800">[08754] 서울특별시 관악구 신림로64길 23, 8층(신림동)</p>
            <p>지하철 2호선 신림역 3번 출구에서 도보 5분</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 bg-brand-primary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">방을 찾고 계신가요?</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="tel:1533-9580" className="w-full sm:w-auto bg-white text-navy-800 px-8 py-3 rounded-full font-bold hover:bg-brand-light transition-colors">
              1533-9580
            </a>
            <Link href="/contact" className="w-full sm:w-auto bg-white/10 text-white border border-white/30 px-8 py-3 rounded-full font-bold hover:bg-white/20 transition-colors">
              온라인 문의
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
