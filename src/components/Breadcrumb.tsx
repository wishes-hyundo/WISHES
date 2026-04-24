'use client';

import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-xs text-wishes-muted py-3 overflow-x-auto">
      <Link
        href="/"
        className="flex items-center gap-1 hover:text-wishes-secondary transition-colors shrink-0"
      >
        <Home className="w-3.5 h-3.5" />
        <span>홈</span>
      </Link>

      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1 shrink-0">
          <ChevronRight className="w-3 h-3 text-gray-300" />
          {item.href && index < items.length - 1 ? (
            <Link
              href={item.href}
              className="hover:text-wishes-secondary transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-wishes-text font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
