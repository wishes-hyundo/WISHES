'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ShareButton (T5-3) — 매물 상세 공유 버튼
//   - 모바일: navigator.share (네이티브 시트 → 문자/메일/기타 앱으로 바로 공유)
//   - 데스크톱/미지원: 메뉴 (링크 복사 · SMS · 이메일)
//   - OG 이미지는 /api/og/listing/[id] 에서 자동 생성되어 공유 카드로 노출
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState } from 'react';
import { Share2, Link2, MessageCircle, Mail, Check, X } from 'lucide-react';

interface ShareButtonProps {
  url: string;
  title: string;
  description: string;
}

export default function ShareButton({ url, title, description }: ShareButtonProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const isMobile = () => {
    if (typeof window === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  };

  const handleShare = async () => {
    if (isMobile() && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: description, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    setShowMenu(true);
  };

  const copyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setShowMenu(false);
      }, 2000);
    } catch (e) {
      console.error('링크 복사 실패', e);
      window.prompt('링크를 복사하세요', url);
    }
  };

  const shareSMS = () => {
    const smsBody = encodeURIComponent(`${title} ${url}`);
    window.open(`sms:?body=${smsBody}`, '_self');
    setShowMenu(false);
  };

  const shareEmail = () => {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(`${description}\n\n${url}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
    setShowMenu(false);
  };

  return (
    <div className="relative no-print">
      <button
        onClick={handleShare}
        aria-label="매물 상세 페이지 공유"
        className="flex items-center justify-center gap-2 w-full bg-white border border-wishes-primary/30 text-wishes-primary py-2.5 rounded-xl font-semibold text-sm hover:bg-wishes-primary/5 transition-colors"
      >
        <Share2 className="w-4 h-4" />
        매물 공유하기
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-gray-700">공유 방법 선택</span>
              <button onClick={() => setShowMenu(false)} className="text-gray-400 hover:text-gray-600" aria-label="닫기">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-wishes-primary/5 transition-colors text-sm font-medium text-gray-700 border border-gray-100"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Link2 className="w-4 h-4 text-wishes-primary" />}
                {copied ? '링크 복사 완료!' : '링크 복사'}
              </button>
              <button
                onClick={shareSMS}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-green-50 transition-colors text-sm font-medium text-gray-700 border border-gray-100"
              >
                <MessageCircle className="w-4 h-4 text-green-500" />
                문자 전송 (SMS)
              </button>
              <button
                onClick={shareEmail}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium text-gray-700 border border-gray-100"
              >
                <Mail className="w-4 h-4 text-blue-500" />
                이메일로 보내기
              </button>
            </div>
            <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
              복사된 링크를 메신저/메일로 직접 붙여넣어 고객님께 전달하세요.<br />
              링크에는 WISHES 매물 카드 썸네일이 자동으로 표시됩니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
