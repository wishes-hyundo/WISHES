'use client';

import { useEffect, useState, useRef } from 'react';

function StatCounter({ value, label }: { value: string; label: string }) {
  const numValue = parseInt(value) || 0;
  const [count, setCount] = useState(numValue);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasAnimated || numValue === 0) return;

    // L-leak1 (2026-04-22): interval 을 ref 에 보존하여 언마운트 시 clear.
    //   기존: IntersectionObserver 콜백 안에서 setInterval 시작 후 참조 소실 →
    //   컴포넌트가 애니메이션 중간에 언마운트되면 interval 이 계속 돌며
    //   unmounted 컴포넌트에 setCount 호출 (React 경고 + 타이머 누수).
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasAnimated(true);
          // 0부터 시작하여 카운트업 애니메이션
          setCount(0);
          let current = 0;
          const increment = Math.ceil(numValue / 30);
          intervalId = setInterval(() => {
            current += increment;
            if (current >= numValue) {
              setCount(numValue);
              if (intervalId) clearInterval(intervalId);
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

    return () => {
      observer.disconnect();
      if (intervalId) clearInterval(intervalId);
    };
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
