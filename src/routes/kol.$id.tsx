import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { AvatarMark } from "@/components/avatar-mark";
import { LivePrice } from "@/components/live-price";
import { PriceChart } from "@/components/price-chart";
import { ConnectWalletButton } from "@/components/site-header";
import { getKol, fmtCompact, fmtPct, fmtUsd, perfScore } from "@/lib/kols";
import { useMarket } from "@/lib/market-store";

export const Route = createFileRoute("/kol/$id")({
  loader: ({ params }) => {
    const kol = getKol(params.id);
    if (!kol) throw notFound();
    return { name: kol.name, ticker: kol.ticker, bio: kol.bio };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Trader unavailable | SHARPS" }, { name: "robots", content: "noindex" }] };
    }
    const title = `$${loaderData.ticker} · ${loaderData.name} — Trader Stock | SHARPS`;
    return {
      meta: [
        { title },
        { name: "description", content: loaderData.bio },
        { property: "og:title", content: title },
        { property: "og:description", content: loaderData.bio },
      ],
    };
  },
  component: KolDetail,
});

function KolDetail() {
  const { id } = Route.useParams();
  const kol = getKol(id)!;
  const { prices, connected, cash, positions, buy, sell } = useMarket();
  const price = prices[kol.id] ?? kol.price;
  const up = kol.change24h >= 0;
  const position = positions.find((p) => p.id === kol.id);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("5");

  const shares = Math.max(0, Number(amount) || 0);
  const cost = shares * price;
  const maxSell = position?.shares ?? 0;
  const canSubmit =
    connected && shares > 0 && (side === "buy" ? cost <= cash : shares <= maxSell + 1e-9);

  function submit(): void {
    if (!connected) {
      toast.error("Connect a wallet first");
      return;
    }
    if (shares <= 0) {
      toast.error("Enter a share amount");
      return;
    }
    if (side === "buy") {
      if (cost > cash) {
        toast.error("Insufficient demo balance");
        return;
      }
      buy(kol.id, shares);
      toast.success(`Filled: bought ${shares} $${kol.ticker}`, { description: `@ ${fmtUsd(price)}` });
    } else {
      if (shares > maxSell) {
        toast.error(`You only hold ${maxSell} shares`);
        return;
      }
      sell(kol.id, shares);
      toast.success(`Filled: sold ${shares} $${kol.ticker}`, { description: `@ ${fmtUsd(price)}` });
    }
  }

  const stats = [
    ["Win rate", `${kol.winRate}%`],
    ["30d PnL", fmtCompact(kol.pnl30d)],
    ["30d trades", String(kol.trades30d)],
    ["Avg hold", kol.avgHold],
    ["24h volume", fmtCompact(kol.volume24h)],
    ["Market cap", fmtCompact(kol.marketCap)],
    ["Perf score", String(perfScore(kol))],
    ["Chain", kol.chain],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link
        to="/market"
        className="num inline-flex items-center gap-2 text-[10px] tracking-widest uppercase text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to market
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <AvatarMark gradient={kol.avatar} label={kol.ticker} size={64} />
        <div>
          <div className="flex items-center gap-3">
            <h1 className="num text-2xl font-bold tracking-widest">${kol.ticker}</h1>
            <span className="rounded-sm border border-border px-2 py-0.5 text-[9px] tracking-widest uppercase text-muted-foreground">
              {kol.chain}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {kol.name} · {kol.handle}
          </p>
        </div>
        <div className="ml-auto text-right">
          <LivePrice value={price} className="text-3xl font-bold" />
          <p className={`num text-sm ${up ? "text-up" : "text-down"}`}>
            {fmtPct(kol.change24h)} <span className="text-muted-foreground">24h</span>
          </p>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{kol.bio}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rise overflow-hidden panel">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="num text-[10px] tracking-widest uppercase text-muted-foreground">
              Share price · 90h
            </p>
            <div className="flex items-center gap-2">
              <span className="live-dot size-1.5 rounded-full bg-up" />
              <span className="num text-[10px] tracking-widest uppercase text-muted-foreground">
                Live
              </span>
            </div>
          </div>
          <div className="p-2">
            <PriceChart data={kol.series} up={up} />
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="bg-card px-4 py-3">
                <p className="text-[10px] tracking-widest uppercase text-muted-foreground">{label}</p>
                <p className="num mt-0.5 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rise flex flex-col gap-4" style={{ animationDelay: "90ms" }}>
          <div className="panel p-4">
            <div className="flex rounded-lg border border-border p-0.5">
              {(["buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`flex-1 rounded-sm py-2 text-[10px] font-bold tracking-widest uppercase transition-colors ${
                    side === s
                      ? s === "buy"
                        ? "bg-up/15 text-up"
                        : "bg-down/15 text-down"
                      : "text-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-[10px] tracking-widest uppercase text-muted-foreground">
              Shares
            </label>
            <input
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="num mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-lg outline-none focus:border-primary/60"
            />
            <div className="mt-2 flex gap-1.5">
              {[1, 5, 10, 25].map((n) => (
                <button
                  key={n}
                  onClick={() => setAmount(String(n))}
                  className="num flex-1 rounded-sm border border-border py-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {n}
                </button>
              ))}
            </div>

            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs">
              <Row label="Price" value={fmtUsd(price)} />
              <Row label={side === "buy" ? "Total cost" : "Proceeds"} value={fmtUsd(cost)} />
              <Row label="Demo balance" value={fmtUsd(cash)} />
              <Row label="Your shares" value={maxSell.toFixed(2)} />
            </dl>

            {connected ? (
              <button
                onClick={submit}
                disabled={!canSubmit}
                className={`mt-4 w-full rounded-md py-3 text-[11px] font-bold tracking-widest uppercase transition-all disabled:opacity-40 ${
                  side === "buy"
                    ? "bg-up text-background hover:brightness-110"
                    : "bg-down text-background hover:brightness-110"
                }`}
              >
                {side === "buy" ? `Buy $${kol.ticker}` : `Sell $${kol.ticker}`}
              </button>
            ) : (
              <div className="mt-4">
                <ConnectWalletButton full />
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Simulated order book. No real transactions.
                </p>
              </div>
            )}
          </div>

          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <p className="text-[10px] tracking-widest uppercase text-muted-foreground">Holders</p>
            </div>
            <p className="num mt-2 text-2xl font-bold">{kol.holders.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Wallets currently long ${kol.ticker}.
            </p>
          </div>

          {position && (
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
              <p className="text-[10px] tracking-widest uppercase text-muted-foreground">
                Your position
              </p>
              <dl className="mt-2 space-y-1.5 text-xs">
                <Row label="Shares" value={position.shares.toFixed(2)} />
                <Row label="Avg entry" value={fmtUsd(position.entry)} />
                <Row label="Value" value={fmtUsd(position.shares * price)} />
                <Row
                  label="Unrealized P&L"
                  value={fmtUsd((price - position.entry) * position.shares)}
                  tone={price >= position.entry ? "up" : "down"}
                />
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`num ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}
