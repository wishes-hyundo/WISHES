'use client';

import { useState } from 'react';
import { Calculator, TrendingDown, Percent, Building2, Info } from 'lucide-react';

export default function CalculatorPage() {
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('3.5');
  const [loanTerm, setLoanTerm] = useState('30');
  const [repaymentType, setRepaymentType] = useState<'equal' | 'equalPrincipal'>('equal');
  const [result, setResult] = useState<{
    monthlyPayment: number;
    totalPayment: number;
    totalInterest: number;
  } | null>(null);

  const calculate = () => {
    const principal = parseFloat(loanAmount) * 10000; // 만원 → 원
    const monthlyRate = parseFloat(interestRate) / 100 / 12;
    const months = parseInt(loanTerm) * 12;

    if (!principal || !monthlyRate || !months) return;

    if (repaymentType === 'equal') {
      // 원리금균등상환
      const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
      const totalPayment = monthlyPayment * months;
      const totalInterest = totalPayment - principal;

      setResult({
        monthlyPayment: Math.round(monthlyPayment),
        totalPayment: Math.round(totalPayment),
        totalInterest: Math.round(totalInterest),
      });
    } else {
      // 원금균등상환 (첫 달 기준)
      const principalPerMonth = principal / months;
      const firstMonthInterest = principal * monthlyRate;
      const firstMonthPayment = principalPerMonth + firstMonthInterest;

      let totalInterest = 0;
      for (let i = 0; i < months; i++) {
        totalInterest += (principal - principalPerMonth * i) * monthlyRate;
      }

      setResult({
        monthlyPayment: Math.round(firstMonthPayment),
        totalPayment: Math.round(principal + totalInterest),
        totalInterest: Math.round(totalInterest),
      });
    }
  };

  const formatWon = (amount: number) => {
    if (amount >= 100000000) {
      const uk = Math.floor(amount / 100000000);
      const man = Math.floor((amount % 100000000) / 10000);
      return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억원`;
    }
    if (amount >= 10000) {
      return `${Math.floor(amount / 10000).toLocaleString()}만원`;
    }
    return `${amount.toLocaleString()}원`;
  };

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-wishes-primary flex items-center gap-2">
            <Calculator className="w-7 h-7" />
            대출 계산기
          </h1>
          <p className="text-sm text-gray-500 mt-1">월 상환액과 총 이자를 간편하게 계산해보세요</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
          {/* 대출금액 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">대출 금액 (만원)</label>
            <div className="relative">
              <input
                type="number"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                placeholder="예: 30000 (3억)"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-lg"
              />
              {loanAmount && (
                <p className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-wishes-secondary font-medium">
                  {formatWon(parseFloat(loanAmount) * 10000)}
                </p>
              )}
            </div>
          </div>

          {/* 금리 + 기간 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Percent className="w-4 h-4 inline mr-1" />
                연 이자율 (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">대출 기간 (년)</label>
              <select
                value={loanTerm}
                onChange={(e) => setLoanTerm(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary"
              >
                {[5, 10, 15, 20, 25, 30, 35, 40].map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </div>
          </div>

          {/* 상환 방식 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">상환 방식</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRepaymentType('equal')}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                  repaymentType === 'equal'
                    ? 'border-wishes-secondary bg-wishes-secondary/10 text-wishes-secondary'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                원리금균등상환
              </button>
              <button
                type="button"
                onClick={() => setRepaymentType('equalPrincipal')}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                  repaymentType === 'equalPrincipal'
                    ? 'border-wishes-secondary bg-wishes-secondary/10 text-wishes-secondary'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                원금균등상환
              </button>
            </div>
          </div>

          {/* 계산 버튼 */}
          <button
            onClick={calculate}
            className="w-full bg-wishes-secondary text-white py-4 rounded-xl font-bold text-lg hover:bg-wishes-primary transition-colors"
          >
            계산하기
          </button>
        </div>

        {/* 결과 */}
        {result && (
          <div className="mt-6 bg-white rounded-2xl border border-wishes-secondary/30 p-6 space-y-4">
            <h3 className="text-lg font-bold text-wishes-primary">계산 결과</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-wishes-secondary/5 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">월 상환액</p>
                <p className="text-xl font-bold text-wishes-primary">{formatWon(result.monthlyPayment)}</p>
                {repaymentType === 'equalPrincipal' && (
                  <p className="text-[10px] text-gray-400 mt-1">(첫 달 기준, 매월 감소)</p>
                )}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">총 상환액</p>
                <p className="text-xl font-bold text-gray-800">{formatWon(result.totalPayment)}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">총 이자</p>
                <p className="text-xl font-bold text-red-600">{formatWon(result.totalInterest)}</p>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-yellow-50 rounded-lg p-3 text-xs text-yellow-700">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p>본 계산 결과는 참고용이며, 실제 대출 조건은 금융기관에 따라 달라질 수 있습니다. 정확한 상담은 WISHES에 문의해주세요.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
