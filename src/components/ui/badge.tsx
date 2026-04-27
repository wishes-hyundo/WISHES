// shadcn/ui — Badge (BoB 표준)
// 2026-04-28: wishes 색상 매핑 (success/warning 추가).
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-wishes-primary focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-wishes-primary text-white',
        secondary: 'border-transparent bg-wishes-cream text-wishes-primary',
        destructive: 'border-transparent bg-red-100 text-red-800',
        outline: 'text-wishes-text border-wishes-border',
        success: 'border-transparent bg-emerald-100 text-emerald-800',
        warning: 'border-transparent bg-amber-100 text-amber-800',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
