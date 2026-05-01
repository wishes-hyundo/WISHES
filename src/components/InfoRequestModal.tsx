'use client';

/**
 * PR-B (RFC 0016) — 정보 문의 모달
 *
 * 매물 카드 "면적 문의" / "가격 문의" / "주소 문의" 클릭 시 표시.
 * 사장님 명령:
 *   - "면적 정보 부족 = 비공개 X" → 광고 진행 + 사용자 문의 받음
 *   - "사용자 UI 부정적 표시 X" → 모달 본문도 마케팅 친화적
 *
 * ARIA: role=dialog + aria-modal=true + ESC 닫기 + focus trap (간단형).
 * 시니어 모드 (PR-M-2) 호환 — 자동 폰트 스케일링.
 */

import { useEffect, useRef, useState } from 'react';
import { useInfoRequest, type InfoRequestType } from '@/hooks/useInfoRequest';

export interface InfoRequestModalProps {
  open: boolean;
  onClose: () => void;
  listingId: number;
  requestType: InfoRequestType;
  listingTitle?: string;
}

const TYPE_LABELS: Record<InfoRequestType, { title: string; line: string }> = {
  area: {
    title: '면적 문의',
    line: '이 매물의 정확한 면적이 미확정 상태입니다. 사장님이 확인 후 연락드립니다.',
  },
  price: {
    title: '가격 문의',
    line: '이 매물의 가격 조건을 사장님이 직접 안내드립니다.',
  },
  address: {
    title: '주소 문의',
    line: '이 매물의 정확한 위치를 사장님이 직접 안내드립니다.',
  },
  other: {
    title: '기타 문의',
    line: '이 매물에 대해 궁금한 점을 사장님께 전달합니다.',
  },
};

export default function InfoRequestModal({
  open,
  onClose,
  listingId,
  requestType,
  listingTitle,
}: InfoRequestModalProps) {
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const { submit, submitting, error, success } = useInfoRequest();

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 첫 필드 자동 포커스
  useEffect(() => {
    if (open) {
      // 100ms 지연 (애니메이션 우회)
      const t = setTimeout(() => firstFieldRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 닫힐 때 폼 리셋
  useEffect(() => {
    if (!open) {
      setContact('');
      setMessage('');
    }
  }, [open]);

  if (!open) return null;

  const labels = TYPE_LABELS[requestType];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await submit({
      listing_id: listingId,
      request_type: requestType,
      user_contact: contact.trim(),
      user_message: message.trim() || undefined,
    });
    if (result.ok) {
      // 2초 후 자동 닫기
      setTimeout(onClose, 2000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-request-title"
      ref={dialogRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <h2 id="info-request-title" className="text-xl font-bold text-gray-900">
            🏠 {labels.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-2"
          >
            ×
          </button>
        </div>

        {listingTitle && (
          <p className="text-sm text-gray-500 mb-2">매물: {listingTitle}</p>
        )}
        <p className="text-sm text-gray-700 mb-4">{labels.line}</p>

        {success ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-800">
            ✓ 문의가 접수되었습니다. 사장님이 곧 연락드릴 예정입니다.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="info-contact" className="block text-sm font-medium text-gray-800 mb-1">
                연락처 <span className="text-red-500">*</span>
              </label>
              <input
                ref={firstFieldRef}
                id="info-contact"
                type="text"
                inputMode="tel"
                placeholder="010-1234-5678 또는 이메일"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                required
                minLength={8}
                maxLength={64}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label htmlFor="info-message" className="block text-sm font-medium text-gray-800 mb-1">
                메시지 (선택)
              </label>
              <textarea
                id="info-message"
                placeholder="추가 문의 사항이 있으면 입력해주세요."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{message.length} / 500</p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || !contact.trim()}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {submitting ? '전송 중...' : '사장님께 문의'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
