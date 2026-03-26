export default function ListingsLoading() {
  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      {/* Hero skeleton */}
      <section className="bg-gradient-to-br from-wishes-primary to-wishes-secondary text-white py-16 md:py-20">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="h-10 w-48 bg-white/20 rounded-lg mx-auto animate-pulse" />
          <div className="h-5 w-72 bg-white/10 rounded mt-3 mx-auto animate-pulse" />
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Search bar skeleton */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          <div className="flex gap-3 mt-4">
            <div className="h-10 w-32 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-10 w-32 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-10 w-32 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Card skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
