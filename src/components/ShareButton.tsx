'use client';

import { useState } from 'react';
import { Share2, Link2, MessageCircle, Copy, Check, X } from 'lucide-react';

interface ShareButtonProps {
  url: string;
  title: string;
  description: string;
}

export default function ShareButton({ url, title, description }: ShareButtonProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    // 모바일: 네이티브 공유 시트 (카카오, 문자, 메일 등 모두 표시)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: description, url });
        return;
      } catch (e) {
        // 사용자가 취소한 경우 무시
        if ((e as Error).name === 'AbortError') return;
      }
    }
    // PC: 공유 메뉴 표시
    setShowMenu(true);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setShowMenu(false);
    }, 2000);
  };

  const shareKakao = () => {
    window.open(`https://story.kakao.com/share?url=${encodeURIComponent(url)}`, '_blank');
    setShowMenu(false);
  };

  const shareSMS = () => {
    const smsBody = encodeURIComponent(`${title}\n${url}`);
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
    <div className="relative">
      <button
        onClick={handleShare}
        className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-bold mt-3 hover:bg-gray-200 transition-colors"
      >
        <Share2 className="w-5 h-5" />
        공유하기
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-700">공유 방법 선택</span>
              <button onClick={() => setShowMenu(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Link2 className="w-4 h-4 text-blue-500" />}
                {copied ? '복사됨!' : '링크 복사'}
              </button>
              <button
                onClick={shareKakao}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-yellow-50 transition-colors text-sm font-medium text-gray-700"
              >
                <span className="w-4 h-4 bg-yellow-400 rounded text-[10px] font-bold flex items-center justify-center text-yellow-900">K</span>
                카카오톡
              </button>
              <button
                onClick={shareSMS}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-green-50 transition-colors text-sm font-medium text-gray-700"
              >
                <MessageCircle className="w-4 h-4 text-green-500" />
                문자 보내기
              </button>
              <button
                onClick={shareEmail}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-purple-50 transition-colors text-sm font-medium text-gray-700"
              >
                <Copy className="w-4 h-4 text-purple-500" />
                이메일
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
