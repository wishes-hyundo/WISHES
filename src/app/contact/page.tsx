import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '상담문의',
  description: '위시스뵠동산중개법인에 매물 문의, 방문 상담을 신청하세요. 전화: 1533-9580',
};

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-navy-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">상담 문의</h1>
          <p className="text-white/60 text-base sm:text-lg">
            편하신 방법으로 문의해주세요. 빠르게 답변드리겠습니다.
          </p>
        </div>
      </section>

      {/* Contact Methods */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Phone */}
            <a href="tel:1533-9580" className="block bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm card-hover text-center">
              <div className="w-16 h-16 bg-brand-light rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-brand-secondary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-navy-800 mb-2">전화 상담</h3>
              <p className="text-2xl font-bold text-brand-secondary mb-2">1533-9580</p>
              <p className="text-xs text-gray-400">평일 09:00~19:00 / 토 10:00~17:00</p>
            </a>

            {/* KakaoTalk */}
            <a href="https://pf.kakao.com/_xnxaxjxj" target="_blank" rel="noopener noreferrer" className="block bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm card-hover text-center">
              <div className="w-16 h-16 bg-[#FEE500]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" viewBox="0 0 256 256" fill="#3C1E1E">
                  <path d="M128 36C70.6 36 24 72.2 24 116.8c0 28.4 18.6 53.4 46.8 68l-9.6 35.2c-.8 3 2.4 5.6 5.2 4l42-27.2c6.4 1.2 13 1.8 19.6 1.8 57.4 0 104-36.2 104-80.8S185.4 36 128 36z"/>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-navy-800 mb-2">카카오톡 상담</h3>
              <p className="text-sm text-gray-500 mb-2">실시간 채팅 상담</p>
              <p className="text-xs text-gray-400">24시간 문의 가능 (답변은 영업시간)</p>
            </a>

            {/* Email */}
            <a href="mailto:wishes@wishes.co.kr" className="block bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm card-hover text-center">
              <div className="w-16 h-16 bg-brand-light rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-brand-secondary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-navy-800 mb-2">이메일 문의</h3>
              <p className="text-sm text-brand-secondary font-medium mb-2">wishes@wishes.co.kr</p>
              <p className="text-xs text-gray-400">영업일 기준 24시간 이내 회신</p>
            </a>
          </div>
        </div>
      </section>

      {/* Visit Info */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-navy-800 mb-8 text-center">방문 안내</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-gray-50 rounded-2xl p-6 sm:p-8">
              <h3 className="font-bold text-navy-800 mb-4">영업 시간</h3>
              <div className="space-y-3 text-sm">
                {[
                  { day: '월~금', time: '09:00 ~ 19:00' },
                  { day: '토요일', time: '10:00 ~ 17:00' },
                  { day: '일·공휴일', time: '휴무' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                    <span className="text-gray-600">{item.day}</span>
                    <span className="font-medium text-navy-800">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-2xl p-6 sm:p-8">
              <h3 className="font-bold text-navy-800 mb-4">찾아오시는 길</h3>
              <div className="space-y-3 text-sm text-gray-600">
                <p className="font-medium text-navy-800">
                  서울특별시 관악구 신림로64길 23, 8층(신림동)
                </p>
                <div className="space-y-2">
                  <p className="flex gap-2">
                    <span className="text-brand-secondary font-medium">지하철</span>
                    2호선 신림역 3번 출구 도보 5분
                  </p>
                  <p className="flex gap-2">
                    <span className="text-brand-secondary font-medium">버스</span>
                    신림역 정류장 하차
                  </p>
                  <p className="flex gap-2">
                    <span className="text-brand-secondary font-medium">주차</span>
                    건물 내 주차 가능 (사전 연락)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
