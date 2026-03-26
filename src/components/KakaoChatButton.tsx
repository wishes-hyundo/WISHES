'use client';

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

export default function KakaoChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* 팝업 메뉴 */}
      {isOpen && (
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 mb-2 animate-in slide-in-from-bottom-2 w-72">
          <p className="text-sm font-bold text-wishes-text mb-1">WISHES 상담</p>
          <p className="text-xs text-wishes-muted mb-4">궁금한 점이 있으시면 편하게 문의해 주세요</p>
          <a
            href="https://pf.kakao.com/_wishes"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#FEE500', color: '#3C1E1E' }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.67-.15.56-.96 3.56-.99 3.77 0 0-.02.16.08.22.1.06.22.01.22.01.3-.04 3.44-2.25 3.98-2.63.64.09 1.31.14 2 .14 5.52 0 10-3.58 10-7.94C22 6.58 17.52 3 12 3z"/>
            </svg>
            카카오톡 상담하기
          </a>
          <a
            href="/contact"
            className="flex items-center justify-center gap-2 w-full py-3 mt-2 rounded-xl bg-wishes-green text-white text-sm font-semibold hover:bg-wishes-green/90 transition-colors"
          >
            온라인 상담 신청
          </a>
        </div>
      )}
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={{ backgroundColor: isOpen ? '#666' : '#FEE500' }}
        aria-label="상담 문의"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6" style={{ color: '#3C1E1E' }} />
        )}
      </button>
    </div>
  );
}
