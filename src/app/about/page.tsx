import { MapPin, Mail, Clock, Award, Users, Shield, Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import AboutKakaoMap from '@/components/AboutKakaoMap';

export const metadata: Metadata = {
  title: '회사소개',
  description: 'WISHES 회사소개 - 서울·경기 종합부동산',
};

export default function AboutPage() {
  return (
    <div className="pt-16 min-h-screen">
      {/* 히어로 */}
      <section className="bg-gradient-to-b from-wishes-primary to-[#162044] text-white py-20">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-sm font-semibold text-white/40 tracking-widest uppercase mb-3">About Us</p>
          <h1 className="text-3xl md:text-4xl font-bold">회사 소개</h1>
          <p className="mt-3 text-white/50">
            서울·경기 종합부동산 서비스
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
        {/* 회사 정보 */}
        <section className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-wishes-primary mb-6 flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            회사 정보
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {[
              { label: '상호', value: 'WISHES Corp.' },
              { label: '대표이사', value: '전유진' },
              { label: '사업자등록번호', value: '445-86-01981' },
              { label: '소재지', value: '서울특별시 관악구 신림로64길 23, 8층(신림동)' },
              { label: '이메일', value: 'wishes@wishes.co.kr' },
              { label: '영업시간', value: '평일 09:00 ~ 19:00 (주말 예약상담)' },
              { label: '취급지역', value: '서울 전 지역 및 경기권' },
            ].map((item) => (
              <div key={item.label} className="flex gap-3 py-2 border-b border-gray-100">
                <span className="text-gray-500 w-28 shrink-0">{item.label}</span>
                <span className="text-gray-800 font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 취급 매물 */}
        <section className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-wishes-primary mb-6 flex items-center gap-2">
            <Award className="w-6 h-6" />
            취급 매물
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['원룸', '투룷', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'].map((type) => (
              <div key={type} className="text-center p-4 bg-blue-50 rounded-xl">
                <Building2 className="w-8 h-8 text-wishes-secondary mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-700">{type}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 강점 */}
        <section>
          <h2 className="text-xl font-bold text-wishes-primary mb-6 text-center">
            WISHES의 강점
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: MapPin,
                title: '지역 전문성',
                desc: '서울·경기 전 지역에 대한 깊은 이해와 풍부한 매물 데이터를 보유하고 있습니다.',
              },
              {
                icon: Users,
                title: '전문 상담팀',
                desc: '공인중개사 자격을 갖춘 전문 상담팀이 고객 맞춤형 서비스를 제공합니다.',
              },
              {
                icon: Shield,
                title: '안전한 거래',
                desc: '모든 거래 과정에서 고객의 권리를 최우선으로 보호하는 안전한 중개 서비스를 제공합니다.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-6">
                <item.icon className="w-10 h-10 text-wishes-secondary mb-4" />
                <h3 className="text-lg font-bold text-wishes-primary mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 오시는 길 */}
        <section className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-wishes-primary mb-6 flex items-center gap-2">
            <MapPin className="w-6 h-6" />
            오시는 길
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-0.5 text-wishes-secondary shrink-0" />
                <span>서울특별시 관악구 신림로64길 23, 8층(신림동)</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-wishes-secondary shrink-0" />
                <a href="mailto:wishes@wishes.co.kr" className="text-wishes-secondary">wishes@wishes.co.kr</a>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-wishes-secondary shrink-0" />
                <span>평일 09:00 ~ 19:00 (주말 예약상담)</span>
              </div>
            </div>
            {/* 카카오맵 - 신림로64길 23 */}
            <div className="aspect-[16/10] rounded-lg overflow-hidden border border-gray-200">
              <AboutKakaoMap />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
