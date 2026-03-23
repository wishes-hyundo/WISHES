'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Phone, Mail, MapPin, Send, CheckCircle, MessageCircle } from 'lucide-react';

export default function ContactPage() {
  const searchParams = useSearchParams();
  const listingId = searchParams.get('listing');

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    message: listingId ? `매물 #${listingId}에 대해 상담 요청합니다.\n\n` : '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          listingId: listingId ? parseInt(listingId) : null,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      }
    } catch (error) {
      console.error('상담 신청 실패:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="pt-16 min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-wishes-primary mb-2">상담 신청 완료</h2>
          <p className="text-gray-600 mb-6">
            빠른 시일 내에 연락드리겠습니다.<br />
            급하시 경우 전화로 문의해 주세요.
          </p>
          <a
            href="tel:1533-9580"
            className="inline-flex items-center gap-2 bg-wishes-primary text-white px-6 py-3 rounded-xl font-bold"
          >
            <Phone className="w-5 h-5" />
            1533-9580
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 min-h-screen">
      {/* 헤더 */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h1 className="text-3xl font-bold">상담 문의</h1>
          <p className="mt-2 text-blue-200">최시스부동산에 문의하세요</p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 연락처 정보 */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-wishes-primary mb-4">연락처</h2>

            <a href="tel:1533-9580" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-wishes-secondary transition-colors">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Phone className="w-5 h-5 text-wishes-secondary" />
              </div>
              <div>
                <p className="text-xs text-gray-500">전화 상담</p>
                <p className="font-bold text-wishes-primary">1533-9580</p>
              </div>
            </a>

            <a href="https://pf.kakao.com/_xnxaxjxj" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-yellow-400 transition-colors">
              <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">카카오톡 상담</p>
                <p className="font-bold text-yellow-700">카카오톡 채널</p>
              </div>
            </a>

            <a href="mailto:wishes@wishes.co.kr" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-wishes-secondary transition-colors">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-wishes-secondary" />
              </div>
              <div>
                <p className="text-xs text-gray-500">이메일</p>
                <p className="font-bold text-wishes-primary">wishes@wishes.co.kr</p>
              </div>
            </a>

            <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-wishes-secondary" />
              </div>
              <div>
                <p className="text-xs text-gray-500">방문 상담</p>
                <p className="text-sm font-medium text-gray-700">관악구 신림로64길 23, 8층</p>
              </div>
            </div>
          </div>

          {/* 상담 신청 폼 */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8">
              <h2 className="text-lg font-bold text-wishes-primary mb-6">온라인 상담 신청</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                    placeholder="홍길동"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">연락처 *</label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                    placeholder="010-0000-0000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">문의 내용</label>
                  <textarea
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary resize-none"
                    placeholder="원하시는 매물 조건이나 문의 내용을 적어주세요"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? '전송 중...' : '상담 신청하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
