'use client';

import { useState, useMemo, useEffect } from 'react';
import { Calculator, Building2, Home, TrendingDown, Info, ChevronDown } from 'lucide-react';

import { createClient } from '@/lib/supabase';
type LoanType = 'mortgage' | 'jeonse';
type RepaymentType = 'equal_principal_interest' | 'equal_principal' | 'bullet';

const DEFAULT_RATE_PRESETS = {
  mortgage: [
    { label: '시중은행 주담대 (고정)', rate: 4.8 },
    { label: '보금자리론', rate: 4.5 },
    { label: '디딤돌대출', rate: 3.5 },
    { label: '신혼부부 디딤돌', rate: 2.7 },
  ],
  jeonse: [
    { label: '버팀목 전세대출', rate: 2.5 },
    { label: '카카오뱅크 전세', rate: 4.0 },
    { label: '시중은행 전세', rate: 4.2 },
    { label: '청년전용 버팀목', rate: 2.5 },
  ],
};

function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

function formatWon(num: number): string {
  if (num >= 10000) {
    const eok = Math.floor(num / 10000);
    const man = num % 10000;
    return man > 0 ? `${eok}억 ${formatNumber(man)}만원` : `${eok}억원`;
  }
  return `${formatNumber(num)}만원`;
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

  // Supabase에서 최신 금리 가져오기
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
        // Supabase 연결 실패 시 기본값 사용
        console.log('Using default rates');
      }
    }
    fetchLatestRates();
  }, []);

  const result = useMemo(() => {
    const P = Number(amount) * 10000; // 만원 → 원
    const r = Number(rate) / 100 / 12; // 월이율
    const n = Number(years) * 12; // 총 개월수

    if (!P || !r || !n || P <= 0 || r <= 0 || n <= 0) return null;

    let monthlyPayment = 0;
    let totalPayment = 0;
    let totalInterest = 0;
    const schedule: { month: number; payment: number; principal: number; interest: number; balance: number }[] = [];

    if (repaymentType === 'equal_principal_interest') {
      // 원리금균등
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
      // 원금균등
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
      // 만기일시
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
          <h1 className="text-3xl md:text-4xl font-bold">대출 계산기</h1>
          <p className="mt-3 text-white/80">주택담보대출, 전세자금대출 월 상환액을 미리 계산해보세요</p>
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
              주택담보대출
            </button>
            <button
              onClick={() => { setLoanType('jeonse'); setRate('3.8'); setYears('2'); setRepaymentType('bullet'); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
                loanType === 'jeonse' ? 'bg-white shadow text-slate-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building2 className="w-4 h-4" />
              전세자금대출
            </button>
          </div>

          {/* Rate Presets */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2">금리 프리셋 (2026년 기준 참고용)</p>
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
            <p className="text-xs text-wishes-muted mt-1">금리 기준일: {ratesLastUpdated} (자동 업데이트)</p>
          )}
          </div>
            {/* 금리 출처 정보 */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center gap-1.5 mb-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <span className="text-xs font-semibold text-blue-700">금리 출처 안내</span>
              </div>
              <ul className="text-[11px] text-blue-600/80 space-y-0.5 ml-5 list-disc">
                <li>기준금리: 한국은행 (bok.or.kr) - 현재 2.50%</li>
                <li>주택담보대출: 전국은행연합회 (portal.kfb.or.kr)</li>
                <li>보금자리론/디딤돌: 한국주택금융공사 (hf.go.kr)</li>
                <li>전세대출: 주택도시기금 (nhuf.molit.go.kr)</li>
              </ul>
              <p className="text-[10px] text-blue-400 mt-2">* 금리는 매일 자동 업데이트되며, 실제 금리는 개인 신용도 및 조건에 따라 달라질 수 있습니다.</p>
            </div>

          {/* Input Fields */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                대출금액 (만원)
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
                연이율 (%)
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
                대출기간 (년)
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
                    {y}년
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                상환방식
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'equal_principal_interest', label: '원리금균등' },
                  { value: 'equal_principal', label: '원금균등' },
                  { value: 'bullet', label: '만기일시' },
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
                계산 결과
              </h2>

              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 text-center border border-amber-100">
                  <p className="text-sm text-gray-600 mb-1">
                    {repaymentType === 'equal_principal' ? '첫 달' : '월'} 상환액
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-amber-600">
                    {formatNumber(Math.round(result.monthlyPayment / 10000))}
                    <span className="text-base font-normal">만원</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ({formatNumber(result.monthlyPayment)}원)
                  </p>
                </div>

                <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
                  <p className="text-sm text-gray-600 mb-1">총 상환금액</p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-800">
                    {formatWon(Math.round(result.totalPayment / 10000))}
                  </p>
                </div>

                <div className="bg-red-50 rounded-2xl p-6 text-center border border-red-100">
                  <p className="text-sm text-gray-600 mb-1">총 이자</p>
                  <p className="text-2xl md:text-3xl font-bold text-red-500">
                    {formatWon(Math.round(result.totalInterest / 10000))}
                  </p>
                </div>
              </div>

              {/* Interest ratio bar */}
              <div className="mb-6">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>원금 비율</span>
                  <span>이자 비율</span>
                </div>
                <div className="h-4 bg-red-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${(result.principal / result.totalPayment) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-amber-600 font-medium">
                    원금 {((result.principal / result.totalPayment) * 100).toFixed(1)}%
                  </span>
                  <span className="text-red-500 font-medium">
                    이자 {((result.totalInterest / result.totalPayment) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Toggle Schedule */}
              <button
                onClick={() => setShowSchedule(!showSchedule)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors mx-auto"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showSchedule ? 'rotate-180' : ''}`} />
                상환 스케줄 {showSchedule ? '숨기기' : '보기'}
              </button>

              {showSchedule && (
                <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-gray-600">회차</th>
                        <th className="px-4 py-3 text-right text-gray-600">상환액</th>
                        <th className="px-4 py-3 text-right text-gray-600">원금</th>
                        <th className="px-4 py-3 text-right text-gray-600">이자</th>
                        <th className="px-4 py-3 text-right text-gray-600">잔액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.schedule.filter((_, i) => {
                        // 연 단위로 표시 (12개월마다) + 첫 달
                        return i === 0 || (i + 1) % 12 === 0 || i === result.schedule.length - 1;
                      }).map(row => (
                        <tr key={row.month} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800">{row.month}회</td>
                          <td className="px-4 py-2 text-right">{formatNumber(row.payment)}원</td>
                          <td className="px-4 py-2 text-right text-amber-600">{formatNumber(row.principal)}원</td>
                          <td className="px-4 py-2 text-right text-red-500">{formatNumber(row.interest)}원</td>
                          <td className="px-4 py-2 text-right text-gray-600">{formatNumber(row.balance)}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-6 bg-blue-50 rounded-xl p-4 flex gap-3">
                <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">참고 안내</p>
                  <p>본 계산기는 참고용이며 실제 대출 조건은 금융기관별로 다를 수 있습니다. 정확한 대출 한도 및 금리는 해당 은행에 직접 문의하시기 바랍니다. 위시스부동산에서 대출 상담 연계도 가능합니다.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}