import { Suspense } from 'react';
import ContactContent from './ContactContent';

export const dynamic = 'force-dynamic';

export default function ContactPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-wishes-primary">로딩 중...</div>
      </div>
    }>
      <ContactContent />
    </Suspense>
  );
}