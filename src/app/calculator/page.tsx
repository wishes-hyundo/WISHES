'use client';

import { useState, useEffect } from 'react';
import { Calculator, Percent, Info, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type CalcTab = 'loan' | 'convert';

interface RatePreset {
  label: string;
  rate: number;
  description: string;
}

const DEFAULT_MORTGAGE_PRESETS: RatePreset[] = [
  { label: '시중은행 주담대(고정)', rate: 4.8, description: '시중은행 평균 고정금리' },
  { label: '보금자리론', rate: 4.5, description: '한국주택금융공사 고정금리' },
  { label: '디딤돌대출', rate: 3.5, description: '주택도시기금 정책대출' },
  { label: '신혼부부 디딤돌', rate: 2.7, description: '주택도시기금 신혼부부 우대' },
];

const DEFAULT_JEONSE_PRESETS: RatePreset[] = [
  { label: '버팀목 전세대출', rate: 2.5, description: '주택도시기금 전세대출' },
  { label: '카카오뱅크 전세', rate: 4.0, description: '인터넷은행 전세대출' },
  { label: '시중은행 전세', rate: 4.2, description: '시중은행 평균 전세대출' },
  { label: '청년전용 버팀목', rate: 2.5, description: '주택도시기금 청년 우대' },
];

export default function CalculatorPage() {
  const [activeTab, setActiveTab] = useState<CalcTab>('loan');

  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-wishes-primary flex items-center gap-2">
            <Calculator className="w-7 h-7" />
            부동산 계산기
          </h1>
          <p className="text-sm text-gray-500 mt-1">대출 상환액 계산과 전세↔월세 환산을 간편하게</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex gap-2 mb-6">
          <button onClick={() => setActiveTab('loan')} className={cn('flex-1 py-3 rounded-xl text-sm font-bold transition-all', activeTab === 'loan' ? 'bg-wishes-primary text-white shadow-lg' : 'bg-white text-gray-500 border border-gray-200 hover:border-wishes-secondary/30')}>
            <Calculator className="w-4 h-4 inline mr-1.5" />대출 계산기
          </button>
          <button onClick={() => setActiveTab('convert')} className={cn('flex-1 py-3 rounded-xl text-sm font-bold transition-all', activeTab === 'convert' ? 'bg-wishes-primary text-white shadow-lg' : 'bg-white text-gray-500 border border-gray-200 hover:border-wishes-secondary/30')}>
            <ArrowLeftRight className="w-4 h-4 inline mr-1.5" />전세↔월세 환산
          </button>
        </div>
        {activeTab === 'loan' ? <LoanCalculator /> : <ConvertCalculator />}
      </div>
    </div>
  );
}

function LoanCalculator() {
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('3.5');
  const [loanTerm, setLoanTerm] = useState('30');
  const [repaymentType, setRepaymentType] = useState<'equal' | 'equalPrincipal'>('equal');
  const [result, setResult] = useState<{ monthlyPayment: number; totalPayment: number; totalInterest: number } | null>(null);
  const [mortgagePresets, setMortgagePresets] = useState<RatePreset[]>(DEFAULT_MORTGAGE_PRESETS);
  const [jeonsePresets, setJeonsePresets] = useState<RatePreset[]>(DEFAULT_JEONSE_PRESETS);
  const [ratesLastUpdated, setRatesLastUpdated] = useState<string>('');
  const [ratesSource, setRatesSource] = useState<string>('');
  const [presetType, setPresetType] = useState<'mortgage' | 'jeonse'>('mortgage');

  useEffect(() => {
    async function loadRates() {
      try {
        const res = await fetch('/api/rates');
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        if (data.success && data.mortgage_rates && data.jeonse_rates) {
          setMortgagePresets(data.mortgage_rates);
          setJeonsePresets(data.jeonse_rates);
          setRatesSource(data.source || 'DB');
          if (data.updated_at) {
            const date = new Date(data.updated_at);
            setRatesLastUpdated(date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }));
          }
        }
      } catch {
        setRatesLastUpdated(new Date().toLocaleDateString('ko-KR'));
        setRatesSource('기본값');
      }
    }
    loadRates();
  }, []);

  const calculate = () => {
    const principal = parseFloat(loanAmount) * 10000;
    const monthlyRate = parseFloat(interestRate) / 100 / 12;
    const months = parseInt(loanTerm) * 12;
    if (!principal || !monthlyRate || !months) return;
    if (repaymentType === 'equal') {
      const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
      setResult({ monthlyPayment: Math.round(monthlyPayment), totalPayment: Math.round(monthlyPayment * months), totalInterest: Math.round(monthlyPayment * months - principal) });
    } else {
      const principalPerMonth = principal / months;
      const firstMonthPayment = principalPerMonth + principal * monthlyRate;
      let totalInterest = 0;
      for (let i = 0; i < months; i++) totalInterest += (principal - principalPerMonth * i) * monthlyRate;
      setResult({ monthlyPayment: Math.round(firstMonthPayment), totalPayment: Math.round(principal + totalInterest), totalInterest: Math.round(totalInterest) });
    }
  };

  const currentPresets = presetType === 'mortgage' ? mortgagePresets : jeonsePresets;

  return (
    <>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-2">
          <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-semibold">금리 출처 안내 (자동 업데이트)</p>
            <p>기준금리 · 주택담보대출: 한국은행 ECOS (경제통계시스템)</p>
            <p>보금자리론 · 디딤돌: 한국주택금융공사 / 주택도시기금</p>
            <p>전세대출: 전국은행연합회 소비자포털 참고</p>
            {ratesLastUpdated && <p className="text-blue-500">최종 업데이트: {ratesLastUpdated} ({ratesSource})</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">빠른 금리 선택</label>
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => setPresetType('mortgage')} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition', presetType === 'mortgage' ? 'bg-wishes-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>주택담보대출</button>
            <button type="button" onClick={() => setPresetType('jeonse')} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition', presetType === 'jeonse' ? 'bg-wishes-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>전세대출</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {currentPresets.map((preset) => (
              <button key={preset.label} type="button" onClick={() => setInterestRate(String(preset.rate))} className={cn('p-3 rounded-xl border text-left transition-all hover:shadow-sm', parseFloat(interestRate) === preset.rate ? 'border-wishes-secondary bg-wishes-secondary/5' : 'border-gray-200 hover:border-gray-300')}>
                <p className="text-sm font-semibold text-gray-800">{preset.label}</p>
                <p className="text-lg font-bold text-wishes-secondary">{preset.rate}%</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">대출 금액 (만원)</label>
          <div className="relative">
            <input type="number" inputMode="numeric" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="예: 30000 (3억)" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-lg" />
            {loanAmount && <p className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-wishes-secondary font-medium">{formatWon(parseFloat(loanAmount) * 10000)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2"><Percent className="w-4 h-4 inline mr-1" />연 이자율 (%)</label>
            <input type="number" inputMode="decimal" step="0.1" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">대출 기간 (년)</label>
            <select value={loanTerm} onChange={(e) => setLoanTerm(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary">
              {[5,10,15,20,25,30,35,40].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">상환 방식</label>
          <div className="flex gap-3">
            <button type="button" onClick={() => setRepaymentType('equal')} className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition ${repaymentType === 'equal' ? 'border-wishes-secondary bg-wishes-secondary/10 text-wishes-secondary' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>원리금균등상환</button>
            <button type="button" onClick={() => setRepaymentType('equalPrincipal')} className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition ${repaymentType === 'equalPrincipal' ? 'border-wishes-secondary bg-wishes-secondary/10 text-wishes-secondary' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>원금균등상환</button>
          </div>
        </div>

        <button onClick={calculate} className="w-full bg-wishes-secondary text-white py-4 rounded-xl font-bold text-lg hover:bg-wishes-primary transition-colors">계산하기</button>
      </div>

      {result && (
        <div className="mt-6 bg-white rounded-2xl border border-wishes-secondary/30 p-6 space-y-4">
          <h3 className="text-lg font-bold text-wishes-primary">계산 결과</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-wishes-secondary/5 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">월 상환액</p>
              <p className="text-xl font-bold text-wishes-primary">{formatWon(result.monthlyPayment)}</p>
              {repaymentType === 'equalPrincipal' && <p className="text-[10px] text-gray-400 mt-1">(첫 달 기준, 매월 감소)</p>}
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
    </>
  );
}

function ConvertCalculator() {
  const [mode, setMode] = useState<'jeonse_to_wolse' | 'wolse_to_jeonse'>('jeonse_to_wolse');
  const [jeonse, setJeonse] = useState('');
  const [deposit, setDeposit] = useState('');
  const [monthly, setMonthly] = useState('');
  const [conversionRate, setConversionRate] = useState('5.0');
  const [convertResult, setConvertResult] = useState<{ deposit: number; monthly: number; jeonse: number } | null>(null);

  const convertCalc = () => {
    const rate = parseFloat(conversionRate) / 100;
    if (!rate) return;
    if (mode === 'jeonse_to_wolse') {
      const jeonseAmount = parseFloat(jeonse);
      const depositAmount = parseFloat(deposit) || 0;
      if (!jeonseAmount) return;
      const diff = (jeonseAmount - depositAmount) * 10000;
      setConvertResult({ jeonse: jeonseAmount * 10000, deposit: depositAmount * 10000, monthly: Math.round((diff * rate) / 12) });
    } else {
      const depositAmount = parseFloat(deposit) || 0;
      const monthlyAmount = parseFloat(monthly) || 0;
      if (!monthlyAmount) return;
      setConvertResult({ jeonse: Math.round(depositAmount * 10000 + (monthlyAmount * 10000 * 12) / rate), deposit: depositAmount * 10000, monthly: monthlyAmount * 10000 });
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">환산 방향</label>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setMode('jeonse_to_wolse'); setConvertResult(null); }} className={cn('flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition', mode === 'jeonse_to_wolse' ? 'border-wishes-secondary bg-wishes-secondary/10 text-wishes-secondary' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>전세 → 월세</button>
            <button type="button" onClick={() => { setMode('wolse_to_jeonse'); setConvertResult(null); }} className={cn('flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition', mode === 'wolse_to_jeonse' ? 'border-wishes-secondary bg-wishes-secondary/10 text-wishes-secondary' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>월세 → 전세</button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2"><Percent className="w-4 h-4 inline mr-1" />전환율 (연 %)</label>
          <input type="number" inputMode="decimal" step="0.1" value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary" />
          <p className="text-xs text-gray-400 mt-1">일반적으로 4~6% 적용 (현재 시장 금리 참고)</p>
        </div>

        {mode === 'jeonse_to_wolse' ? (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">전세금 (만원)</label>
              <div className="relative">
                <input type="number" inputMode="numeric" value={jeonse} onChange={(e) => setJeonse(e.target.value)} placeholder="예: 20000 (2억)" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-lg" />
                {jeonse && <p className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-wishes-secondary font-medium">{formatWon(parseFloat(jeonse) * 10000)}</p>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">희망 보증금 (만원, 선택)</label>
              <input type="number" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="예: 1000 (1천만원)" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary" />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">보증금 (만원)</label>
              <input type="number" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="예: 1000 (1천만원)" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-lg" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">월세 (만원)</label>
              <input type="number" inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="예: 60" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-lg" />
            </div>
          </>
        )}

        <button onClick={convertCalc} className="w-full bg-wishes-secondary text-white py-4 rounded-xl font-bold text-lg hover:bg-wishes-primary transition-colors">환산하기</button>
      </div>

      {convertResult && (
        <div className="mt-6 bg-white rounded-2xl border border-wishes-secondary/30 p-6 space-y-4">
          <h3 className="text-lg font-bold text-wishes-primary">환산 결과</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">전세 환산금</p>
              <p className="text-xl font-bold text-blue-700">{formatWon(convertResult.jeonse)}</p>
            </div>
            <div className="bg-wishes-secondary/5 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">보증금</p>
              <p className="text-xl font-bold text-wishes-primary">{formatWon(convertResult.deposit)}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">월세</p>
              <p className="text-xl font-bold text-emerald-700">{formatWon(convertResult.monthly)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-yellow-50 rounded-lg p-3 text-xs text-yellow-700">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>전환율 {conversionRate}% 기준 환산 결과입니다. 실제 금액은 임대인과의 협의에 따라 달라질 수 있습니다.</p>
          </div>
        </div>
      )}
    </>
  );
}

function formatWon(amount: number) {
  if (amount >= 100000000) {
    const uk = Math.floor(amount / 100000000);
    const man = Math.floor((amount % 100000000) / 10000);
    return man > 0 ? `${uk}억 ${man.toLocaleString('ko-KR')}만원` : `${uk}억원`;
  }
  if (amount >= 10000) return `${Math.floor(amount / 10000).toLocaleString('ko-KR')}만원`;
  return `${amount.toLocaleString('ko-KR')}원`;
}
