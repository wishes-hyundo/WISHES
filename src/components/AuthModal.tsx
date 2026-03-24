'use client';

import { useState, useEffect } from 'react';
import { X, Phone, User, ArrowLeft, CheckCircle } from 'lucide-react';

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
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (timer > 0) {
      const id = setTimeout(() => setTimer(timer - 1), 1000);
      return () => clearTimeout(id);
    }
  }, [timer]);

  useEffect(() => {
    if (!isOpen) {
      setStep('main');
      setPhone('');
      setCode('');
      setName('');
      setLoading(false);
      setTimer(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatPhone = (val: string) => {
    const nums = val.replace(/\D/g, '').slice(0, 11);
    if (nums.length <= 3) return nums;
    if (nums.length <= 7) return nums.slice(0, 3) + '-' + nums.slice(3);
    return nums.slice(0, 3) + '-' + nums.slice(3, 7) + '-' + nums.slice(7);
  };

  const handleSendCode = async () => {
    if (phone.replace(/-/g, '').length < 10) return;
    setLoading(true);
    // TODO: Supabase Phone OTP
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);
    setTimer(180);
    setStep('phone-verify');
  };

  const handleVerifyCode = async () => {
    if (code.length < 6) return;
    setLoading(true);
    // TODO: Supabase OTP verify
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);
    setStep('name-input');
  };

  const handleCompleteName = async () => {
    if (!name.trim()) return;
    setLoading(true);
    // TODO: Save user profile
    await new Promise(r => setTimeout(r, 500));
    setLoading(false);
    setStep('done');
  };

  const handleKakaoLogin = () => {
    // TODO: Supabase Kakao OAuth
    alert('Kakao login coming soon');
  };

  const timerText = timer > 0 ? Math.floor(timer / 60) + ':' + String(timer % 60).padStart(2, '0') : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          {step !== 'main' && step !== 'done' ? (
            <button onClick={() => setStep(step === 'phone-verify' ? 'phone-input' : step === 'name-input' ? 'phone-verify' : 'main')} className="p-1 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
          ) : <div className="w-7" />}
          <h2 className="text-lg font-bold text-gray-900">
            {step === 'main' && '간편 로그인'}
            {step === 'phone-input' && '휴대폰 인증'}
            {step === 'phone-verify' && '인증번호 입력'}
            {step === 'name-input' && '이름 입력'}
            {step === 'done' && '가입 완료'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {/* Main step */}
          {step === 'main' && (
            <div className="space-y-3">
              <button
                onClick={handleKakaoLogin}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors"
                style={{ backgroundColor: '#FEE500', color: '#191919' }}
              >
                카카오톡으로 시작하기
              </button>

              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">또는</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <button
                onClick={() => setStep('phone-input')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-wishes-primary text-white hover:bg-wishes-secondary transition-colors"
              >
                <Phone className="w-4 h-4" />
                휴대폰 번호로 시작하기
              </button>

              <p className="text-xs text-center text-gray-400 mt-4">
                가입 시 서비스 이용약관에 동의하게 됩니다
              </p>
            </div>
          )}

          {/* Phone input step */}
          {step === 'phone-input' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">본인 확인을 위해 휴대폰 번호를 입력해주세요</p>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                autoFocus
              />
              <button
                onClick={handleSendCode}
                disabled={loading || phone.replace(/-/g, '').length < 10}
                className="w-full py-3 rounded-xl font-bold text-sm bg-wishes-primary text-white hover:bg-wishes-secondary transition-colors disabled:opacity-50"
              >
                {loading ? '전송 중...' : '인증번호 받기'}
              </button>
            </div>
          )}

          {/* Phone verify step */}
          {step === 'phone-verify' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{phone}</span>으로 전송된 인증번호를 입력해주세요
              </p>
              <div className="relative">
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                  autoFocus
                />
                {timerText && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-red-500 font-medium">{timerText}</span>
                )}
              </div>
              <button
                onClick={handleVerifyCode}
                disabled={loading || code.length < 6}
                className="w-full py-3 rounded-xl font-bold text-sm bg-wishes-primary text-white hover:bg-wishes-secondary transition-colors disabled:opacity-50"
              >
                {loading ? '확인 중...' : '확인'}
              </button>
              <button
                onClick={() => { setCode(''); handleSendCode(); }}
                disabled={timer > 150}
                className="w-full text-sm text-gray-500 hover:text-wishes-secondary disabled:opacity-30"
              >
                인증번호 재전송
              </button>
            </div>
          )}

          {/* Name input step */}
          {step === 'name-input' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">마지막으로 이름을 입력해주세요</p>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="홍길동"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-lg focus:outline-none focus:ring-2 focus:ring-wishes-secondary/30 focus:border-wishes-secondary"
                autoFocus
              />
              <button
                onClick={handleCompleteName}
                disabled={loading || !name.trim()}
                className="w-full py-3 rounded-xl font-bold text-sm bg-wishes-primary text-white hover:bg-wishes-secondary transition-colors disabled:opacity-50"
              >
                {loading ? '처리 중...' : '완료'}
              </button>
            </div>
          )}

          {/* Done step */}
          {step === 'done' && (
            <div className="text-center py-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">환영합니다!</h3>
              <p className="text-sm text-gray-600 mb-6">회원가입이 완료되었습니다</p>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-bold text-sm bg-wishes-primary text-white hover:bg-wishes-secondary transition-colors"
              >
                시작하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
