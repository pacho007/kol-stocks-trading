import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AvatarMark } from "@/components/avatar-mark";
import { KolCard } from "@/components/kol-card";
import { LivePrice } from "@/components/live-price";
import { Sparkline } from "@/components/sparkline";
import { TickerTape } from "@/components/ticker-tape";
import { ConnectWalletButton } from "@/components/site-header";
import { KOLS, fmtCompact, fmtPct, perfScore } from "@/lib/kols";
import { useMarket } from "@/lib/market-store";
import heroBanner from "@/assets/hero-banner.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHARPS — Invest in Crypto Traders Like Stocks" },
      {
        name: "description",
        content:
          "SHARPS lists on-chain crypto traders as tradable stocks. Their daily performance sets their share price, with market hours and a daily close. Scout talent early, buy shares, ride the PnL.",
      },
      { property: "og:title", content: "SHARPS — Invest in Crypto Traders Like Stocks" },
      {
        property: "og:description",
        content: "Their on-chain performance is their share price. Buy the traders you believe in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STEPS = [
  {
    n: "01",
    title: "Traders get listed",
    body: "Every listing is a verified on-chain wallet. Win rate, realized PnL, size and hold time are tracked all session — no self-reported screenshots.",
  },
  {
    n: "02",
    title: "The desk prices them daily",
    body: "Books are reviewed once a day at the close. The session's on-chain performance sets the next open — green days gap the stock up, blowups gap it down.",
  },
  {
    n: "03",
    title: "You trade the session",
    body: "Buy fractional shares of the operator, not the coin they are farming, while the market is open. Orders placed after the bell fill at the next open.",
  },

];

function Landing() {
  const { prices, positions, cash } = useMarket();
  const rail = [...KOLS].sort((a, b) => b.marketCap - a.marketCap);
  const top = [...KOLS].sort((a, b) => b.change24h - a.change24h).slice(0, 4);
  const board = [...KOLS].sort((a, b) => perfScore(b) - perfScore(a)).slice(0, 6);
  const totalCap = KOLS.reduce((s, k) => s + k.marketCap, 0);
  const totalVol = KOLS.reduce((s, k) => s + k.volume24h, 0);
  const avgWin = Math.round(KOLS.reduce((s, k) => s + k.winRate, 0) / KOLS.length);
  const holdings = positions.reduce((s, p) => s + p.shares * (prices[p.id] ?? 0), 0);
  const equity = cash + holdings;

  return (
    <div>
      {/* status strip */}
      <div className="border-b border-border bg-surface/40">
        <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-[10px] tracking-[0.18em] uppercase text-muted-foreground sm:px-6">
          <span className="flex items-center gap-2 text-primary">
            <span className="live-dot size-1.5 rounded-full bg-up" />
            Market open · closes 21:00 UTC
          </span>
          <span>
            Index cap <span className="num text-foreground">{fmtCompact(totalCap)}</span>
          </span>
          <span>
            24h vol <span className="num text-foreground">{fmtCompact(totalVol)}</span>
          </span>
          <span>
            Listings <span className="num text-foreground">{KOLS.length}</span>
          </span>
          <span className="ml-auto hidden sm:inline">Season 1 · daily close settlement</span>
        </div>
      </div>

      {/* dashboard */}
      <div className="mx-auto grid max-w-[110rem] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_20rem]">
        {/* left rail */}
        <aside className="rise panel order-2 overflow-hidden lg:order-1">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Markets</span>
            <span className="num text-[10px] tracking-widest text-up">{KOLS.length} LIVE</span>
          </div>
          <div className="max-h-[34rem] overflow-y-auto">
            {rail.map((k) => {
              const up = k.change24h >= 0;
              return (
                <Link
                  key={k.id}
                  to="/kol/$id"
                  params={{ id: k.id }}
                  className="group flex items-center gap-2.5 border-b border-border/60 px-3 py-2.5 transition-colors last:border-0 hover:bg-accent/40"
                >
                  <AvatarMark gradient={k.avatar} label={k.ticker} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="num text-xs font-bold tracking-widest group-hover:text-primary">${k.ticker}</p>
                    <p className="truncate text-[10px] tracking-wider uppercase text-muted-foreground">
                      {k.name} · {k.chain}
                    </p>
                  </div>
                  <div className="text-right">
                    <LivePrice value={prices[k.id] ?? k.price} className="text-xs" />
                    <p className={`num text-[10px] ${up ? "text-up" : "text-down"}`}>{fmtPct(k.change24h)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>

        {/* center */}
        <main className="order-1 space-y-4 lg:order-2">
          <section className="rise panel relative overflow-hidden">
            <img
              src={heroBanner}
              alt="Gold wireframe candlestick terrain representing trader performance"
              width={1920}
              height={768}
              className="absolute inset-0 h-full w-full object-cover opacity-55"
            />
            <div className="absolute inset-0 bg-[linear-gradient(100deg,var(--background)_18%,color-mix(in_oklab,var(--background)_72%,transparent)_52%,transparent_92%)]" />
            <div className="grid-bg absolute inset-0 opacity-40" />
            <div className="relative px-6 py-14 sm:px-10 sm:py-20 lg:py-24">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/70 px-3 py-1 text-[10px] tracking-[0.22em] uppercase text-primary backdrop-blur">
                <span className="live-dot size-1.5 rounded-full bg-primary" /> On-chain talent exchange
              </div>
              <h1
                className="rise mt-5 max-w-2xl text-4xl leading-[0.98] font-extrabold sm:text-6xl"
                style={{ animationDelay: "60ms" }}
              >
                Invest in traders
                <br />
                <span className="gold-text italic">like stocks.</span>
              </h1>
              <p
                className="rise mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base"
                style={{ animationDelay: "120ms" }}
              >
                Their on-chain performance <span className="text-foreground">is</span> their share price. Good
                trades pump, blowups dump. Scout the next great degen before the timeline finds the wallet.
              </p>
              <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "180ms" }}>
                <Link
                  to="/market"
                  className="glow sheen group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-xs font-extrabold tracking-[0.18em] uppercase text-primary-foreground transition-all hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]"
                >
                  Open the market
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <ConnectWalletButton />
              </div>
            </div>
          </section>

          {/* index metrics strip */}
          <section className="rise panel overflow-hidden" style={{ animationDelay: "220ms" }}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-4 py-2.5">
              <span className="text-[10px] tracking-[0.22em] uppercase text-foreground">The index</span>
              <span className="num text-[10px] tracking-widest text-muted-foreground">
                {KOLS.length} TRADERS LISTED · PRICED ON ON-CHAIN PERFORMANCE
              </span>
              <Link
                to="/market"
                className="num ml-auto text-[10px] tracking-widest uppercase text-primary hover:underline"
              >
                Browse market ↗
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
              {[
                ["Index market cap", `$${(totalCap / 1_000_000).toFixed(2)}M`, "all listed traders"],
                ["Session volume", `$${(totalVol / 1_000).toFixed(0)}K`, "shares traded today"],
                ["Avg index win rate", `${avgWin}%`, "across all listings"],
                ["Best 24h", fmtPct(top[0]?.change24h ?? 0), `$${top[0]?.ticker ?? "—"} leading`],
              ].map(([label, value, sub]) => (
                <div key={label} className="bg-card px-4 py-4">
                  <p className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">{label}</p>
                  <p className="num mt-1 text-2xl font-semibold">{value}</p>
                  <p className="mt-0.5 text-[10px] tracking-wider uppercase text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>
          </section>

        </main>

        {/* right rail */}
        <aside className="rise order-3 space-y-4" style={{ animationDelay: "140ms" }}>
          <div className="panel overflow-hidden">
            <div className="border-b border-border px-3 py-2.5 text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
              How a trade happens
            </div>
            {STEPS.map((s) => (
              <div key={s.n} className="border-b border-border/60 px-4 py-3.5 last:border-0">
                <p className="flex items-baseline gap-2 text-sm font-semibold">
                  <span className="num text-[10px] text-primary">{s.n}</span>
                  {s.title}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="panel px-4 py-4">
            <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Next reprice</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Every trader's book is scored once a day. Winning sessions mark their stock up at the close, losing
              sessions mark it down — that's the whole game.
            </p>
          </div>

        </aside>
      </div>

      <TickerTape />

      <section className="mx-auto max-w-[110rem] px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead kicker="Top movers" title="Who's running today" />
          <Link to="/market" className="num text-xs tracking-widest uppercase text-primary hover:underline">
            View all markets →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {top.map((k, i) => (
            <KolCard key={k.id} kol={k} price={prices[k.id] ?? k.price} index={i} />
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-[110rem] px-4 py-16 sm:px-6">
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
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-bold sm:text-5xl">Talent is the only asset that compounds.</h2>
          <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground">
            Stop chasing the coin. Buy the operator behind it — before the rest of the timeline figures out who
            they are.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              to="/market"
              className="glow sheen inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-bold tracking-widest uppercase text-primary-foreground transition-all hover:brightness-110"
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
