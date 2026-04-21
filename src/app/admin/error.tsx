'use client';

import { useEffect, useState } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error('Admin error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-lg w-full">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          오류가 발생했습니다
        </h2>
        <p className="text-gray-500 mb-4">
          페이지를 로드하는 중 문제가 발생했습니다.
        </p>
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-left">
          <p className="text-sm font-mono text-red-700 break-all">
            {error.message || '알 수 없는 오류'}
          </p>
          {error.digest && (
            <p className="text-xs text-red-400 mt-1">Digest: {error.digest}</p>
          )}
          {showDetails && error.stack && (
            <pre className="text-xs text-red-500 mt-2 overflow-auto max-h-40 whitespace-pre-wrap">
              {error.stack}
            </pre>
          )}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-red-400 underline mt-1"
          >
            {showDetails ? '상세 숨기기' : '상세 보기'}
          </button>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            다시 시도
          </button>
          <button
            onClick={() => window.location.href = '/admin'}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
          >
            대시보드로 이동
          </button>
        </div>
      </div>
    </div>
  );
}
