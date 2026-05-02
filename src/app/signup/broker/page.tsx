'use client';

// P3-3 (2026-05-03): 사장님 명령 — 중개업체 가입은 바탕만 만들고 추후 활성화.
//   현재는 "준비 중" 안내 + 사전 등록 안내만. 정식 가입 흐름 (정부 자격검증 / 본인인증)
//   은 홈페이지가 자리 잡은 후 활성화 (I-AUTH-5).

import Link from 'next/link';

export default function BrokerSignupPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      padding: 20,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: 48,
        width: '100%',
        maxWidth: 520,
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏢</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1e3a8a', marginBottom: 12 }}>
          중개업체 가입 준비 중
        </h1>
        <div style={{
          background: '#fef3c7',
          color: '#b45309',
          padding: '10px 16px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 24,
          display: 'inline-block',
        }}>
          정식 오픈 예정
        </div>
        <p style={{ color: '#475569', lineHeight: 1.7, fontSize: 15, marginBottom: 24 }}>
          WISHES 는 외부 공인중개사 / 중개업체의 입점을 준비 중입니다.<br />
          정부 자격 검증 (한국공인중개사협회 / 부동산중개업 등록) 과<br />
          본인 인증 절차를 거친 후 정식 오픈할 예정입니다.
        </p>
        <div style={{
          background: '#f8fafc',
          padding: 20,
          borderRadius: 12,
          textAlign: 'left',
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
            정식 오픈 시 제공 예정
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
            <li>한방 (한국공인중개사협회) 자격 자동 검증</li>
            <li>부동산중개업 등록 정보 자동 매칭 (nsdi.go.kr)</li>
            <li>본인 인증 (PASS / 카카오 / 네이버 인증서)</li>
            <li>매물 등록 / 거래 / 정산 통합 관리</li>
          </ul>
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
          정식 오픈 안내를 받고 싶으시다면<br />
          <a
            href="mailto:wishes@wishes.co.kr?subject=중개업체%20가입%20사전%20등록"
            style={{ color: '#2D5A27', fontWeight: 700, textDecoration: 'underline' }}
          >
            wishes@wishes.co.kr
          </a>
          {' '}로 회사명 / 연락처 보내주세요.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: '#2D5A27',
              color: '#fff',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            홈으로
          </Link>
          <Link
            href="/map"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: '#fff',
              color: '#2D5A27',
              border: '2px solid #2D5A27',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            매물 둘러보기
          </Link>
        </div>
      </div>
    </div>
  );
}
