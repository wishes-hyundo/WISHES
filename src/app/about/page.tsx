import { MapPin, Mail, Clock, Award, Users, Shield, Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import AboutKakaoMap from '@/components/AboutKakaoMap';

export const metadata: Metadata = {
    title: '회사소개 - WISHES 서울·경기 종합부동산',
    description: 'WISHES는 서울·경기 지역 전문 종합부동산입니다. 원룸, 투룸, 오피스텔, 아파트, 상가, 사무실 등 다양한 매물을 전문 공인중개사가 안전하게 중개합니다. 관악구 신림동 소재.',
    keywords: ['위시스부동산', '서울 부동산', '경기 부동산', '관악구 부동산', '신림동 부동산', '공인중개사', '부동산 중개'],
    alternates: {
          canonical: 'https://wishes.co.kr/about',
    },
    openGraph: {
          title: '회사소개 | WISHES - 서울·경기 종합부동산',
          description: '서울·경기 지역 전문 종합부동산. 원룸, 투룸, 오피스텔, 아파트 등 전문 중개.',
          url: 'https://wishes.co.kr/about',
          siteName: 'WISHES - 서울·경기 종합부동산',
          type: 'website',
          locale: 'ko_KR',
    },
};

export default function AboutPage() {
    return (
          <div className="pt-16 min-h-screen">
            {/* 히어로 */}
                <section className="bg-gradient-to-b from-wishes-primary to-[#162044] text-white py-20">
                        <div className="max-w-5xl mx-auto px-4 text-center">
                                  <p className="text-sm font-semibold text-white/40 tracking-widest uppercase mb-3">About Us</p>p>
                                  <h1 className="text-3xl md:text-4xl font-bold">회사 소개</h1>h1>
                                  <p className="mt-3 text-white/50">
                                              서울·경기 종합부동산 서비스
                                  </p>p>
                        </div>div>
                </section>section>
          
                <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
                  {/* 취급 매물 */}
                        <section className="bg-white rounded-xl border border-gray-200 p-8">
                                  <h2 className="text-xl font-bold text-wishes-primary mb-6 flex items-center gap-2">
                                              <Award className="w-6 h-6" />
                                              취급 매물
                                  </h2>h2>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {['원룸', '투룸', '쓰리룸', '오피스텔', '아파트', '상가', '사무실'].map((type) => (
                          <div key={type} className="text-center p-4 bg-blue-50 rounded-xl">
                                          <Building2 className="w-8 h-8 text-wishes-secondary mx-auto mb-2" />
                                          <span className="text-sm font-medium text-gray-700">{type}</span>span>
                          </div>div>
                        ))}
                                  </div>div>
                        </section>section>
                
                  {/* 강점 */}
                        <section>
                                  <h2 className="text-xl font-bold text-wishes-primary mb-6 text-center">
                                              WISHES의 강점
                                  </h2>h2>
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
                                                        <h3 className="text-lg font-bold text-wishes-primary mb-2">{item.title}</h3>h3>
                                                        <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>p>
                                        </div>div>
                                      ))}
                                  </div>div>
                        </section>section>
                
                  {/* 오시는 길 */}
                        <section className="bg-white rounded-xl border border-gray-200 p-8">
                                  <h2 className="text-xl font-bold text-wishes-primary mb-6 flex items-center gap-2">
                                              <MapPin className="w-6 h-6" />
                                              오시는 길
                                  </h2>h2>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                              <div className="space-y-3 text-sm">
                                                            <div className="flex items-start gap-3">
                                                                            <MapPin className="w-4 h-4 mt-0.5 text-wishes-secondary shrink-0" />
                                                                            <span>서울특별시 관악구 신림로64길 23, 8층(신림동)</span>span>
                                                            </div>div>
                                                            <div className="flex items-center gap-3">
                                                                            <Mail className="w-4 h-4 text-wishes-secondary shrink-0" />
                                                                            <a href="mailto:wishes@wishes.co.kr" className="text-wishes-secondary">wishes@wishes.co.kr</a>a>
                                                            </div>div>
                                                            <div className="flex items-center gap-3">
                                                                            <Clock className="w-4 h-4 text-wishes-secondary shrink-0" />
                                                                            <span>평일 09:00 ~ 19:00 (주말 예약상담)</span>span>
                                                            </div>div>
                                              </div>div>
                                    {/* 카카오맵 - 신림로64길 23 */}
                                              <div className="aspect-[16/10] rounded-lg overflow-hidden border border-gray-200">
                                                            <AboutKakaoMap />
                                              </div>div>
                                  </div>div>
                        </section>section>
                </div>div>
          </div>div>
        );
}</div>
