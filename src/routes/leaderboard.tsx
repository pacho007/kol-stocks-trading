import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AvatarMark } from "@/components/avatar-mark";
import { LivePrice } from "@/components/live-price";
import { Sparkline } from "@/components/sparkline";
import { KOLS, fmtCompact, fmtPct, perfScore } from "@/lib/kols";
import { useMarket } from "@/lib/market-store";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard · Top Traders by Market Cap | SHARPS" },
      {
        name: "description",
        content:
          "The SHARPS leaderboard ranks every listed on-chain trader by market cap and by performance score across win rate, PnL and volume.",
      },
      { property: "og:title", content: "Leaderboard · Top Traders | SHARPS" },
      {
        property: "og:description",
        content: "Ranked by market cap and performance score. The tape doesn't lie.",
      },
    ],
  }),
  component: Leaderboard,
});

function Leaderboard() {
  const { prices } = useMarket();
  const [mode, setMode] = useState<"cap" | "score">("cap");
  const rows = [...KOLS].sort((a, b) =>
    mode === "cap" ? b.marketCap - a.marketCap : perfScore(b) - perfScore(a),
  );
  const podium = rows.slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <p className="num text-[10px] tracking-[0.3em] uppercase text-primary">Standings</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Leaderboard</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Performance score blends win rate, 30d realized PnL, trade count and 24h move. No votes, no
        vibes, just the tape.
      </p>

      <div className="mt-6 inline-flex rounded-lg border border-border bg-surface/70 p-0.5">
        {(
          [
            ["cap", "By market cap"],
            ["score", "By performance"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`rounded-sm px-4 py-2 text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              mode === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {podium.map((k, i) => (
          <Link
            key={k.id}
            to="/kol/$id"
            params={{ id: k.id }}
            className="rise relative overflow-hidden panel p-5 transition-all hover:-translate-y-1 hover:border-primary/50"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="num absolute top-3 right-4 text-5xl font-bold text-foreground/5">
              {i + 1}
            </span>
            <AvatarMark gradient={k.avatar} label={k.ticker} size={48} />
            <p className="num mt-4 text-lg font-bold tracking-widest">${k.ticker}</p>
            <p className="text-xs text-muted-foreground">{k.handle}</p>
            <div className="mt-4 flex items-end justify-between">
              <LivePrice value={prices[k.id] ?? k.price} className="text-xl font-semibold -ml-1" />
              <span className="num text-xs text-muted-foreground">
                {mode === "cap" ? fmtCompact(k.marketCap) : `${perfScore(k)} pts`}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 overflow-x-auto panel">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-border bg-surface/60 text-left">
              {["#", "Trader", "Price", "24h", "Win rate", "30d PnL", "Market cap", "Score", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-[10px] font-medium tracking-widest uppercase text-muted-foreground"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((k, i) => {
              const up = k.change24h >= 0;
              return (
                <tr key={k.id} className="border-b border-border/70 bg-card last:border-0 hover:bg-surface">
                  <td className="num px-4 py-3 text-sm text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link to="/kol/$id" params={{ id: k.id }} className="flex items-center gap-3">
                      <AvatarMark gradient={k.avatar} label={k.ticker} size={30} />
                      <div>
                        <p className="num text-sm font-bold tracking-widest">${k.ticker}</p>
                        <p className="text-xs text-muted-foreground">{k.handle}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <LivePrice value={prices[k.id] ?? k.price} className="text-sm" />
                  </td>
                  <td className={`num px-4 py-3 text-sm ${up ? "text-up" : "text-down"}`}>
                    {fmtPct(k.change24h)}
                  </td>
                  <td className="num px-4 py-3 text-sm">{k.winRate}%</td>
                  <td className={`num px-4 py-3 text-sm ${k.pnl30d >= 0 ? "text-up" : "text-down"}`}>
                    {fmtCompact(k.pnl30d)}
                  </td>
                  <td className="num px-4 py-3 text-sm text-muted-foreground">
                    {fmtCompact(k.marketCap)}
                  </td>
                  <td className="num px-4 py-3 text-sm font-semibold text-primary">{perfScore(k)}</td>
                  <td className="px-4 py-3">
                    <Sparkline data={k.series} up={up} className="h-8 w-24" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
