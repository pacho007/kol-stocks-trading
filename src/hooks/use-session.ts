import { useEffect, useState } from "react";
import { sessionState } from "@/lib/sessions";

/** Ticks once a second on the client; null during SSR to avoid hydration mismatch. */
export function useSession() {
  const [state, setState] = useState<ReturnType<typeof sessionState> | null>(null);

  useEffect(() => {
    const tick = () => setState(sessionState(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return state;
}
