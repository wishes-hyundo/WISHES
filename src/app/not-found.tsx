import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '페이지를 찾을 수 없습니다',
  description: '요청하신 페이지를 찾을 수 없습니다. WISHES 지도 검색에서 매물을 확인해보세요.',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-wishes-bg flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg text-center">
        {/* 404 비주얼 */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-wishes-primary/10 mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-14 h-14 text-wishes-primary"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              />
            </svg>
          </div>
          <h1 className="text-5xl font-extrabold text-wishes-primary tracking-tight mb-3">
            404
          </h1>
          <h2 className="text-xl font-bold text-wishes-text mb-2">
            페이지를 찾을 수 없습니다
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            요청하신 페이지가 삭제되었거나
            <br className="sm:hidden" />
            주소가 변경되었을 수 있습니다.
          </p>
        </div>

        {/* 주요 동선 CTA */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-6">
          <Link
            href="/map"
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-wishes-primary text-white text-[15px] font-semibold shadow-sm hover:bg-wishes-primary/90 active:scale-[0.98] transition-all"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
            지도에서 매물 찾기
          </Link>
          <Link
            href="/listings"
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white text-wishes-text text-[15px] font-semibold border border-gray-200 hover:border-wishes-primary hover:text-wishes-primary active:scale-[0.98] transition-all"
          >
            매물 목록 보기
          </Link>
        </div>

        {/* 상담 링크 */}
        <p className="text-[13px] text-gray-500">
          찾으시는 매물이 있으시면{' '}
          <Link
            href="/contact"
            className="text-wishes-primary font-semibold underline-offset-2 hover:underline"
          >
            문의하기
          </Link>
          로 알려주세요.
        </p>
      </div>
    </div>
  );
}
