'use client';

// L-sec170 (2026-05-02, PR-S7): react/no-unescaped-entities ESLint 위반 fix.
//   본문 텍스트의 영문 큰따옴표를 한국어 인용부호「」로 변경.

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">개인정보 처리방침</h1>

        <div className="prose prose-lg max-w-none text-gray-700 space-y-6">
          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">1. 개인정보의 수집 및 이용목적</h2>
            <p>WISHES 부동산(이하 「회사」)은 다음과 같은 목적으로 개인정보를 수집하고 이용합니다:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>회원 가입 및 관리</li>
              <li>부동산 거래 중개 및 상담 제공</li>
              <li>부동산 정보 제공 및 맞춤형 추천</li>
              <li>고객 서비스 및 불만 처리</li>
              <li>마케팅 및 광고 (동의한 경우)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">2. 수집하는 개인정보의 항목</h2>
            <p>회사가 수집하는 개인정보는 다음과 같습니다:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>필수 항목:</strong> 이메일, 비밀번호, 이름, 연락처(전화번호)</li>
              <li><strong>선택 항목:</strong> 회사명, 직위, 프로필 사진, 관심 지역</li>
              <li><strong>자동 수집:</strong> 접속 기록, IP 주소, 쿠키, 기기 정보</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">3. 개인정보의 보유 및 이용 기간</h2>
            <p>회사는 다음과 같이 개인정보를 보유합니다:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>회원 가입 정보:</strong> 탈퇴 시까지</li>
              <li><strong>거래 기록:</strong> 5년 (법적 의무 보유)</li>
              <li><strong>마케팅 수신 동의:</strong> 철회 시까지</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">4. 개인정보의 제3자 제공</h2>
            <p>회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 다음의 경우는 예외입니다:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>이용자의 명시적 동의가 있는 경우</li>
              <li>법령에서 정한 경우</li>
              <li>거래 목적을 위해 필요한 범위 내</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">5. 개인정보 처리 위탁</h2>
            <p>회사는 더 나은 서비스 제공을 위해 다음 업체에 개인정보 처리를 위탁할 수 있습니다:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>호스팅 서비스: Supabase</li>
              <li>결제 서비스: 관련 결제사</li>
              <li>이메일 서비스: Resend</li>
              <li>지도 서비스: Kakao Maps</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">6. 개인정보의 안전성 확보</h2>
            <p>회사는 다음과 같은 기술적, 관리적 조치를 취하여 개인정보의 안전성을 확보합니다:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>암호화를 통한 통신 보안 (SSL/TLS)</li>
              <li>접근 제어 및 권한 관리</li>
              <li>정기적인 보안 점검</li>
              <li>직원 보안 교육</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">7. 이용자의 권리</h2>
            <p>이용자는 다음의 권리를 가집니다:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>개인정보 열람 및 수정 요청</li>
              <li>개인정보 삭제 요청 (회원 탈퇴)</li>
              <li>개인정보 처리 정지 요청</li>
              <li>마케팅 수신 거부</li>
            </ul>
            <p className="mt-4">이러한 권리는 이용자 계정 설정에서 직접 행사할 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">8. 쿠키 및 추적 기술</h2>
            <p>회사는 사용자 경험 개선을 위해 쿠키, 로컬스토리지 등의 기술을 사용합니다. 이용자는 브라우저 설정을 통해 쿠키 사용을 제한할 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">9. 개인정보 유출 시 대응</h2>
            <p>개인정보 유출이 발생한 경우, 회사는 즉시 이를 확인하고 피해를 최소화하기 위한 조치를 취합니다. 이용자에게 유출 사실을 통지하고 필요한 지원을 제공합니다.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">10. 개인정보 보호담당자</h2>
            <p>개인정보 보호 관련 문의는 다음 담당자에게 연락주시기 바랍니다:</p>
            <div className="bg-gray-50 p-4 rounded-lg mt-2">
              <p><strong>개인정보 보호담당자</strong></p>
              <p className="text-sm text-gray-600 mt-1">이메일: wishes@wishes.co.kr</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">11. 준거법</h2>
            <p>본 방침은 대한민국의 개인정보보호법(PIPA) 및 관련 법령을 준수하여 작성되었습니다.</p>
          </section>

          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              최종 수정일: {new Date().getFullYear()}년 {String(new Date().getMonth() + 1).padStart(2, '0')}월 {String(new Date().getDate()).padStart(2, '0')}일
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
