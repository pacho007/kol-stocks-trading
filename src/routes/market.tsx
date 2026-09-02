import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import { KolCard } from "@/components/kol-card";
import { AvatarMark } from "@/components/avatar-mark";
import { LivePrice } from "@/components/live-price";
import { Sparkline } from "@/components/sparkline";
import { TickerTape } from "@/components/ticker-tape";
import { Link } from "@tanstack/react-router";
import { KOLS, fmtCompact, fmtPct } from "@/lib/kols";
import { useMarket, useLiveMetrics } from "@/lib/market-store";

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "Market · All Listed Traders | SHARPS" },
      {
        name: "description",
        content:
          "Browse every trader listed on SHARPS. Live share price, 24h change, market cap and volume for each on-chain KOL.",
      },
      { property: "og:title", content: "Market · All Listed Traders | SHARPS" },
      {
        property: "og:description",
        content: "Live prices, gainers, losers and volume across all listed on-chain traders.",
      },
    ],
  }),
  component: Market,
});

const SORTS = [
  { id: "cap", label: "Market cap" },
  { id: "price", label: "Price" },
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "volume", label: "24h volume" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

function Market() {
  const { prices, metrics } = useMarket();
  const { changePct, marketCapUsd, volumeUsd24h } = useLiveMetrics();
  const [sort, setSort] = useState<SortId>("cap");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const filtered = KOLS.filter(
      (k) =>
        k.ticker.toLowerCase().includes(q.toLowerCase()) ||
        k.name.toLowerCase().includes(q.toLowerCase()) ||
        k.wallet.toLowerCase().includes(q.toLowerCase()) ||
        k.handle.toLowerCase().includes(q.toLowerCase()),
    );
    const s = [...filtered];
    if (sort === "cap") s.sort((a, b) => (marketCapUsd[b.id] ?? 0) - (marketCapUsd[a.id] ?? 0));
    if (sort === "price") s.sort((a, b) => b.price - a.price);
    if (sort === "gainers") s.sort((a, b) => (changePct[b.id] ?? 0) - (changePct[a.id] ?? 0));
    if (sort === "losers") s.sort((a, b) => (changePct[a.id] ?? 0) - (changePct[b.id] ?? 0));
    if (sort === "volume") s.sort((a, b) => (volumeUsd24h[b.id] ?? 0) - (volumeUsd24h[a.id] ?? 0));
    return s;
  }, [sort, q]);

  return (
    <div>
      <TickerTape />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="num text-[10px] tracking-[0.3em] uppercase text-primary">All markets</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">The Trader Index</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {KOLS.length} verified wallets listed. Prices update every few seconds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/70 px-3 py-2">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search ticker or handle"
                className="num w-44 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex rounded-lg border border-border bg-surface/70 p-0.5">
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-label={v}
                  className={`rounded-sm p-1.5 transition-colors ${
                    view === v ? "bg-secondary text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {v === "grid" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`rounded-md border px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase transition-all ${
                sort === s.id
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {view === "grid" ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((k, i) => (
              <KolCard key={k.id} kol={k} price={prices[k.id] ?? k.price} index={i} />
            ))}
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto panel">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-border bg-surface/60 text-left">
                  {["Trader", "Price", "24h", "Market cap", "24h volume", "Chart"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-[10px] font-medium tracking-widest uppercase text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => {
                  const up = (changePct[k.id] ?? 0) >= 0;
                  return (
                    <tr
                      key={k.id}
                      className="border-b border-border/70 bg-card last:border-0 hover:bg-surface"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to="/kol/$id"
                          params={{ id: k.id }}
                          className="flex items-center gap-3"
                        >
                          <AvatarMark
                            gradient={k.avatar}
                            label={k.ticker}
                            src={k.image}
                            size={32}
                          />
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
                        {fmtPct(changePct[k.id] ?? 0)}
                      </td>
                      <td className="num px-4 py-3 text-sm text-muted-foreground">
                        {fmtCompact(marketCapUsd[k.id] ?? 0)}
                      </td>
                      <td className="num px-4 py-3 text-sm text-muted-foreground">
                        {metrics[k.id] ? `${metrics[k.id]!.volumeEth.toFixed(1)} ETH` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Sparkline data={k.series} up={up} className="h-8 w-32" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
