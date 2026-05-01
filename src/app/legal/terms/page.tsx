'use client';

// L-sec170 (2026-05-02, PR-S7): react/no-unescaped-entities ESLint 위반 fix.
//   본문 텍스트의 영문 큰따옴표("…") 를 한국어 인용부호「…」으로 변경.
//   JSX 속성 값의 따옴표(className="…")는 그대로 — ESLint 가 잡지 않음.

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">이용약관</h1>

        <div className="prose prose-lg max-w-none text-gray-700 space-y-6">
          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제1조 목적</h2>
            <p>이 약관은 WISHES 부동산 회사(이하 「회사」)가 제공하는 모든 인터넷 서비스(이하 「서비스」)의 이용에 있어 회사와 이용자의 권리ㆍ의무 및 책임사항을 규정함을 목적으로 합니다.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제2조 정의</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>「이용자」라 함은 본 약관에 동의하고 서비스를 이용하는 자를 의미합니다.</li>
              <li>「서비스」라 함은 회사가 제공하는 모든 온라인 및 모바일 부동산 거래 관련 서비스입니다.</li>
              <li>「계정」이라 함은 이용자가 회사에 개인정보를 제공하여 생성한 식별 정보입니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제3조 약관의 명시 및 개정</h2>
            <p>회사는 이 약관의 내용을 이용자가 쉽게 알 수 있도록 서비스 초기 화면에 게시합니다. 회사는 필요한 경우 관련 법률에 위배하지 않는 한도 내에서 이 약관을 개정할 수 있으며, 개정 내용을 계정 로그인 시 공지합니다.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제4조 이용신청 및 회원등록</h2>
            <p>이용자는 회사가 정한 양식에 따라 회원등록을 신청하며, 회사는 신청자가 제시하는 정보가 정확하고 완전하다고 가정하고 회원등록을 승인합니다. 다만 회사는 다음 경우에 회원등록을 거절하거나 보류할 수 있습니다:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>회원등록 신청자가 이전에 부정한 거래로 계정이 차단된 자</li>
              <li>타인의 정보를 이용하여 신청한 경우</li>
              <li>기타 회사가 합리적인 판단에 의해 부적절하다고 판단하는 경우</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제5조 비밀번호 관리</h2>
            <p>이용자는 자신의 계정과 비밀번호를 관리할 책임이 있으며, 제3자에게 이를 양도하거나 대여할 수 없습니다. 회사는 이용자의 비밀번호 관리 부주의로 인한 손해에 대해 책임을 지지 않습니다.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제6조 서비스 이용료</h2>
            <p>WISHES 부동산 서비스는 기본적으로 무료입니다. 다만 특정 프리미엄 기능이나 광고 서비스에 대해서는 별도의 요금이 부과될 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제7조 금지사항</h2>
            <p>이용자는 다음 행위를 금지합니다:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>불법적인 콘텐츠의 업로드 또는 공유</li>
              <li>타인의 개인정보 무단 수집 및 이용</li>
              <li>서비스의 무단 복제, 수정, 배포</li>
              <li>악성 소프트웨어 배포</li>
              <li>서비스 장애를 유발하는 행위</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제8조 책임제한</h2>
            <p>회사는 천재지변, 전쟁, 테러, 시스템 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다. 다만 회사의 고의적 과실로 인한 직접적 손해에 대해서는 법률에서 정한 범위 내에서 배상합니다.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제9조 약관 동의 및 수용</h2>
            <p>이용자는 본 약관에 동의함으로써 서비스 이용을 시작합니다. 약관의 일부에 동의하지 않는 경우 서비스 이용을 할 수 없습니다.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">제10조 준거법</h2>
            <p>본 약관은 대한민국 법률에 따라 해석되며, 서비스 이용으로 인한 분쟁은 대한민국 법원의 관할을 따릅니다.</p>
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
