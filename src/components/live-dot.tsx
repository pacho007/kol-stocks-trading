import { useMarketFeed } from "@/lib/market-feed";

/**
 * Whether the shared feed is actually connected, stated honestly.
 *
 * Three states rather than two, because "live" and "not live" cannot describe
 * a backend that simply is not configured in this environment. A pulsing green
 * dot on a page with no feed behind it is a lie told in the most reassuring
 * possible way.
 */
export function LiveDot({ label = true }: { label?: boolean }) {
  const feed = useMarketFeed();

  const state = !feed.configured
    ? {
        dot: "bg-muted-foreground/40",
        text: "Offline",
        title: "No shared feed in this environment",
      }
    : feed.live
      ? { dot: "live-dot bg-up", text: "Live", title: "Subscribed — trades appear as they confirm" }
      : { dot: "bg-primary/70", text: "Connecting", title: "Connecting to the shared feed" };

  return (
    <span className="flex items-center gap-1.5" title={state.title}>
      <span className={`size-1.5 rounded-full ${state.dot}`} />
      {label && (
        <span className="num text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
          {state.text}
        </span>
      )}
    </span>
  );
}
