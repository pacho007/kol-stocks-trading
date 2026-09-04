import { useEffect, useState } from "react";
import { SESSIONS, fmtDuration, fmtUtc, msToDailyClose } from "@/lib/sessions";
import { useSession } from "@/hooks/use-session";

/**
 * The trading day: which sessions are open, and how long the New York one has
 * left.
 *
 * This used to describe itself as counting down to "when every trader's book is
 * repriced", which stopped being true when pricing became continuous. The
 * oracle re-reads every listed wallet on a loop and pushes any score that
 * moved — nothing waits for a close, and nothing happens at 21:00 UTC that does
 * not happen at 14:00. The countdown is kept because the session boundary is
 * real and worth showing, but it is labelled as what it is.
 */
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
          to the NY close
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
