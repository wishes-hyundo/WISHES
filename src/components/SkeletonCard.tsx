'use client';

import { cn } from '@/lib/utils';

function Pulse({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-gray-200', className)} />;
}

export function SkeletonCard() {
  return (
    <div className="card-premium overflow-hidden">
      <Pulse className="aspect-[16/10] rounded-none rounded-t-2xl" />
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <Pulse className="h-3 w-12" />
          <Pulse className="h-7 w-32" />
        </div>
        <Pulse className="h-4 w-full" />
        <div className="flex gap-4">
          <Pulse className="h-4 w-16" />
          <Pulse className="h-4 w-12" />
        </div>
        <Pulse className="h-4 w-40" />
        <div className="flex gap-2 pt-2">
          <Pulse className="h-6 w-14 rounded-full" />
          <Pulse className="h-6 w-20 rounded-full" />
        </div>
        <div className="pt-3 border-t border-gray-100 flex justify-between">
          <Pulse className="h-3 w-16" />
          <Pulse className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCardCompact() {
  return (
    <div className="flex bg-white rounded-xl border border-gray-100 overflow-hidden h-28">
      <Pulse className="w-28 h-28 rounded-none shrink-0" />
      <div className="flex-1 p-3 flex flex-col justify-between">
        <div className="space-y-1.5">
          <Pulse className="h-4 w-24" />
          <Pulse className="h-3 w-36" />
        </div>
        <div className="flex gap-2">
          <Pulse className="h-3 w-12" />
          <Pulse className="h-3 w-10" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonListingGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
