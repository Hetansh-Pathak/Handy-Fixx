import { useEffect, useRef, useState } from 'react';

/** Smoothly counts to `value`. Jumps instantly when the user prefers reduced motion. */
export default function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString('en-IN'), ms = 700 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - p, 4);
      const v = a + (value - a) * e;
      from.current = v; setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular-nums">{format(shown)}</span>;
}
