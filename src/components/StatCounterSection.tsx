'use client';

import { useEffect, useState, useRef } from 'react';

function StatCounter({ value, label }: { value: string; label: string }) {
  const numValue = parseInt(value) || 0;
  const [count, setCount] = useState(numValue);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasAnimated || numValue === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasAnimated(true);
          // 0부터 시작하여 카운트업 애니메이션
          setCount(0);
          let current = 0;
          const increment = Math.ceil(numValue / 30);
          const interval = setInterval(() => {
            current += increment;
            if (current >= numValue) {
              setCount(numValue);
              clearInterval(interval);
            } else {
              setCount(current);
            }
          }, 25);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [numValue, hasAnimated]);

  return (
    <div className="text-center" ref={ref}>
      <div className="text-4xl md:text-5xl font-bold text-wishes-accent mb-2" suppressHydrationWarning>
        {count}{value.includes('+') ? '+' : ''}
      </div>
      <p className="text-sm text-wishes-muted">{label}</p>
    </div>
  );
}

export function StatCounterSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
      <StatCounter value="500+" label="거래 건수" />
      <StatCounter value="15" label="년 경력" />
      <StatCounter value="98" label="고객 만족도 %" />
      <StatCounter value="24" label="시간 상담" />
    </div>
  );
}
