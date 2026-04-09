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
ë¬¸ì ì í: ${consultationForm.inquiry_type}
í¬ë§ ë§¤ë¬¼ ì í: ${consultationForm.property_type}
í¬ë§ ì§ì­: ${consultationForm.preferred_area}
ìì° ë²ì: ${consultationForm.budget_range}
ìì£¼ ìì ì¼: ${consultationForm.move_date}
${consultationForm.business_category ? `ìì¢: ${consultationForm.business_category}` : ''}
${consultationForm.preferred_floor ? `í¬ë§ ì¸µì: ${consultationForm.preferred_floor}` : ''}
${consultationForm.additional_requirements ? `ì¶ê° ìì²­ì¬í­: ${consultationForm.additional_requirements}` : ''}
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
        setError('ìë´ ì ì²­ì ì¤í¨íìµëë¤. ì ì í ë¤ì ìëí´ì£¼ì¸ì.');
      }
    } catch (err) {
      console.error('ìë´ ì ì²­ ì¤í¨:', err);
      setError('ë¤í¸ìí¬ ì¤ë¥ê° ë°ìíìµëë¤. ì¸í°ë· ì°ê²°ì íì¸í´ì£¼ì¸ì.');
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
ë§¤ë¬¼ ì í: ${listingForm.property_type}
ê±°ë ì í: ${listingForm.deal}
ì£¼ì: ${listingForm.address} ${listingForm.address_detail}
ì ì©ë©´ì : ${listingForm.area_m2}ã¡
ì¸µì: ${listingForm.floor_current}
ë³´ì¦ê¸: ${listingForm.deposit}ë§ì
ìì¸: ${listingForm.monthly}ë§ì
ë§¤ë§¤ê°: ${listingForm.price}ë§ì
${listingForm.business_category ? `ìì¢: ${listingForm.business_category}` : ''}
${listingForm.goodwill_fee ? `ê¶ë¦¬ê¸: ${listingForm.goodwill_fee}ë§ì` : ''}
${listingForm.maintenance_fee ? `ê´ë¦¬ë¹: ${listingForm.maintenance_fee}ë§ì` : ''}
ë¶ê°ì¸: ${listingForm.vat_included === 'true' ? 'í¬í¨' : 'ë³ë'}
ë§¤ë¬¼ ì¤ëª:
${listingForm.description}
          `.trim(),
          inquiry_type: 'listing',
          property_type: listingForm.property_type || null,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        setError('ë§¤ë¬¼ ì ìì ì¤í¨íìµëë¤. ì ì í ë¤ì ìëí´ì£¼ì¸ì.');
      }
    } catch (err) {
      console.error('ë§¤ë¬¼ ì ì ì¤í¨:', err);
      setError('ë¤í¸ìí¬ ì¤ë¥ê° ë°ìíìµëë¤. ì¸í°ë· ì°ê²°ì íì¸í´ì£¼ì¸ì.');
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
            {activeTab === 'consultation' ? 'ìë´ ì ì²­ ìë£' : 'ë§¤ë¬¼ ì ì ìë£'}
          </h2>
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
          <h1 className="text-3xl md:text-4xl font-bold drop-shadow-lg">ìë´Â·ë§¤ë¬¼ì ì</h1>
          <p className="mt-3 text-lg text-white/80">
            ê¶ê¸í ì ì´ ìì¼ìë©´ í¸íê² ë¬¸ìí´ ì£¼ì¸ì
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 -mt-8 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
          {/* í­ */}
          <div className="flex border-b border-gray-200 rounded-t-2xl overflow-hidden">
            <button
              onClick={() => { setActiveTab('consultation'); setError(''); }}
              className={`flex-1 py-4 px-4 md:px-6 font-semibold text-center transition-all ${
                activeTab === 'consultation'
                  ? 'text-wishes-primary border-b-2 border-wishes-primary bg-wishes-cream/20'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ìë´ë¬¸ì
            </button>
            <button
              onClick={() => { setActiveTab('listing'); setError(''); }}
              className={`flex-1 py-4 px-4 md:px-6 font-semibold text-center transition-all ${
                activeTab === 'listing'
                  ? 'text-wishes-primary border-b-2 border-wishes-primary bg-wishes-cream/20'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ë§¤ë¬¼ì ì
            </button>
          </div>

          {/* ìë´ë¬¸ì í¼ */}
          {activeTab === 'consultation' && (
            <form onSubmit={handleConsultationSubmit} className="p-8 md:p-10">
              <div className="space-y-5">
                {/* ê¸°ë³¸ ì ë³´ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">ì´ë¦ *</label>
                    <input
                      type="text"
                      required
                      value={consultationForm.name}
                      onChange={(e) => setConsultationForm({ ...consultationForm, name: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="íê¸¸ë"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">ì°ë½ì² *</label>
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
                  <label className="block text-sm font-semibold text-gray-700 mb-2">ì´ë©ì¼</label>
                  <input
                    type="email"
                    value={consultationForm.email}
                    onChange={(e) => setConsultationForm({ ...consultationForm, email: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                    placeholder="email@example.com"
                  />
                </div>

                {/* ìë´ ì ë³´ */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">ë¬¸ì ì í *</label>
                  <select
                    required
                    value={consultationForm.inquiry_type}
                    onChange={(e) => setConsultationForm({ ...consultationForm, inquiry_type: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                  >
                    <option value="">ì íí´ì£¼ì¸ì</option>
                    <option value="ë§¤ë¬¼ ì°¾ê¸°">ë§¤ë¬¼ ì°¾ê¸°</option>
                    <option value="í¬ì ìë´">í¬ì ìë´</option>
                    <option value="ë§¤ëÂ·ìë ìë´">ë§¤ëÂ·ìë ìë´</option>
                    <option value="ê¸°í">ê¸°í</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">í¬ë§ ë§¤ë¬¼ ì í</label>
                  <select
                    value={consultationForm.property_type}
                    onChange={(e) => setConsultationForm({ ...consultationForm, property_type: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                  >
                    <option value="">ì íí´ì£¼ì¸ì</option>
                    <option value="ìë£¸">ìë£¸</option>
                    <option value="í¬ë£¸">í¬ë£¸</option>
                    <option value="ì°ë¦¬ë£¸">ì°ë¦¬ë£¸</option>
                    <option value="ì¤í¼ì¤í">ì¤í¼ì¤í</option>
                    <option value="ìíí¸">ìíí¸</option>
                    <option value="ìê°">ìê°</option>
                    <option value="ì¬ë¬´ì¤">ì¬ë¬´ì¤</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">í¬ë§ ì§ì­</label>
                    <input
                      type="text"
                      value={consultationForm.preferred_area}
                      onChange={(e) => setConsultationForm({ ...consultationForm, preferred_area: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="ì: ê°ë¨êµ¬, ìì´êµ¬"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">ìì° ë²ì</label>
                    <input
                      type="text"
                      value={consultationForm.budget_range}
                      onChange={(e) => setConsultationForm({ ...consultationForm, budget_range: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="ì: 1,000~2,000ë§ì"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">ìì£¼ ìì ì¼</label>
                    <input
                      type="date"
                      value={consultationForm.move_date}
                      onChange={(e) => setConsultationForm({ ...consultationForm, move_date: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                    />
                  </div>
                  {consultationForm.property_type === 'ìê°' || consultationForm.property_type === 'ì¬ë¬´ì¤' ? (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ìì¢</label>
                      <input
                        type="text"
                        value={consultationForm.business_category}
                        onChange={(e) => setConsultationForm({ ...consultationForm, business_category: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="ì: ì¹´í, ììì "
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">í¬ë§ ì¸µì</label>
                      <input
                        type="text"
                        value={consultationForm.preferred_floor}
                        onChange={(e) => setConsultationForm({ ...consultationForm, preferred_floor: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="ì: 2ì¸µ, ì ì¸µ"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">ì¶ê° ìì²­ì¬í­</label>
                  <textarea
                    rows={5}
                    value={consultationForm.additional_requirements}
                    onChange={(e) => setConsultationForm({ ...consultationForm, additional_requirements: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all resize-none"
                    placeholder="ìíìë ë§¤ë¬¼ ì¡°ê±´ì´ë ì¶ê° ìì²­ì¬í­ì ì ì´ì£¼ì¸ì"
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
                  {submitting ? 'ì ì¡ ì¤...' : 'ìë´ ì ì²­íê¸°'}
                </button>
              </div>
            </form>
          )}

          {/* ë§¤ë¬¼ì ì í¼ */}
          {activeTab === 'listing' && (
            <form onSubmit={handleListingSubmit} className="p-8 md:p-10">
              <div className="space-y-5">
                {/* ìì ì ì ë³´ */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">ìì ì ì ë³´</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ì´ë¦ *</label>
                      <input
                        type="text"
                        required
                        value={listingForm.name}
                        onChange={(e) => setListingForm({ ...listingForm, name: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="íê¸¸ë"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ì°ë½ì² *</label>
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
                    <label className="block text-sm font-semibold text-gray-700 mb-2">ì´ë©ì¼</label>
                    <input
                      type="email"
                      value={listingForm.email}
                      onChange={(e) => setListingForm({ ...listingForm, email: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                {/* ë§¤ë¬¼ ì ë³´ */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">ë§¤ë¬¼ ì ë³´</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ë§¤ë¬¼ ì í *</label>
                      <select
                        required
                        value={listingForm.property_type}
                        onChange={(e) => setListingForm({ ...listingForm, property_type: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      >
                        <option value="">ì íí´ì£¼ì¸ì</option>
                        <option value="ìë£¸">ìë£¸</option>
                        <option value="í¬ë£¸">í¬ë£¸</option>
                        <option value="ì°ë¦¬ë£¸">ì°ë¦¬ë£¸</option>
                        <option value="ì¤í¼ì¤í">ì¤í¼ì¤í</option>
                        <option value="ìíí¸">ìíí¸</option>
                        <option value="ìê°">ìê°</option>
                        <option value="ì¬ë¬´ì¤">ì¬ë¬´ì¤</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ê±°ë ì í *</label>
                      <select
                        required
                        value={listingForm.deal}
                        onChange={(e) => setListingForm({ ...listingForm, deal: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      >
                        <option value="">ì íí´ì£¼ì¸ì</option>
                        <option value="ì ì¸">ì ì¸</option>
                        <option value="ìì¸">ìì¸</option>
                        <option value="ë§¤ë§¤">ë§¤ë§¤</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* ìì¹ ì ë³´ */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">ìì¹ ì ë³´</h3>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">ì£¼ì *</label>
                    <input
                      type="text"
                      required
                      value={listingForm.address}
                      onChange={(e) => setListingForm({ ...listingForm, address: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="ìì¸ì ê°ë¨êµ¬ ê°ë¨ëë¡ 123"
                    />
                  </div>
                  <div className="mt-5">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">ìì¸ì£¼ì</label>
                    <input
                      type="text"
                      value={listingForm.address_detail}
                      onChange={(e) => setListingForm({ ...listingForm, address_detail: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                      placeholder="301í¸, íë¼ì¤ ë¹ë© ë±"
                    />
                  </div>
                </div>

                {/* ê·ëª¨ ì ë³´ */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">ê·ëª¨ ì ë³´</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ì ì©ë©´ì  (ã¡) *</label>
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
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ì¸µì *</label>
                      <input
                        type="text"
                        required
                        value={listingForm.floor_current}
                        onChange={(e) => setListingForm({ ...listingForm, floor_current: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="2ì¸µ"
                      />
                    </div>
                  </div>
                </div>

                {/* ê°ê²© ì ë³´ */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <h3 className="font-semibold text-gray-900 mb-4">ê°ê²© ì ë³´</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ë³´ì¦ê¸ (ë§ì)</label>
                      <input
                        type="number"
                        value={listingForm.deposit}
                        onChange={(e) => setListingForm({ ...listingForm, deposit: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="1,000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ìì¸ (ë§ì)</label>
                      <input
                        type="number"
                        value={listingForm.monthly}
                        onChange={(e) => setListingForm({ ...listingForm, monthly: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                        placeholder="30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ë§¤ë§¤ê° (ë§ì)</label>
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

                {/* ììì© ì¶ê° ì ë³´ */}
                {(listingForm.property_type === 'ìê°' || listingForm.property_type === 'ì¬ë¬´ì¤') && (
                  <div className="border-b border-gray-200 pb-5 mb-5">
                    <h3 className="font-semibold text-gray-900 mb-4">ììì© ì ë³´</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">ìì¢</label>
                        <input
                          type="text"
                          value={listingForm.business_category}
                          onChange={(e) => setListingForm({ ...listingForm, business_category: e.target.value })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                          placeholder="ì¹´í, ììì  ë±"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">ê¶ë¦¬ê¸ (ë§ì)</label>
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
                        <span className="text-sm font-medium text-gray-700">ë¶ê°ì¸ í¬í¨</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={listingForm.vat_included === 'false'}
                          onChange={() => setListingForm({ ...listingForm, vat_included: 'false' })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-700">ë¶ê°ì¸ ë³ë</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* ê´ë¦¬ë¹ */}
                <div className="border-b border-gray-200 pb-5 mb-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">ê´ë¦¬ë¹ (ë§ì)</label>
                  <input
                    type="number"
                    value={listingForm.maintenance_fee}
                    onChange={(e) => setListingForm({ ...listingForm, maintenance_fee: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
                    placeholder="10"
                  />
                </div>

                {/* ë§¤ë¬¼ ì¤ëª */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">ë§¤ë¬¼ ì¤ëª</label>
                  <textarea
                    rows={5}
                    value={listingForm.description}
                    onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all resize-none"
                    placeholder="ë§¤ë¬¼ì í¹ì§, ì¥ì , ìµì ë±ì ìì¸í ìë ¥í´ì£¼ì¸ì"
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
                  {submitting ? 'ì ì¡ ì¤...' : 'ë§¤ë¬¼ ì ìíê¸°'}
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
