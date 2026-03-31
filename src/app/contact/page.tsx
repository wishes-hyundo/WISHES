'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, CheckCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function ContactPage() {
  return (
    <Suspense fallback={<div className="pt-16 min-h-screen flex items-center justify-center"><p className="text-gray-500">로딩 중...</p></div>}>
      <ContactPageInner />
    </Suspense>
  );
}

function ContactPageInner() {
  const searchParams = useSearchParams();
  const listingId = searchParams.get('listing');
  const { user } = useAuth();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    message: listingId ? `매물 #${listingId}에 대해 상담 요청합니다.\n\n` : '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 로그인 사용자 정보 자동입력
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || user.user_metadata?.full_name || user.user_metadata?.name || '',
        email: prev.email || user.email || '',
        phone: prev.phone || user.user_metadata?.phone || '',
      }));
    }
  }, [user]);

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
      <div className="pt-16 min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-wishes-primary mb-3">상담 신청 완료</h2>
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
          <h1 className="text-3xl md:text-4xl font-bold drop-shadow-lg">상담 문의</h1>
          <p className="mt-3 text-lg text-white/80">
            궁금한 점이 있으시면 편하게 문의해 주세요
          </p>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 -mt-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 md:p-10">
          {user && (
            <div className="mb-5 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
              로그인 정보로 자동 입력되었습니다. 수정이 필요하면 직접 변경해주세요.
            </div>
          )}
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">이름 *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">연락처 *</label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                  placeholder="010-0000-0000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">문의 내용</label>
              <textarea
                rows={6}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all resize-none"
                placeholder="원하시는 매물 조건이나 문의 내용을 적어주세요"
              />
            </div>

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
      </div>

      <div className="h-20" />
    </div>
  );
}
