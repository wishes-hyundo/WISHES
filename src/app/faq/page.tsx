'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle, Search, Home, Building2, CreditCard, ShieldCheck, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

const faqCategories: FAQCategory[] = [
  {
    id: 'general',
    title: '일반',
    icon: <HelpCircle className="w-5 h-5" />,
    items: [
      {
        question: 'WISHES는 어떤 서비스인가요?',
        answer: 'WISHES는 전국 17 시도의 원룸, 투룸, 오피스텔, 아파트, 상가, 사무실 등 다양한 부동산 매물을 전문적으로 중개하는 종합부동산 서비스입니다. 온라인으로 매물 검색부터 상담 신청까지 편리하게 이용하실 수 있습니다.',
      },
      {
        question: '매물 검색은 어떻게 하나요?',
        answer: '상단 메뉴의 "매물검색"에서 거래유형(전세/월세/매매), 매물유형(원룸/투룸/상가 등), 지역 등의 필터를 활용하여 원하는 매물을 찾으실 수 있습니다. "지도검색"을 통해 지도에서 직접 매물 위치를 확인하면서 검색할 수도 있습니다.',
      },
      {
        question: '회원가입은 필수인가요?',
        answer: '매물 검색과 상세 정보 확인은 회원가입 없이 자유롭게 이용 가능합니다. 다만, 찜 목록 저장, 상담 신청 이력 관리 등 일부 기능은 로그인 후 이용하실 수 있습니다.',
      },
      {
        question: '매물 정보는 얼마나 자주 업데이트되나요?',
        answer: '매물 정보는 실시간으로 업데이트됩니다. 새로운 매물이 등록되거나 계약이 완료되면 즉시 반영되어 항상 최신 정보를 확인하실 수 있습니다.',
      },
    ],
  },
  {
    id: 'rental',
    title: '임대차',
    icon: <Home className="w-5 h-5" />,
    items: [
      {
        question: '전세와 월세의 차이는 무엇인가요?',
        answer: '전세는 일정 금액(전세금)을 보증금으로 맡기고 월 임대료 없이 거주하는 방식이며, 계약 종료 시 보증금을 돌려받습니다. 월세는 비교적 적은 보증금에 매달 일정 금액의 임대료를 지불하는 방식입니다.',
      },
      {
        question: '보증금은 안전한가요?',
        answer: '전세보증금 반환보증보험(HUG, SGI 등)에 가입하시면 집주인이 보증금을 돌려주지 못하는 상황에서도 보호받을 수 있습니다. WISHES에서는 안전한 거래를 위해 보증보험 가입을 적극 권장하고 있습니다.',
      },
      {
        question: '중개수수료는 얼마인가요?',
        answer: '중개수수료는 거래금액에 따라 법정 요율이 적용됩니다. 예를 들어, 보증금 5천만원~1억원 미만 주택의 경우 상한 요율 0.4% (한도 30만원)가 적용됩니다. 정확한 수수료는 상담 시 안내해 드립니다.',
      },
      {
        question: '계약 기간은 보통 어떻게 되나요?',
        answer: '주택 임대차의 경우 최소 계약기간은 2년이며 (주택임대차보호법), 상가의 경우 최소 1년입니다 (상가건무임대차보호법). 갱신 시에도 기존 조건으로 연장 요청이 가능합니다.',
      },
    ],
  },
  {
    id: 'commercial',
    title: '상업용 부동산',
    icon: <Building2 className="w-5 h-5" />,
    items: [
      {
        question: '상가 매물의 권리금이란 무엇인가요?',
        answer: '권리금은 기존 임차인이 영업을 통해 형성한 고객, 명성, 시설 등의 가치에 대해 새로운 임차인이 지불하는 금액입니다. 바닥 권리금(위치), 시설 권리금(인테리어/설비), 영업 권리금(고객/매출) 등으로 구분됩니다.',
      },
      {
        question: '상가 월세에 부가세가 포함되나요?',
        answer: '상가 임대의 경우 임대료에 부가가치세(10%)가 별도로 부과됩니다. 매물 정보에 "부가세별도" 또는 "부가세포함"으로 표기되어 있으니 확인해 주세요. 세금계산서 발행 관련 사항도 계약 시 확인하시기 바랍니다.',
      },
      {
        question: '사무실을 구할 때 주의할 점은?',
        answer: '사무실 선택 시 주요 확인 사항은 다음과 같습니다: 1) 전용면적과 공용묹적 비율, 2) 관리비 포함 항목(전기, 냉난방, 수도 등), 3) 주차 가능 여부 및 추가 비용, 4) 인터넷/통신 인프라, 5) 건물 보안 및 출입 시스템, 6) 임대차 계약 조건(보증금, 기간, 원상복구 의무 등).',
      },
    ],
  },
  {
    id: 'payment',
    title: '비용·계산',
    icon: <CreditCard className="w-5 h-5" />,
    items: [
      {
        question: '대출 계산기는 어떻게 사용하나요?',
        answer: '"대출계산기" 메뉴에서 대출 금액, 이자율, 상환 기간을 입력하시면 월 상환금과 총 이자를 자동으로 계산해 드립니다. 원리기균등상환, 원금균등상환, 만기일시상환 등 다양한 상환 방식을 비교할 수 있습니다.',
      },
      {
        question: '초기 비용은 어떤 것들이 있나요?',
        answer: '일반적으로 보증금(또는 전세금), 첫 달 월세, 중개수수료, 이사 비용이 필요합니다. 상가의 경우 권리금, 인테리어 비용, 사업자등록 관련 비용이 추가될 수 있습니다. 상세한 비용 상담은 WISHES에서 도와드립니다.',
      },
    ],
  },
  {
    id: 'safety',
    title: '안전거래',
    icon: <ShieldCheck className="w-5 h-5" />,
    items: [
      {
        question: '안전한 부동산 거래를 위해 어떤 것을 확인해야 하나요?',
        answer: '계약 전 반드시 확인하세요: 1) 등기부등본 확인(소유권, 근저당, 가앥류 등), 2) 건축물대장 확인(위반건축물 여부), 3) 임대인 신분 확인, 4) 전세보증금반환보증보험 가입 가능 여부, 5) 확정일자 및 전입신고. WISHES에서 안전거래를 위한 체크리스트를 제공해 드립니다.',
      },
      {
        question: '허위 매물은 어떻게 구분하나요?',
        answer: 'WISHES는 실매물만 등록하는 것을 원칙으로 합니다. 시세보다 현저히 저렴한 매물, 사진이 지나치게 좋은 매물, 급하게 계약을 요구하는 경우 등은 주의가 필요합니다. 의심스러운 매물이 있으시면 언제든 WISHES에 문의해 주세요.',
      },
    ],
  },
  {
    id: 'contact',
    title: '상담·접수',
    icon: <Phone className="w-5 h-5" />,
    items: [
      {
        question: '상담은 어떻게 신청하나요?',
        answer: '상단 메뉴의 "상담·매물접수"를 클릭하시면 상담 신청 폼이 나옵니다. 이름, 연락처, 문의 유형, 희망 매물 조건 등을 입력해 주시면 빠른 시일 내에 전문 상담사가 연락드립니다.',
      },
      {
        question: '매물을 내놓고 싶은데 어떻게 하나요?',
        answer: '"상담·매물접수" 페이지에서 "매물접수" 탭을 선택하시면 매물 등록 신청이 가능합니다. 매물 유형, 위치, 면적, 가격 등의 정보를 입력해 주시면 담당자가 확인 후 연락드립니다.',
      },
      {
        question: '영업 시간은 어떻게 되나요?',
        answer: 'WISHES는 평일 09:00~19:00 운영됩니다 (주말 예약상담 가능). 온라인 상담 신청은 24시간 가능하며, 영업시간 외 접수 건은 다음 영업일에 순차적으로 연락드립니다.',
      },
    ],
  },
];

function FAQAccordion({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-800 pr-4">{item.question}</span>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-gray-500 shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180 text-wishes-secondary'
          )}
        />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
          {item.answer}
        </div>
      </div>
    </div>
  );
}

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState('general');
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState('');

  const currentCategory = faqCategories.find((c) => c.id === activeCategory);

  // 검색 기능
  const filteredItems = searchQuery.trim()
    ? faqCategories.flatMap((cat) =>
        cat.items
          .filter(
            (item) =>
              item.question.includes(searchQuery) || item.answer.includes(searchQuery)
          )
          .map((item) => ({ ...item, category: cat.title }))
      )
    : null;

  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      {/* 헤더 */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-bold drop-shadow-lg">자주 묻는 질문</h1>
          <p className="mt-3 text-lg text-white/80">
            궁금한 점을 빠르게 찾아보세요
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 -mt-8 relative z-10">
        {/* 검색 */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOpenIndex(null);
              }}
              placeholder="질문을 검색해보세요..."
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* 검색 결과 */}
        {filteredItems ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-8">
            <p className="text-sm text-gray-500 mb-4">
              &ldquo;{searchQuery}&rdquo; 검색 결과: {filteredItems.length}건
            </p>
            {filteredItems.length > 0 ? (
              <div className="space-y-3">
                {filteredItems.map((item, idx) => (
                  <FAQAccordion
                    key={idx}
                    item={item}
                    isOpen={openIndex === idx}
                    onToggle={() => setOpenIndex(openIndex === idx ? null : idx)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">
                검색 결과가 없습니다. 다른 키워드로 검색해보세요.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* 카테고리 탭 */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6">
              <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-200">
                {faqCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setOpenIndex(0);
                    }}
                    className={cn(
                      'flex items-center gap-2 px-5 py-4 text-sm font-semibold whitespace-nowrap transition-all border-b-2 shrink-0',
                      activeCategory === cat.id
                        ? 'text-wishes-primary border-wishes-primary bg-wishes-cream/20'
                        : 'text-gray-500 border-transparent hover:text-gray-900'
                    )}
                  >
                    {cat.icon}
                    {cat.title}
                  </button>
                ))}
              </div>
            </div>

            {/* FAQ 목록 */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-8">
              <div className="space-y-3">
                {currentCategory?.items.map((item, idx) => (
                  <FAQAccordion
                    key={idx}
                    item={item}
                    isOpen={openIndex === idx}
                    onToggle={() => setOpenIndex(openIndex === idx ? null : idx)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* 추가 문의 안내 */}
        <div className="text-center pb-12">
          <p className="text-sm text-gray-500 mb-3">원하시는 답변을 찾지 못하셨나요?</p>
          <a
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 bg-wishes-primary text-white rounded-xl font-semibold hover:bg-wishes-secondary transition-colors"
          >
            <Phone className="w-4 h-4" />
            상담 신청하기
          </a>
        </div>
      </div>
    </div>
  );
}
