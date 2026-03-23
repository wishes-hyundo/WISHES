'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

interface ClientLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

export default function ClientLink({ href, className, children }: ClientLinkProps) {
  return <Link href={href} className={className}>{children}</Link>;
}
