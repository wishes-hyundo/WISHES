'use client';

import { useState, useEffect, useRef } from 'react';
import { Calculator, Percent, Info, ArrowLeftRight, RefreshCw, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type CalcTab = 'loan' | 'convert';

interface RatePreset {
  label: string;
  rate: number;
  description: string;
}

interface ScheduleRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

// ── 기본 금리 프리셋 (ECOS API 실패 시 폴백) ──
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

// ── 대출 기간 옵션 ──
const LOAN_TERM_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40];

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
        {/* 탭 */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('loan')}
            className={cn(
              'flex-1 py-3 rounded-xl text-sm font-bold transition-all',
              activeTab === 'loan'
                ? 'bg-wishes-primary text-white shadow-lg'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-wishes-secondary/30'
            )}
          >
            <Calculator className="w-4 h-4 inline mr-1.5" />
            대출 계산기
          </button>
          <button
            onClick={() => setActiveTab('convert')}
            className={cn(
              'flex-1 py-3 rounded-xl text-sm font-bold transition-all',
              activeTab === 'convert'
                ? 'bg-wishes-primary text-white shadow-lg'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-wishes-secondary/30'
            )}
          >
            <ArrowLeftRight className="w-4 h-4 inline mr-1.5" />
            전세↔월세 환산
          </button>
        </div>

        {activeTab === 'loan' ? <LoanCalculator /> : <ConvertCalculator />}
      </div>
    </div>
  );
}

// ── 대출 계산기 ──
function LoanCalculator() {
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('3.5');
  const [loanTerm, setLoanTerm] = useState('30');
  const [repaymentType, setRepaymentType] = useState<'equal' | 'equalPrincipal'>('equal');
  const [result, setResult] = useState<{
    monthlyPayment: number;
    totalPayment: number;
    totalInterest: number;
    schedule: ScheduleRow[];
  } | null>(null);

  // 상환 스케줄 접기/펼치기
  const [showSchedule, setShowSchedule] = useState(false);

  // 금리 프리셋 상태
  const [mortgagePresets, setMortgagePresets] = useState<RatePreset[]>(DEFAULT_MORTGAGE_PRESETS);
  const [jeonsePresets, setJeonsePresets] = useState<RatePreset[]>(DEFAULT_JEONSE_PRESETS);
  const [ratesLastUpdated, setRatesLastUpdated] = useState<string>('');
  const [ratesSource, setRatesSource] = useState<string>('');
  const [presetType, setPresetType] = useState<'mortgage' | 'jeonse'>('mortgage');

  // 결과 영역 ref (자동 스크롤용)
  const resultRef = useRef<HTMLDivElement>(null);

  // DB에서 최신 금리 자동 로드
  useEffect(() => {
    // L-leak5: unmount 시 in-flight /api/rates fetch 취소.
    const ac = new AbortController();
    async function loadRates() {
      try {
        const res = await fetch('/api/rates', { signal: ac.signal });
        if (ac.signal.aborted) return;
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        if (ac.signal.aborted) return;

        if (data.success && data.mortgage_rates && data.jeonse_rates) {
          setMortgagePresets(data.mortgage_rates);
          setJeonsePresets(data.jeonse_rates);
          setRatesSource(data.source || 'DB');

          if (data.updated_at) {
            const date = new Date(data.updated_at);
            setRatesLastUpdated(date.toLocaleDateString('ko-KR', {
              year: 'numeric', month: 'long', day: 'numeric'
            }));
          }
        }
      } catch (err: any) {
        if (ac.signal.aborted || err?.name === 'AbortError') return;
        // DB 실패 시 기본 프리셋 사용
        setRatesLastUpdated(new Date().toLocaleDateString('ko-KR'));
        setRatesSource('기본값');
      }
    }
    loadRates();
    return () => ac.abort();
  }, []);

  const calculate = () => {
    const principal = parseFloat(loanAmount) * 10000;
    const monthlyRate = parseFloat(interestRate) / 100 / 12;
    const months = parseInt(loanTerm) * 12;

    if (!principal || !monthlyRate || !months) return;

    const schedule: ScheduleRow[] = [];
    let balance = principal;

    if (repaymentType === 'equal') {
      const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
      const totalPayment = monthlyPayment * months;
      const totalInterest = totalPayment - principal;

      // 상환 스케줄 생성
      for (let i = 1; i <= months; i++) {
        const interest = balance * monthlyRate;
        const principalPart = monthlyPayment - interest;
        balance -= principalPart;
        schedule.push({
          month: i,
          payment: Math.round(monthlyPayment),
          principal: Math.round(principalPart),
          interest: Math.round(interest),
          balance: Math.max(0, Math.round(balance)),
        });
      }

      setResult({ monthlyPayment: Math.round(monthlyPayment), totalPayment: Math.round(totalPayment), totalInterest: Math.round(totalInterest), schedule });
    } else {
      const principalPerMonth = principal / months;
      let totalInterest = 0;
      const payments: number[] = [];

      for (let i = 0; i < months; i++) {
        const interest = (principal - principalPerMonth * i) * monthlyRate;
        totalInterest += interest;
        const payment = principalPerMonth + interest;
        payments.push(payment);
        balance -= principalPerMonth;
        schedule.push({
          month: i + 1,
          payment: Math.round(payment),
          principal: Math.round(principalPerMonth),
          interest: Math.round(interest),
          balance: Math.max(0, Math.round(balance)),
        });
      }

      const firstMonthPayment = payments[0];
      setResult({ monthlyPayment: Math.round(firstMonthPayment), totalPayment: Math.round(principal + totalInterest), totalInterest: Math.round(totalInterest), schedule });
    }

    setShowSchedule(false);

    // 계산 완료 후 결과 영역으로 자동 스크롤
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const currentPresets = presetType === 'mortgage' ? mortgagePresets : jeonsePresets;

  // 대출 기간 슬라이더 인덱스
  const termIndex = LOAN_TERM_OPTIONS.indexOf(parseInt(loanTerm));
  const handleTermSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLoanTerm(String(LOAN_TERM_OPTIONS[parseInt(e.target.value)]));
  };

  return (
    <>
      {/* 금리 출처 안내 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-2">
          <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 space-y-1">
            <p className="font-semibold">금리 출처 안내 (자동 업데이트)</p>
            <p>기준금리 · 주택담보대출: 한국은행 ECOS (경제통계시스템)</p>
            <p>보금자리론 · 디딤돌: 한국주택금융공사 / 주택도시기금</p>
            <p>전세대출: 전국은행연행회 소비자포털 참고</p>
            {ratesLastUpdated && (
              <p className="text-blue-500">최종 업데이트: {ratesLastUpdated} ({ratesSource})</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
        {/* 금리 프리셋 — 모바일 1열, 태블릿+ 2열 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">빠른 금리 선택</label>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setPresetType('mortgage')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                presetType === 'mortgage'
                  ? 'bg-wishes-primary text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              주택담보대출
            </button>
            <button
              type="button"
              onClick={() => setPresetType('jeonse')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                presetType === 'jeonse'
                  ? 'bg-wishes-primary text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              전세대출
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {currentPresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setInterestRate(String(preset.rate))}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all hover:shadow-sm',
                  parseFloat(interestRate) === preset.rate
                    ? 'border-wishes-secondary bg-wishes-secondary/5'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">{preset.label}</p>
                  <p className="text-lg font-bold text-wishes-secondary">{preset.rate}%</p>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">대출 금액 (만원)</label>
          <div className="relative">
            <input
              type="number"
              inputMode="numeric"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <Percent className="w-4 h-4 inline mr-1" />
              연 이자율 (%)
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              대출 기간: <span className="text-wishes-secondary">{loanTerm}년</span>
            </label>
            <div className="px-1 pt-2 pb-1">
              <input
                type="range"
                min="0"
                max={LOAN_TERM_OPTIONS.length - 1}
                value={termIndex >= 0 ? termIndex : 5}
                onChange={handleTermSlider}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-wishes-secondary"
              />
              <div className="flex justify-between mt-1.5">
                {LOAN_TERM_OPTIONS.map(y => (
                  <span
                    key={y}
                    className={cn(
                      'text-[10px]',
                      parseInt(loanTerm) === y ? 'text-wishes-secondary font-bold' : 'text-gray-500'
                    )}
                  >
                    {y}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

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

        <button
          onClick={calculate}
          className="w-full bg-wishes-secondary text-white py-4 rounded-xl font-bold text-lg hover:bg-wishes-primary transition-colors"
        >
          계산하기
        </button>
      </div>

      {/* ── 계산 결과 ── */}
      {result && (
        <div ref={resultRef} className="mt-6 space-y-4">
          {/* 요약 카드 */}
          <div className="bg-white rounded-2xl border border-wishes-secondary/30 p-6 space-y-4">
            <h2 className="text-lg font-bold text-wishes-primary">계산 결과</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-wishes-secondary/5 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">월 상환액</p>
                <p className="text-xl font-bold text-wishes-primary">{formatWonDetailed(result.monthlyPayment)}</p>
                {repaymentType === 'equalPrincipal' && (
                  <p className="text-[10px] text-gray-500 mt-1">(첫 달 기준, 매월 감소)</p>
                )}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">총 상환액</p>
                <p className="text-xl font-bold text-gray-800">{formatWonDetailed(result.totalPayment)}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">총 이자</p>
                <p className="text-xl font-bold text-red-600">{formatWonDetailed(result.totalInterest)}</p>
              </div>
            </div>

            {/* 이자 비율 바 */}
            <div className="mt-2">
              <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                <span>원금 {formatWon(result.totalPayment - result.totalInterest)}</span>
                <span>이자 {formatWon(result.totalInterest)} ({((result.totalInterest / result.totalPayment) * 100).toFixed(1)}%)</span>
              </div>
              <div className="w-full h-3 bg-red-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-wishes-secondary rounded-full transition-all duration-500"
                  style={{ width: `${((result.totalPayment - result.totalInterest) / result.totalPayment) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 bg-yellow-50 rounded-lg p-3 text-xs text-yellow-700">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p>본 계산 결과는 참고용이며, 실제 대출 조건은 금융기관에 따라 달라질 수 있습니다. 정확한 상담은 WISHES에 문의해주세요.</p>
            </div>
          </div>

          {/* ── 상환 스케줄 테이블 ── */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-wishes-secondary" />
                <span className="text-sm font-semibold text-gray-700">월별 상환 스케줄</span>
                <span className="text-xs text-gray-500">({result.schedule.length}개월)</span>
              </div>
              {showSchedule ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>

            {showSchedule && (
              <div className="border-t border-gray-200">
                {/* 연도별 요약 */}
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 mb-2">연도별 요약</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {getYearlySummary(result.schedule).map((yr) => (
                      <div key={yr.year} className="bg-white rounded-lg p-2 text-center border border-gray-100">
                        <p className="text-[10px] text-gray-500">{yr.year}년차</p>
                        <p className="text-xs font-bold text-gray-700">{formatWon(yr.totalPayment)}</p>
                        <p className="text-[10px] text-red-400">이자 {formatWon(yr.totalInterest)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 월별 테이블 (처음 12개월 + 더보기) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">회차</th>
                        <th className="px-4 py-2 text-right font-medium">월 상환액</th>
                        <th className="px-4 py-2 text-right font-medium">원금</th>
                        <th className="px-4 py-2 text-right font-medium">이자</th>
                        <th className="px-4 py-2 text-right font-medium">잔액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.schedule.slice(0, 24).map((row) => (
                        <tr key={row.month} className={cn(
                          'hover:bg-gray-50 transition',
                          row.month % 12 === 1 ? 'bg-wishes-secondary/3' : ''
                        )}>
                          <td className="px-4 py-2 text-gray-600">
                            {row.month}
                            {row.month % 12 === 1 && (
                              <span className="ml-1 text-[10px] text-wishes-secondary font-medium">
                                ({Math.ceil(row.month / 12)}년차)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-gray-800">{formatWonCompact(row.payment)}</td>
                          <td className="px-4 py-2 text-right text-wishes-secondary">{formatWonCompact(row.principal)}</td>
                          <td className="px-4 py-2 text-right text-red-500">{formatWonCompact(row.interest)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{formatWon(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.schedule.length > 24 && (
                    <div className="px-6 py-3 text-center bg-gray-50 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        처음 24개월 표시 중 · 전체 {result.schedule.length}개월
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── 전세↔월세 환산기 ──
function ConvertCalculator() {
  const [mode, setMode] = useState<'jeonse_to_wolse' | 'wolse_to_jeonse'>('jeonse_to_wolse');
  const [jeonse, setJeonse] = useState('');
  const [deposit, setDeposit] = useState('');
  const [monthly, setMonthly] = useState('');
  const [conversionRate, setConversionRate] = useState('5.0');
  const [convertResult, setConvertResult] = useState<{ deposit: number; monthly: number; jeonse: number } | null>(null);

  // 결과 영역 ref (자동 스크롤용)
  const convertResultRef = useRef<HTMLDivElement>(null);

  const convertCalc = () => {
    const rate = parseFloat(conversionRate) / 100;
    if (!rate) return;

    if (mode === 'jeonse_to_wolse') {
      const jeonseAmount = parseFloat(jeonse);
      const depositAmount = parseFloat(deposit) || 0;
      if (!jeonseAmount) return;

      const diff = (jeonseAmount - depositAmount) * 10000;
      const monthlyRent = Math.round((diff * rate) / 12);

      setConvertResult({
        jeonse: jeonseAmount * 10000,
        deposit: depositAmount * 10000,
        monthly: monthlyRent,
      });
    } else {
      const depositAmount = parseFloat(deposit) || 0;
      const monthlyAmount = parseFloat(monthly) || 0;
      if (!monthlyAmount) return;

      const jeonseEquiv = depositAmount * 10000 + (monthlyAmount * 10000 * 12) / rate;

      setConvertResult({
        jeonse: Math.round(jeonseEquiv),
        deposit: depositAmount * 10000,
        monthly: monthlyAmount * 10000,
      });
    }

    // 결과 영역으로 자동 스크롤
    setTimeout(() => {
      convertResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">환산 방향</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setMode('jeonse_to_wolse'); setConvertResult(null); }}
              className={cn(
                'flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition',
                mode === 'jeonse_to_wolse'
                  ? 'border-wishes-secondary bg-wishes-secondary/10 text-wishes-secondary'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              )}
            >
              전세 → 월세
            </button>
            <button
              type="button"
              onClick={() => { setMode('wolse_to_jeonse'); setConvertResult(null); }}
              className={cn(
                'flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition',
                mode === 'wolse_to_jeonse'
                  ? 'border-wishes-secondary bg-wishes-secondary/10 text-wishes-secondary'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              )}
            >
              월세 → 전세
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            <Percent className="w-4 h-4 inline mr-1" />
            전환율 (연 %)
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={conversionRate}
            onChange={(e) => setConversionRate(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary"
          />
          <p className="text-xs text-gray-500 mt-1">일반적으로 4~6% 적용 (현재 시장 금리 참고)</p>
        </div>

        {mode === 'jeonse_to_wolse' ? (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">전세금 (만원)</label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  value={jeonse}
                  onChange={(e) => setJeonse(e.target.value)}
                  placeholder="예: 20000 (2억)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-lg"
                />
                {jeonse && (
                  <p className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-wishes-secondary font-medium">
                    {formatWon(parseFloat(jeonse) * 10000)}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">희망 보증금 (만원, 선택)</label>
              <input
                type="number"
                inputMode="numeric"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="예: 1000 (1천만원)"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">보증금 (만원)</label>
              <input
                type="number"
                inputMode="numeric"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="예: 1000 (1천만원)"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">월세 (만원)</label>
              <input
                type="number"
                inputMode="numeric"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                placeholder="예: 60"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-wishes-secondary text-lg"
              />
            </div>
          </>
        )}

        <button
          onClick={convertCalc}
          className="w-full bg-wishes-secondary text-white py-4 rounded-xl font-bold text-lg hover:bg-wishes-primary transition-colors"
        >
          환산하기
        </button>
      </div>

      {convertResult && (
        <div ref={convertResultRef} className="mt-6 bg-white rounded-2xl border border-wishes-secondary/30 p-6 space-y-4">
          <h2 className="text-lg font-bold text-wishes-primary">환산 결과</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">전세 환산금</p>
              <p className="text-xl font-bold text-blue-700">{formatWonDetailed(convertResult.jeonse)}</p>
            </div>
            <div className="bg-wishes-secondary/5 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">보증금</p>
              <p className="text-xl font-bold text-wishes-primary">{formatWonDetailed(convertResult.deposit)}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">월세</p>
              <p className="text-xl font-bold text-emerald-700">{formatWonDetailed(convertResult.monthly)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 bg-yellow-50 rounded-lg p-3 text-xs text-yellow-700">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              전환율 {conversionRate}% 기준 환산 결과입니다.
              실제 금액은 임대인과의 협의에 따라 달라질 수 있습니다.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ── 공통 유틸 ──

/** 간략 표시 (기존 방식) — 입력 필드 등에서 사용 */
function formatWon(amount: number) {
  if (amount >= 100000000) {
    const uk = Math.floor(amount / 100000000);
    const man = Math.floor((amount % 100000000) / 10000);
    return man > 0 ? `${uk}억 ${man.toLocaleString('ko-KR')}만원` : `${uk}억원`;
  }
  if (amount >= 10000) {
    return `${Math.floor(amount / 10000).toLocaleString('ko-KR')}만원`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** 정밀 표시 — 결과 카드에서 사용 (약 X만 Y원 형태) */
function formatWonDetailed(amount: number) {
  if (amount >= 100000000) {
    const uk = Math.floor(amount / 100000000);
    const remainder = amount % 100000000;
    const man = Math.floor(remainder / 10000);
    const won = remainder % 10000;
    if (man > 0 && won > 0) {
      return `약 ${uk}억 ${man.toLocaleString('ko-KR')}만 ${won.toLocaleString('ko-KR')}원`;
    }
    if (man > 0) {
      return `약 ${uk}억 ${man.toLocaleString('ko-KR')}만원`;
    }
    return `${uk}억원`;
  }
  if (amount >= 10000) {
    const man = Math.floor(amount / 10000);
    const won = amount % 10000;
    if (won > 0) {
      return `약 ${man.toLocaleString('ko-KR')}만 ${won.toLocaleString('ko-KR')}원`;
    }
    return `${man.toLocaleString('ko-KR')}만원`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** 테이블 컴팩트 표시 */
function formatWonCompact(amount: number) {
  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(1)}만`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** 연도별 요약 생성 */
function getYearlySummary(schedule: ScheduleRow[]) {
  const years: { year: number; totalPayment: number; totalInterest: number; totalPrincipal: number }[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const yearRows = schedule.slice(i, i + 12);
    years.push({
      year: Math.floor(i / 12) + 1,
      totalPayment: yearRows.reduce((sum, r) => sum + r.payment, 0),
      totalInterest: yearRows.reduce((sum, r) => sum + r.interest, 0),
      totalPrincipal: yearRows.reduce((sum, r) => sum + r.principal, 0),
    });
  }
  // 처음 5년 + 마지막 연도
  if (years.length <= 6) return years;
  return [...years.slice(0, 5), years[years.length - 1]];
}
