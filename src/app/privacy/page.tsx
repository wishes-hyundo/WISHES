import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 | 위시스부동산',
  description: '위시스부동산중개법인 개인정보처리방침',
};

export default function PrivacyPage() {
  return (
    <main className="flex-1 bg-white">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">개인정보처리방침</h1>
        <p className="text-sm text-gray-500 mb-10">시행일: 2026년 3월 1일</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. 개인정보의 처리 목적</h2>
            <p className="text-gray-700 leading-relaxed">
              주식회사 위시스(이하 &quot;회사&quot;)는 다음의 목적을 위해 개인정보를 처리합니다.
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-700">
              <li>부동산 상담 서비스 제공 및 문의 응답</li>
              <li>회원 가입 및 관리</li>
              <li>매물 정보 제공 및 알림 서비스</li>
              <li>서비스 개선 및 통계 분석</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. 처리하는 개인정보 항목</h2>
            <p className="text-gray-700 leading-relaxed">회사는 다음의 개인정보 항목을 처리합니다.</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-700">
              <li><strong>필수 항목:</strong> 성명, 연락처(휴대폰 번호), 이메일</li>
              <li><strong>선택 항목:</strong> 상담 내용, 관심 지역, 희망 조건</li>
              <li><strong>자동 수집:</strong> 접속 IP, 쿠키, 방문 일시, 서비스 이용 기록</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. 개인정보의 보유 및 이용 기간</h2>
            <p className="text-gray-700 leading-relaxed">
              회사는 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.
              단, 관계 법령에 의해 보존할 필요가 있는 경우 해당 법령에서 정한 기간 동안 보존합니다.
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-700">
              <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
              <li>소비자의 불만 또는 분쟁 처리에 관한 기록: 3년</li>
              <li>웹사이트 방문 기록: 3개월</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. 개인정보의 제3자 제공</h2>
            <p className="text-gray-700 leading-relaxed">
              회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.
              다만, 이용자의 동의가 있거나 법령에 의한 경우에 한하여 제공할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. 개인정보의 파기 절차 및 방법</h2>
            <p className="text-gray-700 leading-relaxed">
              보유 기간이 경과한 개인정보는 기간 만료 후 5일 이내에 파기합니다.
              전자적 파일은 복원이 불가능한 방법으로 삭제하며,
              종이 문서는 분쇄하거나 소각하여 파기합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. 정보주체의 권리와 행사 방법</h2>
            <p className="text-gray-700 leading-relaxed">
              이용자는 언제든지 등록되어 있는 자신의 개인정보에 대해
              열람, 수정, 삭제, 처리 정지 요청을 할 수 있습니다.
              개인정보 관련 문의는 상담문의 페이지를 통해 요청해 주시기 바랍니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. 개인정보의 안전성 확보 조치</h2>
            <p className="text-gray-700 leading-relaxed">회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-700">
              <li>개인정보 암호화 저장</li>
              <li>SSL 인증서를 통한 데이터 전송 암호화</li>
              <li>접근 권한 제한 및 관리</li>
              <li>개인정보 취급 직원 교육</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. 개인정보 보호책임자</h2>
            <div className="bg-gray-50 rounded-xl p-6 mt-3">
              <p className="text-gray-700"><strong>성명:</strong> 김현도</p>
              <p className="text-gray-700"><strong>직책:</strong> 대표이사</p>
              <p className="text-gray-700"><strong>문의:</strong> 상담문의 페이지를 통해 연락</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. 개인정보처리방침의 변경</h2>
            <p className="text-gray-700 leading-relaxed">
              이 개인정보처리방침은 2026년 3월 1일부터 적용됩니다.
              변경사항이 있을 경우 웹사이트를 통해 공지합니다.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
