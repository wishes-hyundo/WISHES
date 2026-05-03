'use client';

// L-xss1 (2026-04-22): dangerouslySetInnerHTML 로 렌더되므로 Claude 응답에
// `<script>` 등이 섞이면 XSS. regex 변환 전에 모든 HTML 특수문자를 엔티티로
// 치환한 뒤 허용된 마크다운 패턴만 다시 HTML 로 복원.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMessage(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/^[\u2022\-\*]\s+(.+)/gm, '<div class="flex gap-1.5 mb-1"><span class="text-amber-500">\u2022</span><span>$1</span></div>')
    .replace(/^(\d+)\.\s+(.+)/gm, '<div class="flex gap-1.5 mb-1"><span class="text-amber-500 font-medium">$1.</span><span>$2</span></div>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');
}


import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle, X, Send, Bot, User, Minimize2, ArrowRight, Sparkles, MapPin } from 'lucide-react';
// T5-4: 챗봇에서도 매물 매칭 사용 (T5-1 파서 재사용)
import { parseMatchQuery, type ParsedMatchFilter } from '@/lib/ai-match-parser';

// 챗봇에서 사용하는 가벼운 매물 카드 형식
type ChatListing = {
  id: number | string;
  title?: string;
  type?: string;
  deal?: string;
  dong?: string;
  gu?: string;
  deposit?: number;
  monthly?: number;
  price?: number;
  area_m2?: number;
  rooms?: number;
  source_site?: string | null;
  listing_images?: Array<{ url: string; sort_order?: number }>;
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** T5-4: 매물 매칭 결과를 chat 말풍선 아래에 inline 렌더 */
  listings?: ChatListing[];
  filters?: ParsedMatchFilter;
  goToListings?: string;
}

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: '안녕하세요! 😊 위시스부동산 AI 상담사입니다.\n\n전국 17 시도 부동산에 대해 궁금한 점을 편하게 물어봐주세요!\n\n💬 이런 질문이 가능합니다:\n• **매물 찾기** — "강남구 원룸 월세 50만원 이하" 처럼 편하게 말씀해주세요\n• 전세/월세/매매 시세\n• 대출 및 세금 안내\n• 계약 절차 안내\n• 전세사기 예방법',
};

// ── 가격 포맷 (챗 인라인 카드용) ──
function formatMan(man?: number | null): string {
  if (!man) return '—';
  if (man >= 10000) {
    const uk = Math.floor(man / 10000);
    const rest = man % 10000;
    return rest > 0 ? `${uk}억 ${rest.toLocaleString()}` : `${uk}억`;
  }
  return `${man.toLocaleString()}만원`;
}

function buildChatPrice(l: ChatListing): string {
  if (l.deal === '월세') return `보증금 ${formatMan(l.deposit)} / 월 ${l.monthly ? l.monthly.toLocaleString() : '—'}`;
  if (l.deal === '전세') return `전세 ${formatMan(l.deposit)}`;
  if (l.deal === '매매') return `매매 ${formatMan(l.price || l.deposit)}`;
  return formatMan(l.price || l.deposit);
}

const QUICK_QUESTIONS = [
  '강남구 원룸 월세 50만원 이하',
  '분당 아파트 전세 5억 이하',
  '전세사기 예방법 알려주세요',
  '부동산 거래 절차가 궁금해요',
];

export default function AIChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  // ── T5-4: 매물 매칭 의도 감지 ──
  // 구/동/룸/보증금/월세/평/m² 등 필터 필드가 2개 이상 인식되면 매칭 API 호출
  const detectMatchIntent = useCallback((text: string): ParsedMatchFilter | null => {
    const filters = parseMatchQuery(text);
    const meaningful =
      (filters.dong ? 1 : 0) +
      (filters.deal ? 1 : 0) +
      (filters.type ? 1 : 0) +
      (filters.maxDeposit || filters.minDeposit ? 1 : 0) +
      (filters.maxMonthly ? 1 : 0) +
      (filters.minArea || filters.maxArea ? 1 : 0) +
      (filters.rooms ? 1 : 0) +
      (filters.parking || filters.elevator || filters.pet ? 1 : 0);
    return meaningful >= 2 ? filters : null;
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // 1) 매물 매칭 의도 감지 → /api/ai/match 로 라우팅
      const matchIntent = detectMatchIntent(text);
      if (matchIntent) {
        try {
          const matchRes = await fetch('/api/ai/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: text.trim() }),
          });
          if (matchRes.ok) {
            const matchData = await matchRes.json();
            if (matchData.success) {
              const count = matchData.count ?? 0;
              const replyText =
                count > 0
                  ? `검색 조건에 맞는 매물을 ${count}건 찾았습니다! 아래 카드를 확인해주세요.\n더 자세한 정보는 각 매물을 클릭하시면 보실 수 있어요.`
                  : '아쉽지만 말씀해주신 조건에 맞는 매물이 현재 없습니다.\n조건을 조금 더 넓혀 보시거나, 희망 조건을 알려주시면 담당자가 직접 찾아 연락드릴 수 있도록 도와드리겠습니다.';
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: replyText,
                  listings: matchData.listings?.slice(0, 4) || [],
                  filters: matchData.filters,
                  goToListings: matchData.goToListings,
                },
              ]);
              setIsLoading(false);
              return;
            }
          }
          // 매칭 API 실패 시 일반 채팅으로 폴백 (아래로 fall-through)
        } catch {
          /* 일반 채팅으로 폴백 */
        }
      }

      // 2) 일반 상담 → /api/chat
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.filter(m => m !== WELCOME_MESSAGE),
        }),
      });

      if (!res.ok) throw new Error('Failed');

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요. 긴급 상담이 필요하시면 상담문의 페이지를 이용해주세요.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group"
        aria-label="AI 상담 열기"
      >
        <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        isMinimized
          ? 'bottom-6 right-6 w-72 h-12'
          : 'bottom-6 right-6 w-[380px] h-[600px] max-h-[80vh]'
      } ${isMinimized ? '' : 'sm:w-[380px] sm:h-[600px]'}`}
      style={isMinimized ? {} : { width: 'min(380px, calc(100vw - 32px))', height: 'min(600px, 80vh)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">WISHES AI 상담</h3>
              {!isMinimized && (
                <p className="text-xs text-gray-300">부동산 전문 AI 어시스턴트</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              aria-label={isMinimized ? '확대' : '최소화'}
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.map((msg, i) => (
                <div key={i} className="space-y-2">
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user' ? 'bg-blue-500' : 'bg-amber-500'
                      }`}>
                        {msg.role === 'user' ? (
                          <User className="w-4 h-4 text-white" />
                        ) : (
                          <Bot className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className={`rounded-2xl px-4 py-2.5 text-[13px] leading-[1.7] ${
                        msg.role === 'user'
                          ? 'bg-blue-500 text-white rounded-br-md'
                          : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-md'
                      }`}>
                        {msg.role === 'user' ? (
                          <span>{msg.content}</span>
                        ) : (
                          <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* T5-4: 매물 매칭 결과 inline 카드 */}
                  {msg.role === 'assistant' && msg.listings && msg.listings.length > 0 && (
                    <div className="pl-9 pr-2 space-y-2">
                      {/* 인식된 조건 칩 */}
                      {msg.filters && (
                        <div className="flex items-start gap-1.5 flex-wrap">
                          <Sparkles className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                          <span className="text-[10px] text-gray-500 font-semibold pt-0.5">조건:</span>
                          {[
                            msg.filters.dong,
                            msg.filters.type,
                            msg.filters.deal,
                            msg.filters.maxDeposit ? `보증금 ${msg.filters.maxDeposit.toLocaleString()}만원↓` : null,
                            msg.filters.maxMonthly ? `월세 ${msg.filters.maxMonthly}만원↓` : null,
                            msg.filters.rooms ? `${msg.filters.rooms}룸+` : null,
                            msg.filters.parking ? '주차' : null,
                          ]
                            .filter(Boolean)
                            .map((tag) => (
                              <span
                                key={String(tag)}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium border border-amber-200"
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      )}

                      {/* 매물 카드 (최대 4건) */}
                      {msg.listings.map((l) => {
                        // ※ 서버(API)가 이미 저작권 정책(자체 업로드만 통과)을 적용하므로
                        //   listing_images[0] 이 존재하면 크롤링 여부와 무관하게 썸네일 표시 OK.
                        const thumb = l.listing_images?.[0]?.url || null;
                        return (
                          <Link
                            key={l.id}
                            href={`/listings/${l.id}`}
                            className="flex items-stretch gap-2 bg-white rounded-xl border border-gray-200 hover:border-amber-400 hover:shadow-md transition-all overflow-hidden"
                          >
                            <div className="w-20 h-20 shrink-0 bg-gradient-to-br from-green-50 to-amber-50 flex items-center justify-center text-gray-300">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt={l.title || 'listing'} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                              ) : (
                                <MapPin className="w-6 h-6" />
                              )}
                            </div>
                            <div className="flex-1 py-2 pr-2 min-w-0">
                              <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-0.5">
                                {l.gu && <span>{l.gu}</span>}
                                {l.dong && <span>· {l.dong}</span>}
                                {l.type && <span>· {l.type}</span>}
                              </div>
                              <div className="text-[13px] font-bold text-gray-900 truncate leading-tight">
                                {buildChatPrice(l)}
                              </div>
                              <div className="text-[11px] text-gray-500 truncate mt-0.5">
                                {l.title || `${l.dong || ''} ${l.type || ''}`}
                                {l.area_m2 ? ` · ${Number(l.area_m2).toFixed(1)}m²` : ''}
                                {l.rooms ? ` · ${l.rooms}룸` : ''}
                              </div>
                            </div>
                          </Link>
                        );
                      })}

                      {/* 전체 보기 링크 */}
                      {msg.goToListings && (
                        <Link
                          href={msg.goToListings}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-600 hover:text-amber-700 px-2"
                        >
                          이 조건으로 전체 보기
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[85%]">
                    <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-100">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick questions - only show at start */}
              {messages.length === 1 && !isLoading && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 px-1">자주 묻는 질문</p>
                  {QUICK_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(q)}
                      className="block w-full text-left text-sm px-4 py-2.5 bg-white rounded-xl border border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 bg-white border-t border-gray-100">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="궁금한 점을 물어보세요..."
                  aria-label="AI 부동산 상담 메시지 입력"
                  className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-colors"
                  disabled={isLoading}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors"
                  aria-label="전송"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                AI가 제공하는 정보는 참고용이며, 정확한 상담은 전문가에게 문의하세요.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
