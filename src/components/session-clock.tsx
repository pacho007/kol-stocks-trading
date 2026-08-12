import { useEffect, useState } from "react";

/** Counts down to the 21:00 UTC daily close, when every trader's book is repriced. */
export function SessionClock() {
  const [left, setLeft] = useState("--:--:--");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const close = new Date(now);
      close.setUTCHours(21, 0, 0, 0);
      if (close.getTime() <= now.getTime()) close.setUTCDate(close.getUTCDate() + 1);
      const d = close.getTime() - now.getTime();
      const h = Math.floor(d / 3.6e6);
      const m = Math.floor((d % 3.6e6) / 6e4);
      const s = Math.floor((d % 6e4) / 1000);
      setLeft([h, m, s].map((n) => String(n).padStart(2, "0")).join(":"));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="num mt-2 text-2xl font-semibold text-primary">
      {left}
      <span className="ml-2 text-[10px] tracking-widest uppercase text-muted-foreground">to the close</span>
    </p>
  );
}
