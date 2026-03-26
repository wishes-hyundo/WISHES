'use client';

import { useState, useMemo, useEffect } from 'react';
import { Calculator, Building2, Home, TrendingDown, Info, ChevronDown } from 'lucide-react';

import { createClient } from '@/lib/supabase';
type LoanType = 'mortgage' | 'jeonse';
type RepaymentType = 'equal_principal_interest' | 'equal_principal' | 'bullet';

const DEFAULT_RATE_PRESETS = {
  mortgage: [
    { label: 'ìì¤ìí ì£¼ë´ë', rate: 4.5 },
    { label: 'í¹ë¡ë³´ê¸ìë¦¬ë¡ ', rate: 4.2 },
    { label: 'ëëëëì¶', rate: 2.45 },
    { label: 'ì í¼ë¶ë¶ í¹ë¡', rate: 2.2 },
  ],
  jeonse: [
    { label: 'ë²íëª© ì ì¸ëì¶', rate: 2.3 },
    { label: 'ì¹´ì¹´ì¤ë±í¬ ì ì¸', rate: 3.9 },
    { label: 'ìì¤ìí ì ì¸', rate: 4.5 },
    { label: 'ì²­ëì ì© ë²íëª©', rate: 1.8 },
  ],
};

function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

function formatWon(num: number): string {
  if (num >= 10000) {
    const eok = Math.floor(num / 10000);
    const man = num % 10000;
    return man > 0 ? `${eok}ìµ ${formatNumber(man)}ë§ì` : `${eok}ìµì`;
  }
  return `${formatNumber(num)}ë§ì`;
}

export default function LoanCalculatorPage() {
  const [loanType, setLoanType] = useState<LoanType>('mortgage');
  const [amount, setAmount] = useState('30000');
  const [rate, setRate] = useState('3.5');
  const [years, setYears] = useState('30');
  const [repaymentType, setRepaymentType] = useState<RepaymentType>('equal_principal_interest');
  const [showSchedule, setShowSchedule] = useState(false);
  const [ratePresets, setRatePresets] = useState(DEFAULT_RATE_PRESETS);
  const [ratesLastUpdated, setRatesLastUpdated] = useState<string>('');

  // Supabaseìì ìµì  ê¸ë¦¬ ê°ì ¸ì¤ê¸°
  useEffect(() => {
    async function fetchLatestRates() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('loan_rates')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1);
        if (data && data.length > 0 && !error) {
          const row = data[0];
          if (row.mortgage_rates && row.jeonse_rates) {
            setRatePresets({
              mortgage: row.mortgage_rates,
              jeonse: row.jeonse_rates,
            });
            setRatesLastUpdated(new Date(row.updated_at).toLocaleDateString('ko-KR'));
          }
        }
      } catch (e) {
        // Supabase ì°ê²° ì¤í¨ ì ê¸°ë³¸ê° ì¬ì©
        console.log('Using default rates');
      }
    }
    fetchLatestRates();
  }, []);

  const result = useMemo(() => {
    const P = Number(amount) * 10000; // ë§ì â ì
    const r = Number(rate) / 100 / 12; // ìì´ì¨
    const n = Number(years) * 12; // ì´ ê°ìì

    if (!P || !r || !n || P <= 0 || r <= 0 || n <= 0) return null;

    let monthlyPayment = 0;
    let totalPayment = 0;
    let totalInterest = 0;
    const schedule: { month: number; payment: number; principal: number; interest: number; balance: number }[] = [];

    if (repaymentType === 'equal_principal_interest') {
      // ìë¦¬ê¸ê· ë±
      monthlyPayment = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
      let balance = P;
      for (let i = 1; i <= n; i++) {
        const interest = balance * r;
        const principal = monthlyPayment - interest;
        balance -= principal;
        schedule.push({
          month: i,
          payment: Math.round(monthlyPayment),
          principal: Math.round(principal),
          interest: Math.round(interest),
          balance: Math.max(0, Math.round(balance)),
        });
      }
      totalPayment = monthlyPayment * n;
      totalInterest = totalPayment - P;
    } else if (repaymentType === 'equal_principal') {
      // ìê¸ê· ë±
      const monthlyPrincipal = P / n;
      let balance = P;
      for (let i = 1; i <= n; i++) {
        const interest = balance * r;
        const payment = monthlyPrincipal + interest;
        balance -= monthlyPrincipal;
        totalPayment += payment;
        totalInterest += interest;
        schedule.push({
          month: i,
          payment: Math.round(payment),
          principal: Math.round(monthlyPrincipal),
          interest: Math.round(interest),
          balance: Math.max(0, Math.round(balance)),
        });
      }
      monthlyPayment = schedule[0]?.payment || 0;
    } else {
      // ë§ê¸°ì¼ì
      const monthlyInterest = P * r;
      monthlyPayment = monthlyInterest;
      totalInterest = monthlyInterest * n;
      totalPayment = P + totalInterest;
      for (let i = 1; i <= n; i++) {
        schedule.push({
          month: i,
          payment: i === n ? Math.round(monthlyInterest + P) : Math.round(monthlyInterest),
          principal: i === n ? Math.round(P) : 0,
          interest: Math.round(monthlyInterest),
          balance: i === n ? 0 : Math.round(P),
        });
      }
    }

    return {
      monthlyPayment: Math.round(monthlyPayment),
      totalPayment: Math.round(totalPayment),
      totalInterest: Math.round(totalInterest),
      principal: P,
      schedule,
    };
  }, [amount, rate, years, repaymentType]);

  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-16 md:py-20">
        <div className="max-w-5xl mx-auto px-4 text-center">
<h1 className="text-3xl md:text-4xl font-bold">ëì¶ ê³ì°ê¸°</h1>
          <p className="mt-3 text-white/80">ì£¼íë´ë³´ëì¶, ì ì¸ìê¸ëì¶ ì ìíì¡ì ë¯¸ë¦¬ ê³ì°í´ë³´ì¸ì</p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 -mt-6 pb-16">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          {/* Loan Type Tabs */}
          <div className="flex rounded-xl bg-gray-100 p-1 mb-8">
            <button
              onClick={() => { setLoanType('mortgage'); setRate('3.5'); setYears('30'); setRepaymentType('equal_principal_interest'); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
                loanType === 'mortgage' ? 'bg-white shadow text-slate-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Home className="w-4 h-4" />
              ì£¼íë´ë³´ëì¶
            </button>
            <button
              onClick={() => { setLoanType('jeonse'); setRate('3.8'); setYears('2'); setRepaymentType('bullet'); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
                loanType === 'jeonse' ? 'bg-white shadow text-slate-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building2 className="w-4 h-4" />
              ì ì¸ìê¸ëì¶
            </button>
          </div>

          {/* Rate Presets */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2">ê¸ë¦¬ íë¦¬ì (2026ë ê¸°ì¤ ì°¸ê³ ì©)</p>
            <div className="flex flex-wrap gap-2">
              {ratePresets[loanType].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setRate(String(preset.rate))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    rate === String(preset.rate)
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {preset.label} {preset.rate}%
                </button>
              ))}
            </div>
          {ratesLastUpdated && (
            <p className="text-xs text-wishes-muted mt-1">ê¸ë¦¬ ê¸°ì¤ì¼: {ratesLastUpdated} (ìë ìë°ì´í¸)</p>
          )}
          </div>

          {/* Input Fields */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ëì¶ê¸ì¡ (ë§ì)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400 text-lg"
                  placeholder="30000"
                />
                {Number(amount) > 0 && (
                  <p className="text-xs text-amber-600 mt-1">{formatWon(Number(amount))}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ì°ì´ì¨ (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={rate}
                onChange={e => setRate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400 text-lg"
                placeholder="3.5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ëì¶ê¸°ê° (ë)
              </label>
              <div className="flex gap-2">
                {(loanType === 'mortgage' ? [10, 15, 20, 30, 40] : [1, 2, 3, 4]).map(y => (
                  <button
                    key={y}
                    onClick={() => setYears(String(y))}
                    className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                      years === String(y)
                        ? 'bg-slate-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {y}ë
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ìíë°©ì
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'equal_principal_interest', label: 'ìë¦¬ê¸ê· ë±' },
                  { value: 'equal_principal', label: 'ìê¸ê· ë±' },
                  { value: 'bullet', label: 'ë§ê¸°ì¼ì' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setRepaymentType(opt.value as RepaymentType)}
                    className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                      repaymentType === opt.value
                        ? 'bg-slate-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div className="border-t pt-16">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-amber-500" />
                ê³ì° ê²°ê³¼
              </h2>

              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 text-center border border-amber-100">
                  <p className="text-sm text-gray-600 mb-1">
                    {repaymentType === 'equal_principal' ? 'ì²« ë¬' : 'ì'} ìíì¡
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-amber-600">
                    {formatNumber(Math.round(result.monthlyPayment / 10000))}
                    <span className="text-base font-normal">ë§ì</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ({formatNumber(result.monthlyPayment)}ì)
                  </p>
                </div>

                <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
                  <p className="text-sm text-gray-600 mb-1">ì´ ìíê¸ì¡</p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-800">
                    {formatWon(Math.round(result.totalPayment / 10000))}
                  </p>
                </div>

                <div className="bg-red-50 rounded-2xl p-6 text-center border border-red-100">
                  <p className="text-sm text-gray-600 mb-1">ì´ ì´ì</p>
                  <p className="text-2xl md:text-3xl font-bold text-red-500">
                    {formatWon(Math.round(result.totalInterest / 10000))}
                  </p>
                </div>
              </div>

              {/* Interest ratio bar */}
              <div className="mb-6">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>ìê¸ ë¹ì¨</span>
                  <span>ì´ì ë¹ì¨</span>
                </div>
                <div className="h-4 bg-red-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${(result.principal / result.totalPayment) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-amber-600 font-medium">
                    ìê¸ {((result.principal / result.totalPayment) * 100).toFixed(1)}%
                  </span>
                  <span className="text-red-500 font-medium">
                    ì´ì {((result.totalInterest / result.totalPayment) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Toggle Schedule */}
              <button
                onClick={() => setShowSchedule(!showSchedule)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors mx-auto"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showSchedule ? 'rotate-180' : ''}`} />
                ìí ì¤ì¼ì¤ {showSchedule ? 'ì¨ê¸°ê¸°' : 'ë³´ê¸°'}
              </button>

              {showSchedule && (
                <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-gray-600">íì°¨</th>
                        <th className="px-4 py-3 text-right text-gray-600">ìíì¡</th>
                        <th className="px-4 py-3 text-right text-gray-600">ìê¸</th>
                        <th className="px-4 py-3 text-right text-gray-600">ì´ì</th>
                        <th className="px-4 py-3 text-right text-gray-600">ìì¡</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.schedule.filter((_, i) => {
                        // ì° ë¨ìë¡ íì (12ê°ìë§ë¤) + ì²« ë¬
                        return i === 0 || (i + 1) % 12 === 0 || i === result.schedule.length - 1;
                      }).map(row => (
                        <tr key={row.month} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800">{row.month}í</td>
                          <td className="px-4 py-2 text-right">{formatNumber(row.payment)}ì</td>
                          <td className="px-4 py-2 text-right text-amber-600">{formatNumber(row.principal)}ì</td>
                          <td className="px-4 py-2 text-right text-red-500">{formatNumber(row.interest)}ì</td>
                          <td className="px-4 py-2 text-right text-gray-600">{formatNumber(row.balance)}ì</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-6 bg-blue-50 rounded-xl p-4 flex gap-3">
                <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">ì°¸ê³  ìë´</p>
                  <p>ë³¸ ê³ì°ê¸°ë ì°¸ê³ ì©ì´ë©° ì¤ì  ëì¶ ì¡°ê±´ì ê¸ìµê¸°ê´ë³ë¡ ë¤ë¥¼ ì ììµëë¤. ì íí ëì¶ íë ë° ê¸ë¦¬ë í´ë¹ ìíì ì§ì  ë¬¸ìíìê¸° ë°ëëë¤. ììì¤ë¶ëì°ìì ëì¶ ìë´ ì°ê³ë ê°ë¥í©ëë¤.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}