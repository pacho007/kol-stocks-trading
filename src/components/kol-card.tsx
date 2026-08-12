import { Link } from "@tanstack/react-router";
import { AvatarMark } from "@/components/avatar-mark";
import { LivePrice } from "@/components/live-price";
import { Sparkline } from "@/components/sparkline";
import { fmtCompact, fmtPct, type Kol } from "@/lib/kols";

export function KolCard({ kol, price, index = 0 }: { kol: Kol; price: number; index?: number }) {
  const up = kol.change24h >= 0;

  return (
    <Link
      to="/kol/$id"
      params={{ id: kol.id }}
      className="rise group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:border-white/15 hover:bg-surface"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <div className="relative flex items-start gap-3">
        <AvatarMark gradient={kol.avatar} label={kol.ticker} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="num text-sm font-semibold tracking-wide">${kol.ticker}</span>
            <span className="rounded-full border border-border px-2 py-px text-[9px] tracking-wide lowercase text-muted-foreground">
              {kol.chain}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{kol.handle}</p>
        </div>
        <span className={`num ml-auto text-sm font-semibold ${up ? "text-up" : "text-down"}`}>
          {fmtPct(kol.change24h)}
        </span>
      </div>

      <Sparkline data={kol.series} up={up} className="h-12 w-full" />

      <div className="grid grid-cols-3 gap-2">
        <div className="tile px-3 py-2.5">
          <p className="text-[10px] lowercase text-muted-foreground">price</p>
          <LivePrice value={price} className="text-sm font-semibold" />
        </div>
        <div className="tile px-3 py-2.5">
          <p className="text-[10px] lowercase text-muted-foreground">mkt cap</p>
          <p className="num text-sm text-foreground/85">{fmtCompact(kol.marketCap)}</p>
        </div>
        <div className="tile px-3 py-2.5">
          <p className="text-[10px] lowercase text-muted-foreground">win rate</p>
          <p className="num text-sm text-foreground/85">{kol.winRate}%</p>
        </div>
      </div>
    </Link>
  );
}

