'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, CheckCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ContactPage() {
  return (
    <Suspense fallback={<div className="pt-16 min-h-screen flex items-center justify-center"><p className="text-gray-500">로딩 중...</p></div>}>
      <ContactPageInner />
    </Suspense>
  );
}

type TabType = 'consultation' | 'listing';

function ContactPageInner() {
  const searchParams = useSearchParams();
  const listingId = searchParams.get('listing');

  const [activeTab, setActiveTab] = useState<TabType>('consultation');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const [consultationForm, setConsultationForm] = useState({
    name: '',
    phone: '',
    email: '',
    inquiry_type: '',
    property_type: '',
    preferred_area: '',
    budget_range: '',
    move_date: '',
    business_category: '',
    preferred_floor: '',
    additional_requirements: '',
  });

  const [listingForm, setListingForm] = useState({
    name: '',
    phone: '',
    email: '',
    property_type: '',
    deal: '',
    address: '',
    address_detail: '',
    area_m2: '',
    floor_current: '',
    deposit: '',
    monthly: '',
    price: '',
    business_category: '',
    goodwill_fee: '',
    vat_included: 'true',
    maintenance_fee: '',
    description: '',
  });

  const handleConsultationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: consultationForm.name,
          phone: consultationForm.phone,
          email: consultationForm.email || null,
          message: `
문의 유형: ${consultationForm.inquiry_type}
희망 매물 유형: ${consultationForm.property_type}
희망 지역: ${consultationForm.preferred_area}
예산 범위: ${consultationForm.budget_range}
입주 예정일: ${consultationForm.move_date}
${consultationForm.business_category ? `업종: ${consultationForm.business_category}` : ''}
${consultationForm.preferred_floor ? `희망 층수: ${consultationForm.preferred_floor}` : ''}
${consultationForm.additional_requirements ? `추가 요청사항: ${consultationForm.additional_requirements}` : ''}
          `.trim(),
          listingId: listingId ? parseInt(listingId) : null,
          inquiry_type: 'consultation',
          property_type: consultationForm.property_type || null,
          preferred_area: consultationForm.preferred_area || null,
          budget_range: consultationForm.budget_range || null,
          move_date: consultationForm.move_date || null,
          business_category: consultationForm.business_category || null,
          preferred_floor: consultationForm.preferred_floor || null,
          additional_requirements: consultationForm.additional_requirements || null,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        setError('상담 신청에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch (err) {
      console.error('상담 신청 실패:', err);
      setError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: listingForm.name,
          phone: listingForm.phone,
          email: listingForm.email || null,
          message: `
매물 유형: ${listingForm.property_type}
거래 유형: ${listingForm.deal}
주소: ${listingForm.address} ${listingForm.address_detail}
전용면적: ${listingForm.area_m2}㎡
층수: ${listingForm.floor_current}
보증금: ${listingForm.deposit}만원
월세: ${listingForm.monthly}만원
매매가: ${listingForm.price}만원
${listingForm.business_category ? `업종: ${listingForm.business_category}` : ''}
${listingForm.goodwill_fee ? `권리금: ${listingForm.goodwill_fee}만원` : ''}
${listingForm.maintenance_fee ? `관리비: ${listingForm.maintenance_fee}만원` : ''}
부가세: ${listingForm.vat_included === 'true' ? '포함' : '별도'}
매물 설명:
${listingForm.description}
          `.trim(),
          inquiry_type: 'listing',
          property_type: listingForm.property_type || null,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        setError('매물 접수에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch (err) {
      console.error('매물 접수 실패:', err);
      setError('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="pt-16 min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-wishes-primary mb-3">
            {activeTab === 'consultation' ? '상담 신청 완료' : '매물 접수 완료'}
          </h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            접수가 완료되었습니다.<br />
            빠른 시일 내에 연락드리겠습니다.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-wishes-secondary font-semibold hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      {/* 헤더 */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-bold drop-shadow-lg">상담·매물접수</h1>
          <p className="mt-3 text-lg text-white/80">
            궁금한 점이 있으시면 편하게 문의해 주세요
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 -mt-8 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
          {/* 탭 */}
          <div className="flex border-b border-gray-200 rounded-t-2xl overflow-hidden">
            <button
              onClick={() => { setActiveTab('consultation'); setError(''); }}
              className={`flex-1 py-4 px-4 md:px-6 font-semibold text-center transition-all ${
                activeTab === 'consultation'
                  ? 'text-wishes-primary border-b-2 border-wishes-primary bg-wishes-cream/20'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              상담문의
            </button>
            <button
              onClick={() => { setActiveTab('listing'); setError(''); }}
              className={`flex-1 py-4 px-4 md:px-6 font-semibold text-center transition-all ${
                activeTab === 'listing'
                  ? 'text-wishes-primary border-b-2 border-wishes-primary bg-wishes-cream/20'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              매물접수
            </button>
          </div>

          {/* 상담문의 폼 */}
          {activeTab === 'consultation' && (
            <form onSubmit={handleConsultationSubmit} className="p-8 md:p-10">
              <div className="space-y-5">
                {/* 기본 정보 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">이름 *</label>
                    <input
                      type="text"
                      required
                      value={consultationForm.name}
                      onChange={(e) => setConsultationForm({ ...consultationForm, name: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="홍길동"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">연락처 *</label>
                    <input
                      type="tel"
                      required
                      inputMode="tel"
                      value={consultationForm.phone}
                      onChange={(e) => setConsultationForm({ ...consultationForm, phone: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="010-0000-0000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
                  <input
                    type="email"
                    value={consultationForm.email}
                    onChange={(e) => setConsultationForm({ ...consultationForm, email: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                    placeholder="email@example.com"
                  />
                </div>

                {/* 상담 정보 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">문의 유형 *</label>
                  <select
                    required
                    value={consultationForm.inquiry_type}
                    onChange={(e) => setConsultationForm({ ...consultationForm, inquiry_type: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                  >
                    <option value="">선택해주세요</option>
                    <option value="매물 찾기">매물 찾기</option>
                    <option value="투자 상담">투자 상담</option>
                    <option value="매도·임대 상담">매도·임대 상담</option>
                    <option value="기타">기타</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">희망 매물 유형</label>
                  <select
                    value={consultationForm.property_type}
                    onChange={(e) => setConsultationForm({ ...consultationForm, property_type: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                  >
                    <option value="">선택해주세요</option>
                    <option value="원룸">원룸</option>
                    <option value="투룸">투룸</option>
                    <option value="쓰리룸">쓰리룸</option>
                    <option value="오피스텔">오피스텔</option>
                    <option value="아파트">아파트</option>
                    <option value="상가">상가</option>
                    <option value="사무실">사무실</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">희망 지역</label>
                    <input
                      type="text"
                      value={consultationForm.preferred_area}
                      onChange={(e) => setConsultationForm({ ...consultationForm, preferred_area: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="예: 강남구, 서초구"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">예산 범위</label>
                    <input
                      type="text"
                      value={consultationForm.budget_range}
                      onChange={(e) => setConsultationForm({ ...consultationForm, budget_range: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="예: 1,000~2,000만원"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">입주 예정일</label>
                    <input
                      type="date"
                      value={consultationForm.move_date}
                      onChange={(e) => setConsultationForm({ ...consultationForm, move_date: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                    />
                  </div>
                  {consultationForm.property_type === '상가' || consultationForm.property_type === '사무실' ? (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">업종</label>
                      <input
                        type="text"
                        value={consultationForm.business_category}
                        onChange={(e) => setConsultationForm({ ...consultationForm, business_category: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="예: 카페, 음식점"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">희망 층수</label>
                      <input
                        type="text"
                        value={consultationForm.preferred_floor}
                        onChange={(e) => setConsultationForm({ ...consultationForm, preferred_floor: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="예: 2층, 저층"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">추가 요청사항</label>
                  <textarea
                    rows={5}
                    value={consultationForm.additional_requirements}
                    onChange={(e) => setConsultationForm({ ...consultationForm, additional_requirements: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all resize-none"
                    placeholder="원하시는 매물 조건이나 추가 요청사항을 적어주세요"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-wishes-primary text-white py-3.5 rounded-xl font-bold text-base hover:bg-wishes-secondary transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? '전송 중...' : '상담 신청하기'}
                </button>
              </div>
            </form>
          )}

          {/* 매물접수 폼 */}
          {activeTab === 'listing' && (
            <form onSubmit={handleListingSubmit} className="p-8 md:p-10">
              <div className="space-y-5">
                {/* 소유자 정보 */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">소유자 정보</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">이름 *</label>
                      <input
                        type="text"
                        required
                        value={listingForm.name}
                        onChange={(e) => setListingForm({ ...listingForm, name: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="홍길동"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">연락처 *</label>
                      <input
                        type="tel"
                        required
                        inputMode="tel"
                        value={listingForm.phone}
                        onChange={(e) => setListingForm({ ...listingForm, phone: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="010-0000-0000"
                      />
                    </div>
                  </div>
                  <div className="mt-5">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
                    <input
                      type="email"
                      value={listingForm.email}
                      onChange={(e) => setListingForm({ ...listingForm, email: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                {/* 매물 정보 */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">매물 정보</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">매물 유형 *</label>
                      <select
                        required
                        value={listingForm.property_type}
                        onChange={(e) => setListingForm({ ...listingForm, property_type: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      >
                        <option value="">선택해주세요</option>
                        <option value="원룸">원룸</option>
                        <option value="투룸">투룸</option>
                        <option value="쓰리룸">쓰리룸</option>
                        <option value="오피스텔">오피스텔</option>
                        <option value="아파트">아파트</option>
                        <option value="상가">상가</option>
                        <option value="사무실">사무실</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">거래 유형 *</label>
                      <select
                        required
                        value={listingForm.deal}
                        onChange={(e) => setListingForm({ ...listingForm, deal: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      >
                        <option value="">선택해주세요</option>
                        <option value="전세">전세</option>
                        <option value="월세">월세</option>
                        <option value="매매">매매</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 위치 정보 */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">위치 정보</h3>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">주소 *</label>
                    <input
                      type="text"
                      required
                      value={listingForm.address}
                      onChange={(e) => setListingForm({ ...listingForm, address: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="서울시 강남구 강남대로 123"
                    />
                  </div>
                  <div className="mt-5">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">상세주소</label>
                    <input
                      type="text"
                      value={listingForm.address_detail}
                      onChange={(e) => setListingForm({ ...listingForm, address_detail: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="301호, 테라스 빌딩 등"
                    />
                  </div>
                </div>

                {/* 규모 정보 */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">규모 정보</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">전용면적 (㎡) *</label>
                      <input
                        type="number"
                        required
                        value={listingForm.area_m2}
                        onChange={(e) => setListingForm({ ...listingForm, area_m2: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">층수 *</label>
                      <input
                        type="text"
                        required
                        value={listingForm.floor_current}
                        onChange={(e) => setListingForm({ ...listingForm, floor_current: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="2층"
                      />
                    </div>
                  </div>
                </div>

                {/* 가격 정보 */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">가격 정보</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">보증금 (만원)</label>
                      <input
                        type="number"
                        value={listingForm.deposit}
                        onChange={(e) => setListingForm({ ...listingForm, deposit: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="1,000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">월세 (만원)</label>
                      <input
                        type="number"
                        value={listingForm.monthly}
                        onChange={(e) => setListingForm({ ...listingForm, monthly: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">매매가 (만원)</label>
                      <input
                        type="number"
                        value={listingForm.price}
                        onChange={(e) => setListingForm({ ...listingForm, price: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="50,000"
                      />
                    </div>
                  </div>
                </div>

                {/* 상업용 추가 정보 */}
                {(listingForm.property_type === '상가' || listingForm.property_type === '사무실') && (
                  <div className="border-b border-gray-200 pb-5 mb-5">
                    <h3 className="font-semibold text-gray-900 mb-4">상업용 정보</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">업종</label>
                        <input
                          type="text"
                          value={listingForm.business_category}
                          onChange={(e) => setListingForm({ ...listingForm, business_category: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                          placeholder="카페, 음식점 등"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">권리금 (만원)</label>
                        <input
                          type="number"
                          value={listingForm.goodwill_fee}
                          onChange={(e) => setListingForm({ ...listingForm, goodwill_fee: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                          placeholder="500"
                        />
                      </div>
                    </div>
                    <div className="mt-5 flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={listingForm.vat_included === 'true'}
                          onChange={() => setListingForm({ ...listingForm, vat_included: 'true' })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-700">부가세 포함</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={listingForm.vat_included === 'false'}
                          onChange={() => setListingForm({ ...listingForm, vat_included: 'false' })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-700">부가세 별도</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* 관리비 */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">관리비 (만원)</label>
                  <input
                    type="number"
                    value={listingForm.maintenance_fee}
                    onChange={(e) => setListingForm({ ...listingForm, maintenance_fee: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                    placeholder="10"
                  />
                </div>

                {/* 매물 설명 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">매물 설명</label>
                  <textarea
                    rows={5}
                    value={listingForm.description}
                    onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all resize-none"
                    placeholder="매물의 특징, 장점, 옵션 등을 상세히 입력해주세요"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-wishes-primary text-white py-3.5 rounded-xl font-bold text-base hover:bg-wishes-secondary transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? '전송 중...' : '매물 접수하기'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="h-20" />
    </div>
  );
}
