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
      className="rise group relative flex flex-col gap-4 overflow-hidden rounded-lg border border-border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <div className="flex items-start gap-3">
        <AvatarMark gradient={kol.avatar} label={kol.ticker} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="num text-sm font-bold tracking-widest">${kol.ticker}</span>
            <span className="rounded-sm border border-border px-1.5 py-px text-[9px] tracking-widest uppercase text-muted-foreground">
              {kol.chain}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{kol.handle}</p>
        </div>
        <span
          className={`num ml-auto rounded-sm px-1.5 py-0.5 text-xs font-semibold ${
            up ? "bg-up/12 text-up" : "bg-down/12 text-down"
          }`}
        >
          {fmtPct(kol.change24h)}
        </span>
      </div>

      <Sparkline data={kol.series} up={up} className="h-12 w-full" />

      <div className="flex items-end justify-between border-t border-border/70 pt-3">
        <div>
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground">Price</p>
          <LivePrice value={price} className="text-lg font-semibold -ml-1" />
        </div>
        <div className="text-right">
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground">Mkt cap</p>
          <p className="num text-sm text-foreground/80">{fmtCompact(kol.marketCap)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground">Win rate</p>
          <p className="num text-sm text-foreground/80">{kol.winRate}%</p>
        </div>
      </div>
    </Link>
  );
}
