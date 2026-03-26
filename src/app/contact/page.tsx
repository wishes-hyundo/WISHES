'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, CheckCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ContactPage() {
  return (
    <Suspense fallback={<div className="pt-16 min-h-screen flex items-center justify-center"><p className="text-gray-500">ë¡ë© ì¤...</p></div>}>
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
    message: listingId ? `ë§¤ë¬¼ #${listingId}ì ëí´ ìë´ ìì²­í©ëë¤.\n\n` : '',
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
      console.error('ìë´ ì ì²­ ì¤í¨:', error);
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
          <h2 className="text-2xl font-bold text-wishes-primary mb-3">ìë´ ì ì²­ ìë£</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            ì ìê° ìë£ëììµëë¤.<br />
            ë¹ ë¥¸ ìì¼ ë´ì ì°ë½ëë¦¬ê² ìµëë¤.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-wishes-secondary font-semibold hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            íì¼ë¡ ëìê°ê¸°
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      {/* í¤ë */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-bold drop-shadow-lg">ìë´ ë¬¸ì</h1>
          <p className="mt-3 text-lg text-white/80">
            ê¶ê¸í ì ì´ ìì¼ìë©´ í¸íê² ë¬¸ìí´ ì£¼ì¸ì
          </p>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 -mt-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 md:p-10">
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">ì´ë¦ *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                  placeholder="íê¸¸ë"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">ì°ë½ì² *</label>
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">ì´ë©ì¼</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                placeholder="email@example.com"
              />
            </div>

            <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">문의 유형</label>
            <select
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-wishes-green/30 focus:border-wishes-green text-sm bg-white"
              defaultValue=""
            >
              <option value="" disabled>문의 유형을 선택해주세요</option>
              <option value="property">매물 문의</option>
              <option value="buy-sell">매도·매수 상담</option>
              <option value="rent">전·월세 상담</option>
              <option value="loan">대출 상담</option>
              <option value="other">기타 문의</option>
            </select>

              <label className="block text-sm font-semibold text-gray-700 mb-2">ë¬¸ì ë´ì©</label>
              <textarea
                rows={6}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all resize-none"
                placeholder="ìíìë ë§¤ë¬¼ ì¡°ê±´ì´ë ë¬¸ì ë´ì©ì ì ì´ì£¼ì¸ì"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-wishes-primary text-white py-3.5 rounded-xl font-bold text-base hover:bg-wishes-secondary transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'ì ì¡ ì¤...' : 'ìë´ ì ì²­íê¸°'}
            </button>
          </div>
        </form>
      </div>

      <div className="h-20" />
    </div>
  );
}
