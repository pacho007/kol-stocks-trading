import { useEffect, useState } from "react";
import { SESSIONS, fmtDuration, fmtUtc, msToDailyClose } from "@/lib/sessions";
import { useSession } from "@/hooks/use-session";

/** Counts down to the New York close (21:00 UTC), when every trader's book is repriced. */
export function SessionClock() {
  const [left, setLeft] = useState("--:--:--");
  const session = useSession();

  useEffect(() => {
    const tick = () => setLeft(fmtDuration(msToDailyClose(new Date())));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const activeIds = new Set(session?.active.map((s) => s.id) ?? []);

  return (
    <div>
      <p className="num mt-2 text-2xl font-semibold text-primary">
        {left}
        <span className="ml-2 text-[10px] tracking-widest uppercase text-muted-foreground">
          to the close
        </span>
      </p>
      <div className="mt-3 space-y-1">
        {SESSIONS.map((s) => {
          const live = activeIds.has(s.id);
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 text-[10px] tracking-[0.16em] uppercase"
            >
              <span className={`size-1.5 rounded-full ${live ? "live-dot bg-up" : "bg-border"}`} />
              <span className={live ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
              <span className="num ml-auto text-muted-foreground">
                {fmtUtc(s.open)}-{fmtUtc(s.close)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
