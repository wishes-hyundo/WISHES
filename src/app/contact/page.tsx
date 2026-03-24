'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Phone, Mail, MapPin, Send, CheckCircle, MessageCircle } from 'lucide-react';

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
      <div className="pt-16 min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-wishes-primary mb-2">ìë´ ì ì²­ ìë£</h2>
          <p className="text-gray-600 mb-6">
            ë¹ ë¥¸ ìì¼ ë´ì ì°ë½ëë¦¬ê² ìµëë¤.<br />
            ê¸íì  ê²½ì° ì íë¡ ë¬¸ìí´ ì£¼ì¸ì.
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
      {/* í¤ë */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h1 className="text-3xl font-bold">ìë´ ë¬¸ì</h1>
          <p className="mt-2 text-blue-200">ììì¤ë¶ëì°ì ë¬¸ìíì¸ì</p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ì°ë½ì² ì ë³´ */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-wishes-primary mb-4">ì°ë½ì²</h2>

            <a href="tel:1533-9580" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-wishes-secondary transition-colors">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Phone className="w-5 h-5 text-wishes-secondary" />
              </div>
              <div>
                <p className="text-xs text-gray-500">ì í ìë´</p>
                <p className="font-bold text-wishes-primary">1533-9580</p>
              </div>
            </a>

            <a href="https://pf.kakao.com/_DxdSJs" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-yellow-400 transition-colors">
              <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">ì¹´ì¹´ì¤í¡ ìë´</p>
                <p className="font-bold text-yellow-700">ì¹´ì¹´ì¤í¡ ì±ë</p>
              </div>
            </a>

            <a href="mailto:wishes@wishes.co.kr" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-wishes-secondary transition-colors">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-wishes-secondary" />
              </div>
              <div>
                <p className="text-xs text-gray-500">ì´ë©ì¼</p>
                <p className="font-bold text-wishes-primary">wishes@wishes.co.kr</p>
              </div>
            </a>

            <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-wishes-secondary" />
              </div>
              <div>
                <p className="text-xs text-gray-500">ë°©ë¬¸ ìë´</p>
                <p className="text-sm font-medium text-gray-700">ê´ìêµ¬ ì ë¦¼ë¡64ê¸¸ 23, 8ì¸µ</p>
              </div>
            </div>
          </div>

          {/* ìë´ ì ì²­ í¼ */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8">
              <h2 className="text-lg font-bold text-wishes-primary mb-6">ì¨ë¼ì¸ ìë´ ì ì²­</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ì´ë¦ *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                    placeholder="íê¸¸ë"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ì°ë½ì² *</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">ì´ë©ì¼</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ë¬¸ì ë´ì©</label>
                  <textarea
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary resize-none"
                    placeholder="ìíìë ë§¤ë¬¼ ì¡°ê±´ì´ë ë¬¸ì ë´ì©ì ì ì´ì£¼ì¸ì"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-wishes-primary text-white py-3 rounded-xl font-bold hover:bg-wishes-secondary transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'ì ì¡ ì¤...' : 'ìë´ ì ì²­íê¸°'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
