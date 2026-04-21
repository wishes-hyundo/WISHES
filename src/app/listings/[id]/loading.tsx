export default function ListingDetailLoading() {
  return (
    <div className="pt-16 min-h-screen bg-wishes-bg">
      {/* 상단 네비 스켈레톤 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 좌측: 이미지 + 상세 스켈레톤 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 이미지 갤러리 */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="aspect-[16/10] bg-gray-200" />
            </div>

            {/* 상세 정보 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-4 w-20 bg-gray-100 rounded mb-2" />
              <div className="h-8 w-2/3 bg-gray-200 rounded mb-2" />
              <div className="h-9 w-1/3 bg-gray-200 rounded mb-6" />

              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <div className="h-3 w-12 bg-gray-100 rounded mb-1" />
                    <div className="h-5 w-24 bg-gray-200 rounded" />
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="h-4 w-20 bg-gray-200 rounded mb-3" />
                <div className="flex gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-7 w-16 bg-gray-100 rounded-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 우측: 상담 CTA 스켈레톤 */}
          <div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
              <div className="h-12 w-full bg-gray-200 rounded-xl" />
              <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
                <div className="h-3 w-28 bg-gray-100 rounded" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
