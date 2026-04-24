'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// InquiryModal — 위시스 통합 리드 캡처 모달
//   네모 벤치마크 적용: 단일 리드 퍼널 (상담/매물/알림 통일)
//
//   사용법
//   ------
//   <InquiryModal
//     open={open}
//     onClose={() => setOpen(false)}
//     context="listing"              // consultation | listing | alert
//     listingId={123}                // listing 모드에서 선택
//     listingTitle="강남 오피스텔"
//     presetFilters={{...}}          // alert 모드에서 검색 조건 자동 전달
//     source="/listings"             // 유입 경로 (분석용)
//   />
//
//   Why: 기존 /contact 페이지, AlertSubscribeModal, MapListingPanel 링크,
//        매물 상세 CTA가 각자 다른 폼을 가졌음 → 고객 경험 뒤죽박죽.
//        이 하나의 모달로 모든 리드 진입점을 일원화.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useState } from 'react';
import { X, Phone, Check, Loader2, Bell, MessageSquare, Home } from 'lucide-react';
import { enrichSource } from '@/lib/utm';

export type InquiryContext = 'consultation' | 'listing' | 'alert';

export type InquiryPresetFilters = {
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

export type InquiryModalProps = {
  open: boolean;
  onClose: () => void;
  context?: InquiryContext;
  listingId?: number | string | null;
  listingTitle?: string | null;
  presetFilters?: InquiryPresetFilters;
  source?: string;
  /** 모달 상단 제목을 커스터마이징하려면 주입 */
  titleOverride?: string;
};

const CONTEXT_META: Record<InquiryContext, { title: string; subtitle: string; icon: typeof Home }> = {
  consultation: {
    title: '위시스부동산 상담 문의',
    subtitle: '담당 중개사가 1영업일 이내에 연락드립니다.',
    icon: MessageSquare,
  },
  listing: {
    title: '이 매물 문의하기',
    subtitle: '선택하신 매물에 대해 담당 중개사가 연락드립니다.',
    icon: Home,
  },
  alert: {
    title: '신규 매물 알림 받기',
    subtitle: '저장한 조건에 맞는 신규 매물이 등록되면 알려드립니다.',
    icon: Bell,
  },
};

export default function InquiryModal({
  open,
  onClose,
  context = 'consultation',
  listingId = null,
  listingTitle = null,
  presetFilters,
  source,
  titleOverride,
}: InquiryModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // 모달 열림 시 배경 스크롤 잠금
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  if (!open) return null;

  const meta = CONTEXT_META[context];
  const Icon = meta.icon;
  const title = titleOverride || meta.title;

  // alert 모드: 검색 조건 요약 칩
  const filterSummary: string[] = [];
  if (context === 'alert' && presetFilters) {
    const f = presetFilters;
    if (f.gu) filterSummary.push(f.gu);
    if (f.dong) filterSummary.push(f.dong);
    if (f.deal) filterSummary.push(f.deal);
    if (f.type) filterSummary.push(f.type);
    if (f.max_price) filterSummary.push(`매매가 ${f.max_price.toLocaleString('ko-KR')}만 이하`);
    if (f.max_deposit) filterSummary.push(`보증금 ${f.max_deposit.toLocaleString('ko-KR')}만 이하`);
    if (f.max_monthly) filterSummary.push(`월세 ${f.max_monthly.toLocaleString('ko-KR')}만 이하`);
    if (f.min_area_m2) filterSummary.push(`${f.min_area_m2}㎡ 이상`);
  }

  const validPhone = /^01[016789][-\s]?\d{3,4}[-\s]?\d{4}$/.test(phone.replace(/\s/g, ''));
  const validEmail = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = name.trim().length >= 2 && validPhone && validEmail && agree && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('이름을 입력해주세요');
    if (!validPhone) return setError('휴대폰 번호를 확인해주세요 (예: 010-1234-5678)');
    if (!validEmail) return setError('이메일 주소를 확인해주세요');
    if (!agree) return setError('개인정보 수집·이용에 동의해주세요');

    setLoading(true);
    try {
      // 1) /api/contacts 로 리드 기본 저장 (모든 context 공통)
      const buildMessage = () => {
        const lines: string[] = [];
        if (message.trim()) lines.push(message.trim());
        if (listingTitle) lines.push(`[매물] ${listingTitle}`);
        if (filterSummary.length) lines.push(`[희망 조건] ${filterSummary.join(' / ')}`);
        if (source) lines.push(`[유입] ${source}`);
        return lines.join('\n');
      };

      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          message: buildMessage(),
          listingId: listingId ? Number(listingId) || null : null,
          inquiry_type: context,
          preferred_area: presetFilters?.gu
            ? [presetFilters.gu, presetFilters.dong].filter(Boolean).join(' ')
            : null,
          property_type: presetFilters?.type || null,
          budget_range: presetFilters?.max_price
            ? `매매 ~${presetFilters.max_price}만`
            : presetFilters?.max_monthly
            ? `월세 ~${presetFilters.max_monthly}만`
            : null,
          // #37 + #49: 유입 경로 — UTM/광고 클릭ID/referrer 자동 파싱 후 저장
          source: enrichSource(source) || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '접수 실패');

      // 2) alert 모드: 저장된 검색 알림도 병행 등록
      if (context === 'alert' && presetFilters) {
        try {
          await fetch('/api/saved-searches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...presetFilters,
              name: name.trim(),
              email: email.trim() || `noemail+${Date.now()}@wishes.local`,
              phone: phone.trim(),
              source: enrichSource(source || '/listings'),
            }),
          });
        } catch {
          /* 알림 등록 실패는 소프트하게 — 이미 contacts엔 저장됨 */
        }
      }

      setDone(true);
    } catch (err: any) {
      setError(err?.message || '네트워크 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setName('');
    setPhone('');
    setEmail('');
    setMessage('');
    setAgree(false);
    setError('');
    setDone(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inquiry-modal-title"
    >
      <div
        className="relative bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center z-10"
          aria-label="닫기"
          disabled={loading}
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {done ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mb-4">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-wishes-primary mb-2">문의가 접수되었습니다</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              담당 중개사가 <strong>{phone}</strong> 번호로 연락드립니다.
              {context === 'alert' && <><br />조건에 맞는 신규 매물이 등록되면 즉시 알려드립니다.</>}
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl bg-wishes-primary text-white font-semibold text-sm hover:bg-wishes-secondary transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* 헤더 */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-wishes-secondary/10">
                  <Icon className="w-4 h-4 text-wishes-secondary" />
                </div>
                <h3 id="inquiry-modal-title" className="text-lg font-bold text-wishes-primary">
                  {title}
                </h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{meta.subtitle}</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* 매물 / 조건 컨텍스트 요약 */}
              {context === 'listing' && listingTitle && (
                <div className="p-3 rounded-xl bg-wishes-primary/[0.04] border border-wishes-primary/15">
                  <div className="text-[10px] uppercase tracking-wide font-bold text-wishes-primary mb-1">문의 매물</div>
                  <div className="text-sm font-semibold text-wishes-primary truncate">{listingTitle}</div>
                </div>
              )}

              {context === 'alert' && (
                filterSummary.length > 0 ? (
                  <div className="p-3 rounded-xl bg-wishes-primary/[0.04] border border-wishes-primary/15">
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
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    ⚠️ 검색 조건이 지정되지 않아 알림이 너무 많이 올 수 있습니다. 먼저 거래유형/지역을 선택해주세요.
                  </div>
                )
              )}

              {/* 이름 */}
              {/* #54 WCAG: label ↔ input 연결, required aria-required, 에러 시 aria-invalid */}
              <div>
                <label htmlFor="inquiry-name" className="block text-xs font-semibold text-gray-700 mb-1">
                  이름 <span className="text-wishes-secondary" aria-hidden="true">*</span>
                </label>
                <input
                  id="inquiry-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  required
                  aria-required="true"
                  autoComplete="name"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                />
              </div>

              {/* 휴대폰 */}
              <div>
                <label htmlFor="inquiry-phone" className="block text-xs font-semibold text-gray-700 mb-1">
                  휴대폰 번호 <span className="text-wishes-secondary" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="inquiry-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-1234-5678"
                    required
                    aria-required="true"
                    aria-describedby="inquiry-phone-hint"
                    autoComplete="tel"
                    inputMode="tel"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                  />
                </div>
                <p id="inquiry-phone-hint" className="mt-1 text-[10px] text-gray-500">담당 중개사가 이 번호로 직접 연락드립니다.</p>
              </div>

              {/* 이메일 (선택) */}
              <div>
                <label htmlFor="inquiry-email" className="block text-xs font-semibold text-gray-700 mb-1">
                  이메일 {context === 'alert' && <span className="text-wishes-secondary" aria-hidden="true">*</span>}
                  {context !== 'alert' && <span className="text-gray-500 font-normal ml-1">(선택)</span>}
                </label>
                <input
                  id="inquiry-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  required={context === 'alert'}
                  aria-required={context === 'alert'}
                  autoComplete="email"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                />
              </div>

              {/* 메시지 */}
              {context !== 'alert' && (
                <div>
                  <label htmlFor="inquiry-message" className="block text-xs font-semibold text-gray-700 mb-1">
                    문의 내용 <span className="text-gray-500 font-normal">(선택)</span>
                  </label>
                  <textarea
                    id="inquiry-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      context === 'listing'
                        ? '예: 방문 희망 일정, 추가 궁금한 점 등'
                        : '예: 희망 지역, 예산, 입주 시기 등'
                    }
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary resize-none"
                  />
                </div>
              )}

              {/* 동의 */}
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary/30"
                />
                <span className="text-[11px] text-gray-600 leading-relaxed">
                  개인정보(이름·연락처·이메일)를 상담 목적으로 수집·이용하는 데 동의합니다.
                  제공하신 정보는 상담 완료 후 관련 법령에 따라 파기됩니다.
                </span>
              </label>

              {error && (
                // #54 WCAG: 실시간 오류 피드백을 스크린리더에 통지
                <div
                  role="alert"
                  aria-live="polite"
                  className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700"
                >
                  {error}
                </div>
              )}
            </div>

            {/* 하단 CTA */}
            <div className="px-6 pb-6 pt-1 flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex-[2] py-3 rounded-xl bg-wishes-secondary text-white font-bold text-sm hover:bg-wishes-secondary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> 접수 중...
                  </>
                ) : context === 'alert' ? (
                  '알림 신청하기'
                ) : (
                  '문의 접수하기'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
