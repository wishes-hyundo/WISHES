export const metadata = {
  title: '결제 취소',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ code?: string; message?: string }>;
}

export default async function FailPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 mt-8">
      <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-6 text-center">
        <div className="text-4xl mb-3">↩️</div>
        <h1 className="text-xl font-bold text-yellow-900 mb-2">결제가 취소되었습니다</h1>
        {sp.message && <p className="text-sm text-yellow-800 mb-4">{sp.message}</p>}
        <p className="text-xs text-yellow-700 mb-4">결제는 진행되지 않았습니다.</p>
        <a
          href="/map"
          className="inline-block rounded-lg bg-gray-200 text-gray-800 px-6 py-2 font-semibold hover:bg-gray-300"
        >
          매물로 돌아가기
        </a>
      </div>
    </div>
  );
}
