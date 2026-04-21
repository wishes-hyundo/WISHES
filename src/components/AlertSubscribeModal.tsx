'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AlertSubscribeModal (T5-7)
//   검색 조건 + 이메일 입력 → 매물 알림 구독
//   부모는 filters prop으로 현재 /listings 필터를 전달
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState } from 'react';
import { X, Bell, Check, Loader2 } from 'lucide-react';

export type SubscribeFilters = {
  deal?: string | null;
  type?: string | null;
  gu?: string | null;
  dong?: string | null;
  max_price?: number | null;
  max_deposit?: number | null;
  max_monthly?: number | null;
  min_area_m2?: number | null;
  max_area_m2?: number | null;
};

export default function AlertSubscribeModal({
  open,
  filters,
  source,
  onClose,
}: {
  open: boolean;
  filters: SubscribeFilters;
  source?: string;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const filterSummary: string[] = [];
  if (filters.gu) filterSummary.push(filters.gu);
  if (filters.dong) filterSummary.push(filters.dong);
  if (filters.deal) filterSummary.push(filters.deal);
  if (filters.type) filterSummary.push(filters.type);
  if (filters.max_price) filterSummary.push(`매매가 ${filters.max_price.toLocaleString('ko-KR')}만 이하`);
  if (filters.max_deposit) filterSummary.push(`보증금 ${filters.max_deposit.toLocaleString('ko-KR')}만 이하`);
  if (filters.max_monthly) filterSummary.push(`월세 ${filters.max_monthly.toLocaleString('ko-KR')}만 이하`);
  if (filters.min_area_m2) filterSummary.push(`${filters.min_area_m2}㎡ 이상`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('이메일 주소를 확인해주세요');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filters, name, email, phone, source: source || '/listings' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '등록 실패');
      setDone(true);
    } catch (err: any) {
      setError(err?.message || '네트워크 오류');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName(''); setEmail(''); setPhone(''); setDone(false); setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="relative bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          aria-label="닫기"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {done ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mb-4">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-wishes-primary mb-2">알림 구독 완료</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              조건에 맞는 신규 매물이 등록되면 <strong>{email}</strong> 주소로 알림을 보내드립니다.
              확인 메일도 곧 도착합니다.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-lg bg-wishes-primary text-white font-semibold text-sm hover:bg-wishes-secondary transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-wishes-primary/10">
                  <Bell className="w-4 h-4 text-wishes-primary" />
                </div>
                <h3 className="text-lg font-bold text-wishes-primary">매물 알림 받기</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                저장한 조건에 맞는 신규 매물이 등록될 때 이메일로 바로 알려드립니다.
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {filterSummary.length > 0 ? (
                <div className="p-3 rounded-lg bg-wishes-primary/[0.04] border border-wishes-primary/15">
                  <div className="text-[10px] uppercase tracking-wide font-bold text-wishes-primary mb-1">내 검색 조건</div>
                  <div className="flex flex-wrap gap-1.5">
                    {filterSummary.map((s) => (
                      <span
                        key={s}
                        className="inline-flex px-2.5 py-1 rounded-full bg-white border border-wishes-primary/30 text-[11px] font-semibold text-wishes-primary"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  ⚠️ 검색 조건이 지정되지 않아 알림이 너무 많이 올 수 있습니다. 먼저 거래유형/지역을 선택해주세요.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  이메일 <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  required
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-primary/30 focus:border-wishes-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">이름</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-primary/30 focus:border-wishes-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">전화 (선택)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-1234-5678"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-wishes-primary/30 focus:border-wishes-primary"
                  />
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
              )}

              <p className="text-[10px] text-gray-400 leading-relaxed">
                구독 해지는 알림 메일 하단 링크에서 언제든 가능합니다. 제공하신 이메일은 매물 알림 목적으로만 사용되며 제3자에게 공유되지 않습니다.
              </p>
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50"
                disabled={loading}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading || !email}
                className="flex-[2] py-2.5 rounded-lg bg-wishes-primary text-white font-bold text-sm hover:bg-wishes-secondary transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> 등록 중...</> : '구독 등록'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
