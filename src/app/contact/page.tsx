'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Phone, Mail, MapPin, Send, CheckCircle, MessageCircle } from 'lucide-react';

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
            급하신 경우 전화로 문의해 주세요.
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
          <p className="mt-2 text-blue-200">위시스부동산에 문의하세요</p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 연락처 정보 */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-wishes-primary mb-4">연락처</h2>
