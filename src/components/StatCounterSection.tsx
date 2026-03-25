'use client';

import { useEffect, useState } from 'react';

function StatCounter({ value, label }: { value: string; label: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const numValue = parseInt(value) || 0;
    if (numValue === 0) return;

    let current = 0;
    const increment = Math.ceil(numValue / 20);
    const interval = setInterval(() => {
      current += increment;
      if (current >= numValue) {
        setCount(numValue);
        clearInterval(interval);
      } else {
        setCount(current);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [value]);

  return (
    <div className="text-center">
      <div className="text-4xl md:text-5xl font-bold text-wishes-accent mb-2">{count}{value.includes('+') ? '+' : ''}</div>
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
