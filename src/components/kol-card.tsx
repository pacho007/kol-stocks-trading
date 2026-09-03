import { Link } from "@tanstack/react-router";
import { ScorePill } from "@/components/score-pill";
import { AvatarMark } from "@/components/avatar-mark";
import { LivePrice } from "@/components/live-price";
import { Sparkline } from "@/components/sparkline";
import { fmtCompact, fmtPct, shortWallet, type Kol } from "@/lib/kols";
import { useKolStats, useKolHistory, SINCE_OPEN } from "@/lib/market-store";

export function KolCard({ kol, price, index = 0 }: { kol: Kol; price: number; index?: number }) {
  const { marketCapUsd, changePct, score } = useKolStats(kol.id);
  const up = changePct >= 0;
  // The percentage beside this chart is measured since the listing opened, so
  // the chart is too. It used to be a five-minute window, which at a five-
  // minute oracle cadence is one or two readings — a card could show +88% next
  // to a line that hadn't moved, because the two were describing different
  // spans of time.
  const hist = useKolHistory(kol.id, SINCE_OPEN);
  const series = hist.map((p) => p.p);

  return (
    <Link
      to="/kol/$id"
      params={{ id: kol.id }}
      className="rise sheen group relative flex flex-col gap-4 overflow-hidden panel p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/45"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "color-mix(in oklab, var(--primary) 18%, transparent)" }}
      />
      <div className="relative flex items-start gap-3">
        <AvatarMark gradient={kol.avatar} label={kol.ticker} src={kol.image} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="num text-sm font-bold tracking-widest transition-colors group-hover:text-gold-light">
              ${kol.ticker}
            </span>
            <span className="rounded-full border border-border px-2 py-px text-[9px] tracking-widest uppercase text-muted-foreground">
              {kol.chain}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {kol.handle || shortWallet(kol.wallet)}
          </p>
        </div>
        <span
          title="Change since this listing opened. Every listing opens at the same price, so this is the whole of its move so far — not a 24-hour figure."
          className={`num ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
            up ? "bg-up/12 text-up" : "bg-down/12 text-down"
          }`}
        >
          {fmtPct(changePct)}
        </span>
      </div>

      {series.length >= 2 ? (
        <Sparkline data={series} up={up} className="h-12 w-full" />
      ) : (
        // A flat line here would read as "the price hasn't moved". It hasn't
        // been measured yet, which is a different claim.
        <div className="flex h-12 items-center gap-3">
          <span className="h-px flex-1 border-t border-dashed border-border" />
          <span className="text-[10px] tracking-widest uppercase text-muted-foreground">
            Awaiting first reading
          </span>
          <span className="h-px flex-1 border-t border-dashed border-border" />
        </div>
      )}

      <div className="flex items-end justify-between border-t border-border/70 pt-3">
        <div>
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground">Price</p>
          <LivePrice value={price} className="text-lg font-semibold -ml-1" />
        </div>
        <div className="text-right">
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground">Mkt cap</p>
          <p className="num text-sm text-foreground/80">{fmtCompact(marketCapUsd)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground">Perf score</p>
          <ScorePill score={score} id={kol.id} />
        </div>
      </div>
    </Link>
  );
}
