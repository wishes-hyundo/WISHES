'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    phone: '',
    company: '',
    reason: '',
  });
  // Phase 1 (2026-04-28): PIPA / 정보통신망법 동의 (약관·개인정보 필수, 마케팅 옵션)
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedMarketing, setAcceptedMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const update = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    // Phase 1 (2026-04-28): 약관·개인정보 동의 필수
    if (!acceptedTerms) {
      setError('이용약관에 동의해주세요.');
      return;
    }
    if (!acceptedPrivacy) {
      setError('개인정보 처리방침에 동의해주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email.toLowerCase(),
          password: form.password,
          phone: form.phone,
          company: form.company,
          reason: form.reason,
          requestedRole: 'broker',
          acceptedTerms,
          acceptedPrivacy,
          acceptedMarketing,
          termsVersion: 'v2026-04-28',
          privacyVersion: 'v2026-04-28',
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.message || '회원가입에 실패했습니다.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch {
      setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 480, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✓</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, color: '#2D5A27' }}>가입 신청이 완료되었습니다</h2>
          <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 24 }}>
            관리자의 승인을 기다려주세요.<br />
            승인이 완료되면 이메일로 안내드립니다.
          </p>
          <button
            onClick={() => router.push('/login')}
            style={{ padding: '12px 28px', background: '#2D5A27', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            로그인 페이지로
          </button>
        </div>
      </div>
    );
  }

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 480, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: '#2D5A27' }}>WISHES 중개사 회원가입</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: 12, fontSize: 13 }}>
          중개사 전용 가입 — 관리자 승인 후 매물 등록·관리 가능
        </p>
        <div style={{ textAlign: 'center', marginBottom: 24, padding: '10px 12px', background: '#f0f7ee', borderRadius: 8, fontSize: 13, color: '#2D5A27', border: '1px solid #d4e8d0' }}>
          일반 회원이신가요? <a href="/" style={{ color: '#2D5A27', fontWeight: 700, textDecoration: 'underline' }}>홈에서 간편 가입</a> (카카오·네이버·Google) 을 이용해주세요.
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>이름 *</label>
            <input type="text" required autoComplete="name" value={form.name} onChange={(e) => update('name', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>이메일 *</label>
            <input type="email" required autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>비밀번호 * (8자 이상)</label>
            <input type="password" required autoComplete="new-password" value={form.password} onChange={(e) => update('password', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>비밀번호 확인 *</label>
            <input type="password" required autoComplete="new-password" value={form.passwordConfirm} onChange={(e) => update('passwordConfirm', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>연락처</label>
            <input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="010-0000-0000" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>소속 (회사/중개사무소)</label>
            <input type="text" autoComplete="organization" value={form.company} onChange={(e) => update('company', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>가입 사유 (선택)</label>
            <textarea value={form.reason} onChange={(e) => update('reason', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>

          {/* Phase 1 (2026-04-28) PIPA / 정보통신망법 동의 */}
          <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 10 }}>약관 동의</div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#444', marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                <strong>이용약관</strong> 동의 (필수){' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#2D5A27', textDecoration: 'underline' }}>보기</Link>
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#444', marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                <strong>개인정보 처리방침</strong> 동의 (필수){' '}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#2D5A27', textDecoration: 'underline' }}>보기</Link>
                <br /><span style={{ fontSize: 11, color: '#888' }}>거래 종료 후 3년 보관 후 자동 삭제 (PIPA)</span>
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#444', cursor: 'pointer' }}>
              <input type="checkbox" checked={acceptedMarketing} onChange={(e) => setAcceptedMarketing(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                <strong>마케팅 정보 수신</strong> 동의 (선택){' '}
                <span style={{ fontSize: 11, color: '#888' }}>이메일/카카오 알림톡, 월 2회 이내</span>
              </span>
            </label>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '13px', background: loading ? '#94a3b8' : '#2D5A27', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? '가입 신청 중...' : '가입 신청'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#666' }}>
          이미 계정이 있으신가요?{' '}
          <Link href="/login" style={{ color: '#2D5A27', fontWeight: 600, textDecoration: 'none' }}>로그인</Link>
        </div>
      </div>
    </div>
  );
}
