'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle, Search, Home, Building2, CreditCard, ShieldCheck, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

const faqCategories: FAQCategory[] = [
  {
    id: 'general',
    title: 'ì¼ë°',
    icon: <HelpCircle className="w-5 h-5" />,
    items: [
      {
        question: 'WISHESë ì´ë¤ ìë¹ì¤ì¸ê°ì?',
        answer: 'WISHESë ìì¸Â·ê²½ê¸° ì§ì­ì ìë£¸, í¬ë£¸, ì¤í¼ì¤í, ìíí¸, ìê°, ì¬ë¬´ì¤ ë± ë¤ìí ë¶ëì° ë§¤ë¬¼ì ì ë¬¸ì ì¼ë¡ ì¤ê°íë ì¢í©ë¶ëì° ìë¹ì¤ìëë¤. ì¨ë¼ì¸ì¼ë¡ ë§¤ë¬¼ ê²ìë¶í° ìë´ ì ì²­ê¹ì§ í¸ë¦¬íê² ì´ì©íì¤ ì ììµëë¤.',
      },
      {
        question: 'ë§¤ë¬¼ ê²ìì ì´ë»ê² íëì?',
        answer: 'ìë¨ ë©ë´ì "ë§¤ë¬¼ê²ì"ìì ê±°ëì í(ì ì¸/ìì¸/ë§¤ë§¤), ë§¤ë¬¼ì í(ìë£¸/í¬ë£¸/ìê° ë±), ì§ì­ ë±ì íí°ë¥¼ íì©íì¬ ìíë ë§¤ë¬¼ì ì°¾ì¼ì¤ ì ììµëë¤. "ì§ëê²ì"ì íµí´ ì§ëìì ì§ì  ë§¤ë¬¼ ìì¹ë¥¼ íì¸íë©´ì ê²ìí  ìë ììµëë¤.',
      },
      {
        question: 'íìê°ìì íìì¸ê°ì?',
        answer: 'ë§¤ë¬¼ ê²ìê³¼ ìì¸ ì ë³´ íì¸ì íìê°ì ìì´ ìì ë¡­ê² ì´ì© ê°ë¥í©ëë¤. ë¤ë§, ì° ëª©ë¡ ì ì¥, ìë´ ì ì²­ ì´ë ¥ ê´ë¦¬ ë± ì¼ë¶ ê¸°ë¥ì ë¡ê·¸ì¸ í ì´ì©íì¤ ì ììµëë¤.',
      },
      {
        question: 'ë§¤ë¬¼ ì ë³´ë ì¼ë§ë ìì£¼ ìë°ì´í¸ëëì?',
        answer: 'ë§¤ë¬¼ ì ë³´ë ì¤ìê°ì¼ë¡ ìë°ì´í¸ë©ëë¤. ìë¡ì´ ë§¤ë¬¼ì´ ë±ë¡ëê±°ë ê³ì½ì´ ìë£ëë©´ ì¦ì ë°ìëì´ í­ì ìµì  ì ë³´ë¥¼ íì¸íì¤ ì ììµëë¤.',
      },
    ],
  },
  {
    id: 'rental',
    title: 'ìëì°¨',
    icon: <Home className="w-5 h-5" />,
    items: [
      {
        question: 'ì ì¸ì ìì¸ì ì°¨ì´ë ë¬´ìì¸ê°ì?',
        answer: 'ì ì¸ë ì¼ì  ê¸ì¡(ì ì¸ê¸)ì ë³´ì¦ê¸ì¼ë¡ ë§¡ê¸°ê³  ì ìëë£ ìì´ ê±°ì£¼íë ë°©ìì´ë©°, ê³ì½ ì¢ë£ ì ë³´ì¦ê¸ì ëë ¤ë°ìµëë¤. ìì¸ë ë¹êµì  ì ì ë³´ì¦ê¸ì ë§¤ë¬ ì¼ì  ê¸ì¡ì ìëë£ë¥¼ ì§ë¶íë ë°©ììëë¤.',
      },
      {
        question: 'ë³´ì¦ê¸ì ìì íê°ì?',
        answer: 'ì ì¸ë³´ì¦ê¸ ë°íë³´ì¦ë³´í(HUG, SGI ë±)ì ê°ìíìë©´ ì§ì£¼ì¸ì´ ë³´ì¦ê¸ì ëë ¤ì£¼ì§ ëª»íë ìí©ììë ë³´í¸ë°ì ì ììµëë¤. WISHESììë ìì í ê±°ëë¥¼ ìí´ ë³´ì¦ë³´í ê°ìì ì ê·¹ ê¶ì¥íê³  ììµëë¤.',
      },
      {
        question: 'ì¤ê°ììë£ë ì¼ë§ì¸ê°ì?',
        answer: 'ì¤ê°ììë£ë ê±°ëê¸ì¡ì ë°ë¼ ë²ì  ìì¨ì´ ì ì©ë©ëë¤. ìë¥¼ ë¤ì´, ë³´ì¦ê¸ 5ì²ë§ì~1ìµì ë¯¸ë§ ì£¼íì ê²½ì° ìí ìì¨ 0.4% (íë 30ë§ì)ê° ì ì©ë©ëë¤. ì íí ììë£ë ìë´ ì ìë´í´ ëë¦½ëë¤.',
      },
      {
        question: 'ê³ì½ ê¸°ê°ì ë³´íµ ì´ë»ê² ëëì?',
        answer: 'ì£¼í ìëì°¨ì ê²½ì° ìµì ê³ì½ê¸°ê°ì 2ëì´ë©° (ì£¼íìëì°¨ë³´í¸ë²), ìê°ì ê²½ì° ìµì 1ëìëë¤ (ìê°ê±´ë¬´ìëì°¨ë³´í¸ë²). ê°±ì  ììë ê¸°ì¡´ ì¡°ê±´ì¼ë¡ ì°ì¥ ìì²­ì´ ê°ë¥í©ëë¤.',
      },
    ],
  },
  {
    id: 'commercial',
    title: 'ììì© ë¶ëì°',
    icon: <Building2 className="w-5 h-5" />,
    items: [
      {
        question: 'ìê° ë§¤ë¬¼ì ê¶ë¦¬ê¸ì´ë ë¬´ìì¸ê°ì?',
        answer: 'ê¶ë¦¬ê¸ì ê¸°ì¡´ ìì°¨ì¸ì´ ììì íµí´ íì±í ê³ ê°, ëªì±, ìì¤ ë±ì ê°ì¹ì ëí´ ìë¡ì´ ìì°¨ì¸ì´ ì§ë¶íë ê¸ì¡ìëë¤. ë°ë¥ ê¶ë¦¬ê¸(ìì¹), ìì¤ ê¶ë¦¬ê¸(ì¸íë¦¬ì´/ì¤ë¹), ìì ê¶ë¦¬ê¸(ê³ ê°/ë§¤ì¶) ë±ì¼ë¡ êµ¬ë¶ë©ëë¤.',
      },
      {
        question: 'ìê° ìì¸ì ë¶ê°ì¸ê° í¬í¨ëëì?',
        answer: 'ìê° ìëì ê²½ì° ìëë£ì ë¶ê°ê°ì¹ì¸(10%)ê° ë³ëë¡ ë¶ê³¼ë©ëë¤. ë§¤ë¬¼ ì ë³´ì "ë¶ê°ì¸ë³ë" ëë "ë¶ê°ì¸í¬í¨"ì¼ë¡ íê¸°ëì´ ìì¼ë íì¸í´ ì£¼ì¸ì. ì¸ê¸ê³ì°ì ë°í ê´ë ¨ ì¬í­ë ê³ì½ ì íì¸íìê¸° ë°ëëë¤.',
      },
      {
        question: 'ì¬ë¬´ì¤ì êµ¬í  ë ì£¼ìí  ì ì?',
        answer: 'ì¬ë¬´ì¤ ì í ì ì£¼ì íì¸ ì¬í­ì ë¤ìê³¼ ê°ìµëë¤: 1) ì ì©ë©´ì ê³¼ ê³µì©ë©´ì  ë¹ì¢, 2) ê´ë¦¬ë¹ í¬í¨ í­ëª©(ì ê¸°, ëëë°©, ìë ë±), 3) ì£¼ì°¨ ê°ë¥ ì¬ë¶ ë° ì¶ê° ë¹ì©, 4) ì¸í°ë·/íµì  ì¸íë¼, 5) ê±´ë¬¼ ë³´ì ë° ì¶ì ìì¤í, 6) ìëì°¨ ê³ì½ ì¡°ê±´(ë³´ì¦ê¸, ê¸°ê°, ììë³µêµ¬ ìë¬´ ë±).',
      },
    ],
  },
  {
    id: 'payment',
    title: 'ë¹ì©Â·ê³ì°',
    icon: <CreditCard className="w-5 h-5" />,
    items: [
      {
        question: 'ëì¶ ê³ì°ê¸°ë ì´ë»ê² ì¬ì©íëì?',
        answer: '"ëì¶ê³ì°ê¸°" ë©ë´ìì ëì¶ ê¸ì¡, ì´ìì¨, ìí ê¸°ê°ì ìë ¥íìë©´ ì ìíê¸ê³¼ ì´ ì´ìë¥¼ ìëì¼ë¡ ê³ì°í´ ëë¦½ëë¤. ìë¦¬ê¸ê· ë±ìí, ìê¸ê· ë±ìí, ë§ê¸°ì¼ììí ë± ë¤ìí ìí ë°©ìì ë¹êµí  ì ììµëë¤.',
      },
      {
        question: 'ì´ê¸° ë¹ì©ì ì´ë¤ ê²ë¤ì´ ìëì?',
        answer: 'ì¼ë°ì ì¼ë¡ ë³´ì¦ê¸(ëë ì ì¸ê¸), ì²« ë¬ ìì¸, ì¤ê°ììë£, ì´ì¬ ë¹ì©ì´ íìí©ëë¤. ìê°ì ê²½ì° ê¶ë¦¬ê¸, ì¸íë¦¬ì´ ë¹ì©, ì¬ììë±ë¡ ê´ë ¨ ë¹ì©ì´ ì¶ê°ë  ì ììµëë¤. ìì¸í ë¹ì© ìë´ì WISHESìì ëìëë¦½ëë¤.',
      },
    ],
  },
  {
    id: 'safety',
    title: 'ìì ê±°ë',
    icon: <ShieldCheck className="w-5 h-5" />,
    items: [
      {
        question: 'ìì í ë¶ëì° ê±°ëë¥¼ ìí´ ì´ë¤ ê²ì íì¸í´ì¼ íëì?',
        answer: 'ê³ì½ ì  ë°ëì íì¸íì¸ì: 1) ë±ê¸°ë¶ë±ë³¸ íì¸(ìì ê¶, ê·¼ì ë¹, ê°ìë¥ ë±), 2) ê±´ì¶ë¬¼ëì¥ íì¸(ìë°ê±´ì¶ë¬¼ ì¬ë¶), 3) ìëì¸ ì ë¶ íì¸, 4) ì ì¸ë³´ì¦ê¸ë°íë³´ì¦ë³´í ê°ì ê°ë¥ ì¬ë¶, 5) íì ì¼ì ë° ì ìì ê³ . WISHESìì ìì ê±°ëë¥¼ ìí ì²´í¬ë¦¬ì¤í¸ë¥¼ ì ê³µí´ ëë¦½ëë¤.',
      },
      {
        question: 'íì ë§¤ë¬¼ì ì´ë»ê² êµ¬ë¶íëì?',
        answer: 'WISHESë ì¤ë§¤ë¬¼ë§ ë±ë¡íë ê²ì ìì¹ì¼ë¡ í©ëë¤. ìì¸ë³´ë¤ íì í ì ë ´í ë§¤ë¬¼, ì¬ì§ì´ ì§ëì¹ê² ì¢ì ë§¤ë¬¼, ê¸íê² ê³ì½ì ìêµ¬íë ê²½ì° ë±ì ì£¼ìê° íìí©ëë¤. ìì¬ì¤ë¬ì´ ë§¤ë¬¼ì´ ìì¼ìë©´ ì¸ì ë  WISHESì ë¬¸ìí´ ì£¼ì¸ì.',
      },
    ],
  },
  {
    id: 'contact',
    title: 'ìë´Â·ì ì',
    icon: <Phone className="w-5 h-5" />,
    items: [
      {
        question: 'ìë´ì ì´ë»ê² ì ì²­íëì?',
        answer: 'ìë¨ ë©ë´ì "ìë´Â·ë§¤ë¬¼ì ì"ë¥¼ í´ë¦­íìë©´ ìë´ ì ì²­ í¼ì´ ëìµëë¤. ì´ë¦, ì°ë½ì², ë¬¸ì ì í, í¬ë§ ë§¤ë¬¼ ì¡°ê±´ ë±ì ìë ¥í´ ì£¼ìë©´ ë¹ ë¥¸ ìì¼ ë´ì ì ë¬¸ ìë´ì¬ê° ì°ë½ëë¦½ëë¤.',
      },
      {
        question: 'ë§¤ë¬¼ì ë´ëê³  ì¶ìë° ì´ë»ê² íëì?',
        answer: '"ìë´Â·ë§¤ë¬¼ì ì" íì´ì§ìì "ë§¤ë¬¼ì ì" í­ì ì ííìë©´ ë§¤ë¬¼ ë±ë¡ ì ì²­ì´ ê°ë¥í©ëë¤. ë§¤ë¬¼ ì í, ìì¹, ë©´ì , ê°ê²© ë±ì ì ë³´ë¥¼ ìë ¥í´ ì£¼ìë©´ ë´ë¹ìê° íì¸ í ì°ë½ëë¦½ëë¤.',
      },
      {
        question: 'ìì ìê°ì ì´ë»ê² ëëì?',
        answer: 'WISHESë íì¼ 09:00~18:00, í ìì¼ 10:00~15:00ì ì´ìë©ëë¤ (ì¼ìì¼ ë° ê³µí´ì¸ í´ë¬´). ì¨ë¼ì¸ ìë´ ì ì²­ì 24ìê° ê°ë¥íë©°, ìììê° ì¸ ì ì ê±´ì ë¤ì ììì¼ì ìì°¨ì ì¼ë¡ ì°ë½ëë¦½ëë¤.',
      },
    ],
  },
];

function FAQAccordion({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-800 pr-4">{item.question}</span>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180 text-wishes-secondary'
          )}
        />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
          {item.answer}
        </div>
      </div>
    </div>
  );
}

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState('general');
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState('');

  const currentCategory = faqCategories.find((c) => c.id === activeCategory);

  // ê²ì ê¸°ë¥
  const filteredItems = searchQuery.trim()
    ? faqCategories.flatMap((cat) =>
        cat.items
          .filter(
            (item) =>
              item.question.includes(searchQuery) || item.answer.includes(searchQuery)
          )
          .map((item) => ({ ...item, category: cat.title }))
      )
    : null;

  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      {/* í¤ë */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-bold drop-shadow-lg">ìì£¼ ë¬»ë ì§ë¬¸</h1>
          <p className="mt-3 text-lg text-white/80">
            ê¶ê¸í ì ì ë¹ ë¥´ê² ì°¾ìë³´ì¸ì
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 -mt-8 relative z-10">
        {/* ê²ì */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOpenIndex(null);
              }}
              placeholder="ì§ë¬¸ì ê²ìí´ë³´ì¸ì..."
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* ê²ì ê²°ê³¼ */}
        {filteredItems ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-8">
            <p className="text-sm text-gray-500 mb-4">
              &ldquo;{searchQuery}&rdquo; ê²ì ê²°ê³¼: {filteredItems.length}ê±´
            </p>
            {filteredItems.length > 0 ? (
              <div className="space-y-3">
                {filteredItems.map((item, idx) => (
                  <FAQAccordion
                    key={idx}
                    item={item}
                    isOpen={openIndex === idx}
                    onToggle={() => setOpenIndex(openIndex === idx ? null : idx)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8">
                ê²ì ê²°ê³¼ê° ììµëë¤. ë¤ë¥¸ í¤ìëë¡ ê²ìí´ë³´ì¸ì.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* ì¹´íê³ ë¦¬ í­ */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-6">
              <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-200">
                {faqCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setOpenIndex(0);
                    }}
                    className={cn(
                      'flex items-center gap-2 px-5 py-4 text-sm font-semibold whitespace-nowrap transition-all border-b-2 shrink-0',
                      activeCategory === cat.id
                        ? 'text-wishes-primary border-wishes-primary bg-wishes-cream/20'
                        : 'text-gray-500 border-transparent hover:text-gray-900'
                    )}
                  >
                    {cat.icon}
                    {cat.title}
                  </button>
                ))}
              </div>
            </div>

            {/* FAQ ëª©ë¡ */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-8">
              <div className="space-y-3">
                {currentCategory?.items.map((item, idx) => (
                  <FAQAccordion
                    key={idx}
                    item={item}
                    isOpen={openIndex === idx}
                    onToggle={() => setOpenIndex(openIndex === idx ? null : idx)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ì¶ê° ë¬¸ì ìë´ */}
        <div className="text-center pb-12">
          <p className="text-sm text-gray-500 mb-3">ìíìë ëµë³ì ì°¾ì§ ëª»íì¨ëì?</p>
          <a
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 bg-wishes-primary text-white rounded-xl font-semibold hover:bg-wishes-secondary transition-colors"
          >
            <Phone className="w-4 h-4" />
            ìë´ ì ì²­íê¸°
          </a>
        </div>
      </div>
    </div>
  );
}
