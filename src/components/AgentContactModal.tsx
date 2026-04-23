'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AgentContactModal — 담당 중개사 연결 모달
//   /map 패널 하단 "담당자에게 연결" 버튼 클릭 시 표시.
//   (기존 InquiryModal 은 리드 캡처 폼, 이 모달은 담당자 정보 노출)
//
//   사용법
//   ------
//   <AgentContactModal
//     open={open}
//     onClose={() => setOpen(false)}
//     agent={{
//       name: '오종우',
//       officeName: '단비공인중개사사무소',
//       registrationNo: '11620-2024-00123',
//       careerYears: 6,
//       phone: '010-6737-7014',
//       officePhone: '02-885-9200',
//       officeAddress: '서울시 관악구 봉천로 485',
//       avatarUrl: null,  // 없으면 이니셜 폴백
//       responseRate: 98, // 응답률 %
//       avgResponseMinutes: 12,
//     }}
//     listingId={12345}
//     listingTitle="도시형생활주택 지안타워"
//     onRequestInquiry={() => { ... }}   // 카톡 문의 핸들러
//     onRequestVisit={() => { ... }}     // 방문 예약 핸들러
//   />
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect } from 'react';
import { X, Phone, MessageSquare, Calendar, Navigation, MessageCircle } from 'lucide-react';

export interface AgentInfo {
  name: string;
  officeName?: string | null;
  registrationNo?: string | null;
  careerYears?: number | null;
  phone?: string | null;
  officePhone?: string | null;
  officeAddress?: string | null;
  avatarUrl?: string | null;
  responseRate?: number | null;        // 0~100
  avgResponseMinutes?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  agent: AgentInfo;
  listingId?: number;
  listingTitle?: string;
  onRequestInquiry?: () => void;
  onRequestVisit?: () => void;
}

export default function AgentContactModal({
  open, onClose, agent,
  onRequestInquiry, onRequestVisit,
}: Props) {
  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // body scroll lock
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const initials = (agent.name || '중개사').trim().slice(0, 3);
  const phoneHref = agent.phone ? `tel:${agent.phone.replace(/-/g, '')}` : undefined;
  const smsHref = agent.phone ? `sms:${agent.phone.replace(/-/g, '')}` : undefined;
  const mapSearchUrl = agent.officeAddress
    ? `https://map.kakao.com/?q=${encodeURIComponent(agent.officeAddress)}`
    : undefined;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="담당 중개사 정보"
    >
      <div
        className="w-full max-w-[380px] bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xl animate-[slideUp_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">담당 중개사</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 프로필 */}
        <div className="px-5 py-5 flex items-center gap-4">
          {agent.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agent.avatarUrl}
              alt={`${agent.name} 프로필 사진`}
              className="w-14 h-14 rounded-full object-cover border border-gray-100 flex-shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-wishes-primary/10 text-wishes-primary flex items-center justify-center font-semibold text-sm flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-gray-900">{agent.name} 공인중개사</div>
            {agent.officeName && (
              <div className="text-xs text-gray-500 mt-0.5 truncate">{agent.officeName}</div>
            )}
            {(agent.registrationNo || agent.careerYears) && (
              <div className="text-[11px] text-gray-400 mt-1 truncate">
                {agent.registrationNo && `등록번호 ${agent.registrationNo}`}
                {agent.registrationNo && agent.careerYears ? ' · ' : ''}
                {agent.careerYears ? `${agent.careerYears}년차` : ''}
              </div>
            )}
          </div>
        </div>

        {/* 휴대폰 */}
        {agent.phone && (
          <div className="px-5 pb-2">
            <div className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-gray-50">
              <div className="min-w-0">
                <div className="text-[11px] text-gray-500 mb-0.5">휴대폰</div>
                <div className="text-[15px] font-semibold text-gray-900">{agent.phone}</div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <a
                  href={phoneHref}
                  className="w-9 h-9 rounded-full bg-wishes-primary text-white flex items-center justify-center hover:brightness-110 active:scale-95 transition-all"
                  aria-label="전화 걸기"
                  title="전화"
                >
                  <Phone className="w-4 h-4" />
                </a>
                <a
                  href={smsHref}
                  className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center hover:brightness-110 active:scale-95 transition-all"
                  aria-label="문자 보내기"
                  title="문자"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* 사무소 */}
        {(agent.officeAddress || agent.officePhone) && (
          <div className="px-5 pb-4">
            <div className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-gray-50">
              <div className="min-w-0 flex-1 pr-2">
                <div className="text-[11px] text-gray-500 mb-0.5">사무소</div>
                {agent.officeAddress && (
                  <div className="text-[13px] text-gray-800 truncate">{agent.officeAddress}</div>
                )}
                {agent.officePhone && (
                  <div className="text-[11px] text-gray-400 mt-0.5 truncate">{agent.officePhone}</div>
                )}
              </div>
              {mapSearchUrl && (
                <a
                  href={mapSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-white flex items-center gap-1 flex-shrink-0"
                >
                  <Navigation className="w-3 h-3" />
                  길찾기
                </a>
              )}
            </div>
          </div>
        )}

        {/* 액션 2버튼 */}
        <div className="px-5 pb-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRequestInquiry}
            className="py-3 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-800 hover:bg-gray-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            카톡 문의
          </button>
          <button
            type="button"
            onClick={onRequestVisit}
            className="py-3 rounded-xl bg-wishes-primary text-white text-[13px] font-semibold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow"
          >
            <Calendar className="w-3.5 h-3.5" />
            방문 예약
          </button>
        </div>

        {/* 응답률 */}
        {(agent.responseRate != null || agent.avgResponseMinutes != null) && (
          <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 text-center">
            {agent.responseRate != null && `응답률 ${agent.responseRate}%`}
            {agent.responseRate != null && agent.avgResponseMinutes != null && ' · '}
            {agent.avgResponseMinutes != null && `평균 ${agent.avgResponseMinutes}분 내 응답`}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  );
}
