'use client';

export const dynamic = 'force-static';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('올바른 이메일 형식을 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase() }),
      });
      // 서버는 이메일 존재 여부와 무관하게 항상 success:true 반환 (enumeration 방지).
      if (res.ok) {
        setSent(true);
      } else if (res.status === 429) {
        setError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError('요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch {
      setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📧</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, color: '#2D5A27' }}>이메일을 확인해 주세요</h2>
          <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 8 }}>
            <strong style={{ color: '#333' }}>{email}</strong> 으로
          </p>
          <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 24 }}>
            비밀번호 재설정 링크를 보내드렸어요.<br />
            메일함(스팸함 포함)을 확인해 주세요.
          </p>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 24 }}>
            ※ 가입되지 않은 이메일도 보안상 동일한 안내가 표시됩니다.
          </div>
          <Link href="/login" style={{ display: 'inline-block', padding: '12px 28px', background: '#2D5A27', color: '#fff', borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
            로그인 페이지로
          </Link>
        </div>
      </div>
    );
  }

  const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: '#2D5A27' }}>비밀번호 찾기</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: 30, fontSize: 13, lineHeight: 1.6 }}>
          가입하신 이메일을 입력하시면<br />재설정 링크를 보내드려요.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#333' }}>이메일</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '13px', background: loading ? '#94a3b8' : '#2D5A27', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? '전송 중...' : '재설정 링크 받기'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#666' }}>
          <Link href="/login" style={{ color: '#2D5A27', fontWeight: 600, textDecoration: 'none' }}>로그인으로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}
