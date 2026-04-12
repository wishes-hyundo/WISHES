import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '이용약관 | 위시스부동산',
  description: '위시스부동산중개법인 이용약관',
  alternates: {
    canonical: 'https://wishes.co.kr/terms',
  },
};

export default function TermsPage() {
  return (
    <main className="flex-1 bg-white">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">이용약관</h1>
        <p className="text-sm text-gray-500 mb-10">시행일: 2026년 3월 1일</p>

        <div className="prose prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제1조 (목적)</h2>
            <p className="text-gray-700 leading-relaxed">
              이 약관은 주식회사 위시스(이하 &quot;회사&quot;)가 운영하는 웹사이트 wishes.co.kr(이하 &quot;사이트&quot;)에서
              제공하는 부동산 중개 정보 서비스의 이용과 관련하여
              회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제2조 (정의)</h2>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li><strong>&quot;사이트&quot;</strong>란 회사가 부동산 정보를 제공하기 위해 운영하는 웹사이트를 말합니다.</li>
              <li><strong>&quot;이용자&quot;</strong>란 사이트에 접속하여 이 약관에 따라 회사가 제공하는 서비스를 이용하는 자를 말합니다.</li>
              <li><strong>&quot;회원&quot;</strong>이란 회사에 개인정보를 제공하여 회원등록을 한 자를 말합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제3조 (약관의 효력 및 변경)</h2>
            <p className="text-gray-700 leading-relaxed">
              이 약관은 사이트에 공지함으로써 효력이 발생하며,
              회사는 합리적인 사유가 있는 경우 이 약관을 변경할 수 있습니다.
              변경된 약관은 사이트에 공지된 날부터 효력이 발생합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제4조 (서비스의 제공)</h2>
            <p className="text-gray-700 leading-relaxed">회사는 다음과 같은 서비스를 제공합니다.</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-700">
              <li>부동산 매물 정보 제공</li>
              <li>부동산 상담 서비스</li>
              <li>지도 기반 부동산 검색</li>
              <li>기타 회사가 정하는 서비스</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제5조 (이용자의 의무)</h2>
            <p className="text-gray-700 leading-relaxed">이용자는 다음 행위를 하여서는 안 됩니다.</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-700">
              <li>타인의 정보를 도용하는 행위</li>
              <li>회사의 지적재산권을 침해하는 행위</li>
              <li>회사의 서비스 운영을 방해하는 행위</li>
              <li>허위 정보를 등록하는 행위</li>
              <li>기타 불법적이거나 부당한 행위</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제6조 (회사의 의무)</h2>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>회사는 안정적인 서비스 제공을 위해 최선을 다합니다.</li>
              <li>회사는 이용자의 개인정보를 보호하기 위해 개인정보처리방침을 준수합니다.</li>
              <li>회사는 제공하는 부동산 정보의 정확성을 위해 노력합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제7조 (면책사항)</h2>
            <ul className="list-disc pl-6 space-y-1 text-gray-700">
              <li>회사는 사이트에 게시된 정보의 정확성을 보증하지 않으며, 이용자의 판단으로 이용해야 합니다.</li>
              <li>실제 부동산 거래는 반드시 공인중개사와 직접 상담 후 진행해야 합니다.</li>
              <li>회사는 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제8조 (분쟁 해결)</h2>
            <p className="text-gray-700 leading-relaxed">
              이 약관과 관련한 분쟁은 대한민국 법률을 준거법으로 하며,
              분쟁 발생 시 회사의 본점 소재지를 관할하는 법원을 전속관할로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">부칙</h2>
            <p className="text-gray-700 leading-relaxed">
              이 약관은 2026년 3월 1일부터 시행합니다.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
