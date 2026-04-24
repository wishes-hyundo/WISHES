'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VisitBookingModal — 방문 예약 모달 (#45)
//
//   매물 상세 페이지 / StickyLeadCTA 에서 열림
//   날짜 7일 프리셋(주/말 포함) + 시간대 3개 프리셋(오전/오후/저녁)
//   InquiryModal 과 톤/레이아웃 통일 — 네모 벤치마크 유지
//
//   제출 시 /api/appointments 로 전송 → contacts + appointments 동시 생성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useMemo, useState } from 'react';
import { X, Phone, Check, Loader2, Calendar as CalendarIcon, Sun, Sunset, Moon } from 'lucide-react';
import { enrichSource } from '@/lib/utm';

type VisitSlot = 'morning' | 'afternoon' | 'evening';

const SLOT_META: Record<VisitSlot, { label: string; time: string; icon: typeof Sun }> = {
  morning: { label: '오전', time: '09:00~12:00', icon: Sun },
  afternoon: { label: '오후', time: '13:00~17:00', icon: Sunset },
  evening: { label: '저녁', time: '18:00~20:00', icon: Moon },
};

export type VisitBookingModalProps = {
  open: boolean;
  onClose: () => void;
  listingId?: number | string | null;
  listingTitle?: string | null;
  source?: string;
};

function formatDateKor(date: Date): string {
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS[date.getDay()];
  return `${m}.${d} (${w})`;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function VisitBookingModal({
  open,
  onClose,
  listingId = null,
  listingTitle = null,
  source,
}: VisitBookingModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<VisitSlot | null>(null);

  // 오늘 + 향후 7일 생성 (오늘 제외 → 내일부터)
  const dateOptions = useMemo(() => {
    const arr: { iso: string; label: string; weekend: boolean }[] = [];
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const day = d.getDay();
      arr.push({ iso: toISODate(d), label: formatDateKor(d), weekend: day === 0 || day === 6 });
    }
    return arr;
  }, []);

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

  const validPhone = /^01[016789][-\s]?\d{3,4}[-\s]?\d{4}$/.test(phone.replace(/\s/g, ''));
  const canSubmit =
    name.trim().length >= 2 &&
    validPhone &&
    !!selectedDate &&
    !!selectedSlot &&
    agree &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('이름을 입력해주세요');
    if (!validPhone) return setError('휴대폰 번호를 확인해주세요 (예: 010-1234-5678)');
    if (!selectedDate) return setError('방문 희망 날짜를 선택해주세요');
    if (!selectedSlot) return setError('방문 시간대를 선택해주세요');
    if (!agree) return setError('개인정보 수집·이용에 동의해주세요');

    setLoading(true);
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          listingId: listingId ? Number(listingId) || null : null,
          visitDate: selectedDate,
          visitSlot: selectedSlot,
          note: note.trim() || null,
          // #49: UTM/광고 클릭ID/referrer 자동 파싱
          source: enrichSource(source) || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '예약 실패');
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
    setNote('');
    setAgree(false);
    setError('');
    setDone(false);
    setSelectedDate(null);
    setSelectedSlot(null);
    onClose();
  };

  const selectedDateLabel = selectedDate
    ? dateOptions.find((o) => o.iso === selectedDate)?.label
    : null;
  const selectedSlotLabel = selectedSlot ? SLOT_META[selectedSlot].label : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="visit-modal-title"
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
            <h3 className="text-lg font-bold text-wishes-primary mb-2">방문 예약이 접수되었습니다</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              <strong className="text-wishes-primary">{selectedDateLabel} · {selectedSlotLabel}</strong>
              <br />
              담당 중개사가 <strong>{phone}</strong> 번호로 확정 연락드립니다.
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
                  <CalendarIcon className="w-4 h-4 text-wishes-secondary" />
                </div>
                <h3 id="visit-modal-title" className="text-lg font-bold text-wishes-primary">
                  방문 예약하기
                </h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                희망 날짜/시간을 선택하시면 중개사가 확정 연락드립니다.
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* 매물 컨텍스트 */}
              {listingTitle && (
                <div className="p-3 rounded-xl bg-wishes-primary/[0.04] border border-wishes-primary/15">
                  <div className="text-[10px] uppercase tracking-wide font-bold text-wishes-primary mb-1">방문 매물</div>
                  <div className="text-sm font-semibold text-wishes-primary truncate">{listingTitle}</div>
                </div>
              )}

              {/* 날짜 선택 */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  희망 날짜 <span className="text-wishes-secondary">*</span>
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {dateOptions.map((d) => {
                    const active = selectedDate === d.iso;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => setSelectedDate(d.iso)}
                        className={`px-2 py-2.5 rounded-xl text-xs font-semibold transition-colors border ${
                          active
                            ? 'bg-wishes-secondary text-white border-wishes-secondary'
                            : d.weekend
                            ? 'bg-white border-gray-200 text-rose-600 hover:border-wishes-secondary/40'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-wishes-secondary/40'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 시간대 선택 */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  희망 시간대 <span className="text-wishes-secondary">*</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['morning', 'afternoon', 'evening'] as VisitSlot[]).map((slot) => {
                    const meta = SLOT_META[slot];
                    const active = selectedSlot === slot;
                    const Icon = meta.icon;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`px-2 py-3 rounded-xl text-xs font-semibold transition-colors border flex flex-col items-center gap-1 ${
                          active
                            ? 'bg-wishes-secondary text-white border-wishes-secondary'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-wishes-secondary/40'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{meta.label}</span>
                        <span className="text-[9px] font-normal opacity-80">{meta.time}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 이름 */}
              {/* #54 WCAG: label ↔ input 연결, required aria-required */}
              <div>
                <label htmlFor="visit-name" className="block text-xs font-semibold text-gray-700 mb-1">
                  이름 <span className="text-wishes-secondary" aria-hidden="true">*</span>
                </label>
                <input
                  id="visit-name"
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
                <label htmlFor="visit-phone" className="block text-xs font-semibold text-gray-700 mb-1">
                  휴대폰 번호 <span className="text-wishes-secondary" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="visit-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-1234-5678"
                    required
                    aria-required="true"
                    aria-describedby="visit-phone-hint"
                    autoComplete="tel"
                    inputMode="tel"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                  />
                </div>
                <p id="visit-phone-hint" className="mt-1 text-[10px] text-gray-500">확정 시 담당 중개사가 직접 연락드립니다.</p>
              </div>

              {/* 메모 */}
              <div>
                <label htmlFor="visit-note" className="block text-xs font-semibold text-gray-700 mb-1">
                  메모 <span className="text-gray-500 font-normal">(선택)</span>
                </label>
                <textarea
                  id="visit-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 확인하고 싶은 점, 동반 방문 여부 등"
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary resize-none"
                />
              </div>

              {/* 동의 */}
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-wishes-secondary focus:ring-wishes-secondary/30"
                />
                <span className="text-[11px] text-gray-600 leading-relaxed">
                  개인정보(이름·연락처)를 방문 예약 확정 목적으로 수집·이용하는 데 동의합니다.
                </span>
              </label>

              {error && (
                // #54 WCAG: 실시간 오류 메시지는 스크린리더에 통지
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
                className="flex-[2] py-3 rounded-xl bg-wishes-secondary text-white font-bold text-sm hover:bg-wishes-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> 접수 중...
                  </>
                ) : (
                  '방문 예약하기'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
