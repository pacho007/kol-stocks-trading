import { Link } from "@tanstack/react-router";
import { OPEN_PRICE_USD } from "@/lib/pricing";
import { KOLS, fmtPct, fmtUsd } from "@/lib/kols";
import { useMarket, useLiveMetrics } from "@/lib/market-store";

export function TickerTape() {
  const { prices } = useMarket();
  const { changePct } = useLiveMetrics();
  const row = [...KOLS, ...KOLS];

  return (
    <div className="relative overflow-hidden border-y border-border bg-surface/60">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />
      <div className="marquee flex w-max items-center gap-8 py-2.5">
        {row.map((k, i) => {
          const up = (changePct[k.id] ?? 0) >= 0;
          return (
            <Link
              key={`${k.id}-${i}`}
              to="/kol/$id"
              params={{ id: k.id }}
              className="flex shrink-0 items-center gap-2.5 text-xs transition-opacity hover:opacity-70"
            >
              <span className="num font-semibold tracking-widest text-foreground">${k.ticker}</span>
              <span className="num text-muted-foreground">
                {fmtUsd(prices[k.id] ?? OPEN_PRICE_USD)}
              </span>
              <span className={`num font-medium ${up ? "text-up" : "text-down"}`}>
                {fmtPct(changePct[k.id] ?? 0)}
              </span>
              <span className="text-border">|</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
