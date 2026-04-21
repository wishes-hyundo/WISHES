import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: '주식회사 위시스부동산중개법인 개인정보처리방침',
  alternates: {
    canonical: 'https://wishes.co.kr/privacy',
  },
};

const sections = [
  {
    title: '제1조 (개인정보의 처리 목적)',
    text: '(주)위시스부동산중개법인(이하 "회사")은 다음의 목적을 위해 개인정보를 처리합니다.',
    items: ['부동산 중개 상담 접수 및 회신', '물건 안내 및 계약 관련 연락', '서비스 개선 및 통계 분석']
  },
  {
    title: '제2조 (처리하는 개인정보 항목)',
    text: '회사는 상담문의 접수 시 다음의 개인정보를 수집합니다.',
    items: ['필수: 성명, 연락처, 이메일', '선택: 희망 지역, 매물 유형, 예산, 문의 내용']
  },
  {
    title: '제3조 (보유 기간)',
    text: '목적 달성 후 지체 없이 파기합니다. 다만 관계 법령에 의한 보존 필요시 해당 기간 보관합니다.',
    items: ['상담 문의 기록: 3년 (전자상거래법)', '계약 관련 기록: 5년 (상법)']
  },
  {
    title: '제4조 (제3자 제공)',
    text: '원칙적으로 외부에 제공하지 않습니다. 다만 다음은 예외로 합니다.',
    items: ['이용자가 사전에 동의한 경우', '법령에 의해 요구되는 경우']
  },
  {
    title: '제5조 (파기 방법)',
    text: '보유 기간 경과 시 다음의 방법으로 파기합니다.',
    items: ['전자적 파일: 복구 불가능한 방법으로 영구 삭제', '종이 문서: 파쇄 또는 소각']
  },
  {
    title: '제6조 (정보주체의 권리)',
    text: '이용자는 언제든지 다음의 권리를 행사할 수 있습니다.',
    items: ['개인정보 열람 요구', '개인정보 정정·삭제 요구', '개인정보 처리 정지 요구']
  },
  {
    title: '제7조 (안전성 확보 조치)',
    text: '회사는 개인정보 안전성 확보를 위해 다음 조치를 취하고 있습니다.',
    items: ['개인정보 접근 권한 제한', '개인정보의 암호화', '보안 프로그램 설치 및 주기적 갱신']
  },
  {
    title: '제8조 (개인정보 보호책임자)',
    text: '개인정보 처리 불만 및 피해 구제를 위해 아래와 같이 보호책임자를 지정합니다.',
    items: ['보호책임자: 전유진', '이메일: wishes@wishes.co.kr']
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">개인정보처리방침</h1>
        <p className="text-sm text-gray-500 mb-10">시행일: 2026년 3월 27일</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          {sections.map((sec, i) => (
            <section key={i}>
              <h2 className="text-base font-semibold text-gray-900 mb-2">{sec.title}</h2>
              <p>{sec.text}</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                {sec.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </section>
          ))}

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">제9조 (방침 변경)</h2>
            <p>이 개인정보처리방침은 2026년 3월 27일부터 적용됩니다. 변경 사항이 있을 경우 웹사이트를 통해 공지하겠습니다.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
