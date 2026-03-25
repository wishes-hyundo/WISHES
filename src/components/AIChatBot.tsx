'use client';

function formatMessage(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/^[\u2022\-\*]\s+(.+)/gm, '<div class="flex gap-1.5 mb-1"><span class="text-wishes-primary">\u2022</span><span>$1</span></div>')
    .replace(/^(\d+)\.\s+(.+)/gm, '<div class="flex gap-1.5 mb-1"><span class="text-wishes-primary font-medium">$1.</span><span>$2</span></div>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');
}


import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Minimize2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: 'ìëíì¸ì! ð ììì¤ë¶ëì° AI ìë´ì¬ìëë¤.\n\nìì¸Â·ê²½ê¸° ì§ì­ ë¶ëì°ì ëí´ ê¶ê¸í ì ì í¸íê² ë¬¼ì´ë´ì£¼ì¸ì!\n\nð¬ ì´ë° ì§ë¬¸ì´ ê°ë¥í©ëë¤:\nâ¢ ë§¤ë¬¼ ê²ì ë° ì¶ì²\nâ¢ ì ì¸/ìì¸/ë§¤ë§¤ ìì¸\nâ¢ ëì¶ ë° ì¸ê¸ ìë´\nâ¢ ê³ì½ ì ì°¨ ìë´\nâ¢ ì ì¸ì¬ê¸° ìë°©ë²',
};

const QUICK_QUESTIONS = [
  'ë§¤ë¬¼ ê²ìì ì´ë»ê² íëì?',
  'ì ì¸ì¬ê¸° ìë°©ë² ìë ¤ì£¼ì¸ì',
  'ë¶ëì° ê±°ë ì ì°¨ê° ê¶ê¸í´ì',
  'ëì¶ ìë´ì´ íìí©ëë¤',
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

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
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
          content: 'ì£ì¡í©ëë¤. ì¼ìì ì¸ ì¤ë¥ê° ë°ìíìµëë¤. ì ì í ë¤ì ìëí´ì£¼ì¸ì. ê¸´ê¸ ìë´ì´ íìíìë©´ ìë´ë¬¸ì íì´ì§ë¥¼ ì´ì©í´ì£¼ì¸ì.',
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
        aria-label="AI ìë´ ì´ê¸°"
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
              <h3 className="font-semibold text-sm">WISHES AI ìë´</h3>
              {!isMinimized && (
                <p className="text-xs text-gray-300">ë¶ëì° ì ë¬¸ AI ì´ìì¤í´í¸</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              aria-label={isMinimized ? 'íë' : 'ìµìí'}
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="ë«ê¸°"
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
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
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
                      {msg.role === "user" ? (
                      <span>{msg.content}</span>
                    ) : (
                      <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                    )}

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
                  <p className="text-xs text-gray-500 px-1">ìì£¼ ë¬»ë ì§ë¬¸</p>
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
                  placeholder="ê¶ê¸í ì ì ë¬¼ì´ë³´ì¸ì..."
                  className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-colors"
                  disabled={isLoading}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors"
                  aria-label="ì ì¡"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                AIê° ì ê³µíë ì ë³´ë ì°¸ê³ ì©ì´ë©°, ì íí ìë´ì ì ë¬¸ê°ìê² ë¬¸ìíì¸ì.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
