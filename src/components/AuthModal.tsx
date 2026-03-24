'use client';

import { useState } from 'react';
import { X, Phone, MessageCircle, ArrowRight, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'main' | 'phone-input' | 'phone-verify' | 'name-input' | 'done';

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [step, setStep] = useState<Step>('main');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const formatPhone = (val: string) => {
    const nums = val.replace(/\D/g, '').slice(0, 11);
    if (nums.length <= 3) return nums;
    if (nums.length <= 7) return nums.slice(0,3) + '-' + nums.slice(3);
    return nums.slice(0,3) + '-' + nums.slice(3,7) + '-' + nums.slice(7);
  };

  const handleSendOTP = async () => {
    if (phone.replace(/\D/g, '').length < 10) {
      setError('올바른 휴대폰 번호를 입력해주세요');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // TODO: Supabase Phone Auth OTP 연동
      // const { error } = await supabase.auth.signInWithOtp({ phone: '+82' + phone.replace(/\D/g, '').slice(1) });
      await new Promise(r => setTimeout(r, 1000));
      setStep('phone-verify');
    } catch (e) {
      setError('인증번호 발송에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (code.length !== 6) {
      setError('6자리 인증번호를 입력해주세요');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // TODO: Supabase OTP 검증
      // const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
      await new Promise(r => setTimeout(r, 1000));
      setStep('name-input');
    } catch (e) {
      setError('인증번호가 올바르지 않습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!name.trim()) {
      setError('이름을 입력해주세요');
      return;
    }
    setLoading(true);
    try {
      // TODO: Supabase user metadata 업데이트
      await new Promise(r => setTimeout(r, 500));
      setStep('done');
      setTimeout(() => {
        onClose();
        setStep('main');
        setPhone('');
        setCode('');
        setName('');
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  const handleKakaoLogin = () => {
    // TODO: Supabase Kakao OAuth
    // supabase.auth.signInWithOAuth({ provider: 'kakao' });
    window.open('https://kauth.kakao.com', '_blank');
  };

  const reset = () => {
    setStep('main');
    setPhone('');
    setCode('');
    setName('');
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-2">
          <h2 className="text-lg font-bold text-gray-900">
            {step === 'main' && '\uB85C\uADF8\uC778 / \uD68C\uC6D0\uAC00\uC785'}
            {step === 'phone-input' && '\uD734\uB300\uD3F0 \uC778\uC99D'}
            {step === 'phone-verify' && '\uC778\uC99D\uBC88\uD638 \uC785\uB825'}
            {step === 'name-input' && '\uC774\uB984 \uC785\uB825'}
            {step === 'done' && '\uAC00\uC785 \uC644\uB8CC'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5 pt-3">
          {/* Step: Main */}
          {step === 'main' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">\uAD00\uC2EC \uB9E4\uBB3C \uC800\uC7A5, \uC2E0\uADDC \uB9E4\uBB3C \uC54C\uB9BC \uB4F1\uC744 \uC774\uC6A9\uD558\uC2E4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
              
              {/* Kakao Login */}
              <button
                onClick={handleKakaoLogin}
                className="w-full flex items-center justify-center gap-2 bg-[#FEE500] text-[#191919] py-3.5 rounded-xl font-bold text-sm hover:bg-[#FDD835] transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                \uCE74\uCE74\uC624\uB85C \uC2DC\uC791\uD558\uAE30
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">\uB610\uB294</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Phone Login */}
              <button
                onClick={() => setStep('phone-input')}
                className="w-full flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 py-3.5 rounded-xl font-bold text-sm hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <Phone className="w-5 h-5" />
                \uD734\uB300\uD3F0 \uBC88\uD638\uB85C \uC2DC\uC791\uD558\uAE30
              </button>
            </div>
          )}

          {/* Step: Phone Input */}
          {step === 'phone-input' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">\uD734\uB300\uD3F0 \uBC88\uD638\uB97C \uC785\uB825\uD558\uBA74 \uC778\uC99D\uBC88\uD638\uB97C \uBCF4\uB0B4\uB4DC\uB9BD\uB2C8\uB2E4.</p>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(formatPhone(e.target.value)); setError(''); }}
                placeholder="010-0000-0000"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-lg font-medium focus:border-wishes-secondary focus:outline-none"
                autoFocus
              />
              {error && <p className="text-red-500 text-xs text-center">{error}</p>}
              <button
                onClick={handleSendOTP}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-wishes-primary text-white py-3.5 rounded-xl font-bold text-sm hover:bg-wishes-secondary transition-colors disabled:opacity-50"
              >
                {loading ? '\uBC1C\uC1A1 \uC911...' : '\uC778\uC99D\uBC88\uD638 \uBC1B\uAE30'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
              <button onClick={reset} className="w-full text-sm text-gray-400 hover:text-gray-600">\uB4A4\uB85C\uAC00\uAE30</button>
            </div>
          )}

          {/* Step: Verify OTP */}
          {step === 'phone-verify' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">{phone}\uC73C\uB85C \uBC1C\uC1A1\uB41C 6\uC790\uB9AC \uC778\uC99D\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.</p>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000"
                maxLength={6}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-2xl font-bold tracking-[0.5em] focus:border-wishes-secondary focus:outline-none"
                autoFocus
              />
              {error && <p className="text-red-500 text-xs text-center">{error}</p>}
              <button
                onClick={handleVerifyOTP}
                disabled={loading || code.length !== 6}
                className="w-full flex items-center justify-center gap-2 bg-wishes-primary text-white py-3.5 rounded-xl font-bold text-sm hover:bg-wishes-secondary transition-colors disabled:opacity-50"
              >
                {loading ? '\uD655\uC778 \uC911...' : '\uD655\uC778'}
              </button>
              <button onClick={() => setStep('phone-input')} className="w-full text-sm text-gray-400 hover:text-gray-600">\uBC88\uD638 \uB2E4\uC2DC \uC785\uB825</button>
            </div>
          )}

          {/* Step: Name Input */}
          {step === 'name-input' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">\uB9C8\uC9C0\uB9C9\uC73C\uB85C \uC774\uB984\uB9CC \uC785\uB825\uD574\uC8FC\uC138\uC694.</p>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="\uD64D\uAE38\uB3D9"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-lg font-medium focus:border-wishes-secondary focus:outline-none"
                autoFocus
              />
              {error && <p className="text-red-500 text-xs text-center">{error}</p>}
              <button
                onClick={handleComplete}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-wishes-primary text-white py-3.5 rounded-xl font-bold text-sm hover:bg-wishes-secondary transition-colors disabled:opacity-50"
              >
                {loading ? '\uCC98\uB9AC \uC911...' : '\uC644\uB8CC'}
              </button>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="text-center py-4">
              <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-bold text-gray-900">\uD658\uC601\uD569\uB2C8\uB2E4!</p>
              <p className="text-sm text-gray-500 mt-1">\uD68C\uC6D0\uAC00\uC785\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
