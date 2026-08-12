import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Crosshair, LineChart, Wallet } from "lucide-react";
import { AvatarMark } from "@/components/avatar-mark";
import { KolCard } from "@/components/kol-card";
import { LivePrice } from "@/components/live-price";
import { Sparkline } from "@/components/sparkline";
import { TickerTape } from "@/components/ticker-tape";
import { ConnectWalletButton } from "@/components/site-header";
import { KOLS, fmtCompact, fmtPct, perfScore } from "@/lib/kols";
import { useMarket } from "@/lib/market-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHARPS — Invest in Crypto Traders Like Stocks" },
      {
        name: "description",
        content:
          "SHARPS lists on-chain crypto traders as tradable stocks. Their live performance is their share price. Scout talent early, buy shares, ride the PnL.",
      },
      { property: "og:title", content: "SHARPS — Invest in Crypto Traders Like Stocks" },
      {
        property: "og:description",
        content: "Their on-chain performance is their share price. Buy the traders you believe in.",
      },
    ],
  }),
  component: Landing,
});

const STEPS = [
  {
    icon: Crosshair,
    title: "Scout a trader",
    body: "Every listed KOL is a verified on-chain wallet. Win rate, realized PnL, size, hold time — all public, all indexed live.",
  },
  {
    icon: Wallet,
    title: "Buy their stock",
    body: "Connect a wallet and take a position in seconds. Fractional shares, instant fills, no lockup, exit whenever you want.",
  },
  {
    icon: LineChart,
    title: "Their edge is your bag",
    body: "Green trades pump the share price. Blowups dump it. You are long the operator, not the coin they are farming.",
  },
];

function Landing() {
  const { prices } = useMarket();
  const top = [...KOLS].sort((a, b) => b.change24h - a.change24h).slice(0, 4);
  const board = [...KOLS].sort((a, b) => perfScore(b) - perfScore(a)).slice(0, 6);
  const totalCap = KOLS.reduce((s, k) => s + k.marketCap, 0);
  const totalVol = KOLS.reduce((s, k) => s + k.volume24h, 0);

  return (
    <div>
      <section className="hero-bg relative overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-7xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
          <div className="rise inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            <span className="live-dot size-1.5 rounded-full bg-up" />
            12 traders listed · Season 1 live
          </div>

          <h1 className="rise mt-6 max-w-4xl text-4xl leading-[1.02] font-bold sm:text-6xl lg:text-7xl" style={{ animationDelay: "60ms" }}>
            Invest in traders
            <br />
            like stocks.
          </h1>

          <p className="rise mt-6 max-w-xl text-base text-muted-foreground sm:text-lg" style={{ animationDelay: "120ms" }}>
            Their on-chain performance <span className="text-foreground">is</span> their share price.
            Good trades pump. Blowups dump. Scout the next great degen before the crowd finds the wallet.
          </p>

          <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "180ms" }}>
            <Link
              to="/market"
              className="glow group inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-xs font-bold tracking-widest uppercase text-primary-foreground transition-all hover:brightness-110"
            >
              Open the market
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <ConnectWalletButton />
          </div>

          <dl className="rise mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden panel bg-border sm:grid-cols-4" style={{ animationDelay: "240ms" }}>
            {[
              ["Index mkt cap", fmtCompact(totalCap)],
              ["24h volume", fmtCompact(totalVol)],
              ["Listed traders", String(KOLS.length)],
              ["Avg win rate", `${Math.round(KOLS.reduce((s, k) => s + k.winRate, 0) / KOLS.length)}%`],
            ].map(([label, value]) => (
              <div key={label} className="bg-card px-4 py-4">
                <dt className="text-[10px] tracking-widest uppercase text-muted-foreground">{label}</dt>
                <dd className="num mt-1 text-xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <TickerTape />

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHead kicker="How it works" title="Three steps. No thesis required." />
        <div className="mt-10 grid gap-px overflow-hidden panel bg-border md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="group bg-card p-7 transition-colors hover:bg-surface">
              <div className="flex items-center justify-between">
                <s.icon className="size-5 text-primary transition-transform duration-300 group-hover:scale-110" />
                <span className="num text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHead kicker="Top movers" title="Who's running today" />
            <Link
              to="/market"
              className="num text-xs tracking-widest uppercase text-primary hover:underline"
            >
              View all markets →
            </Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {top.map((k, i) => (
              <KolCard key={k.id} kol={k} price={prices[k.id] ?? k.price} index={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead kicker="Leaderboard" title="Ranked by performance score" />
          <Link
            to="/leaderboard"
            className="num text-xs tracking-widest uppercase text-primary hover:underline"
          >
            Full leaderboard →
          </Link>
        </div>

        <div className="mt-8 overflow-hidden panel">
          {board.map((k, i) => {
            const up = k.change24h >= 0;
            return (
              <Link
                key={k.id}
                to="/kol/$id"
                params={{ id: k.id }}
                className="flex items-center gap-4 border-b border-border bg-card px-4 py-3.5 transition-colors last:border-0 hover:bg-surface"
              >
                <span className="num w-6 text-sm text-muted-foreground">{i + 1}</span>
                <AvatarMark gradient={k.avatar} label={k.ticker} size={34} />
                <div className="min-w-0">
                  <p className="num text-sm font-bold tracking-widest">${k.ticker}</p>
                  <p className="truncate text-xs text-muted-foreground">{k.handle}</p>
                </div>
                <Sparkline data={k.series} up={up} className="ml-auto hidden h-8 w-28 sm:block" />
                <div className="hidden w-24 text-right md:block">
                  <p className="text-[10px] tracking-widest uppercase text-muted-foreground">Score</p>
                  <p className="num text-sm">{perfScore(k)}</p>
                </div>
                <div className="w-24 text-right">
                  <LivePrice value={prices[k.id] ?? k.price} className="text-sm font-semibold" />
                  <p className={`num text-xs ${up ? "text-up" : "text-down"}`}>{fmtPct(k.change24h)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-bold sm:text-5xl">Talent is the only asset that compounds.</h2>
          <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground">
            Stop chasing the coin. Buy the operator behind it — before the rest of the timeline
            figures out who they are.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              to="/market"
              className="glow inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-xs font-bold tracking-widest uppercase text-primary-foreground transition-all hover:brightness-110"
            >
              Start trading
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="num text-[10px] tracking-[0.3em] uppercase text-primary">{kicker}</p>
      <h2 className="mt-2 text-2xl font-bold sm:text-4xl">{title}</h2>
    </div>
  );
}
