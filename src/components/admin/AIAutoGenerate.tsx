'use client';

interface AIAutoGenerateProps {
  listing: any;
  onUpdate?: (field: string, value: any) => void;
}

export default function AIAutoGenerate({ listing, onUpdate }: AIAutoGenerateProps) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="font-semibold text-gray-700 mb-2">AI 자동 생성</h3>
      <p className="text-sm text-gray-500">AI 기능 준비 중...</p>
    </div>
  );
}
