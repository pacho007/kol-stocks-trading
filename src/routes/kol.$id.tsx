import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import type { Address } from "viem";
import { AvatarMark } from "@/components/avatar-mark";
import { LivePrice } from "@/components/live-price";
import { PriceChart } from "@/components/price-chart";
import { ConnectWalletButton } from "@/components/site-header";
import { getKol, fmtCompact, fmtPct, fmtUsd, perfScore, shortWallet } from "@/lib/kols";
import { useMarket, useKolStats } from "@/lib/market-store";
import { fetchBackingPerShareWad } from "@/lib/evm/market";
import { getPublicClient } from "@/lib/evm/chain";

/** viem surfaces a contract revert's decoded reason on `shortMessage`;
 * anything else (a wallet rejection, a network error) falls back to its plain
 * message. */
function describeTradeError(e: unknown): string {
  const err = e as { shortMessage?: string } | undefined;
  if (err?.shortMessage) return err.shortMessage;
  if (e instanceof Error) return e.message;
  return "Trade failed";
}

export const Route = createFileRoute("/kol/$id")({
  loader: ({ params }) => {
    const kol = getKol(params.id);
    if (!kol) throw notFound();
    return { name: kol.name, ticker: kol.ticker, bio: kol.bio };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Trader unavailable | SHARPS" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `$${loaderData.ticker} · ${loaderData.name} · Trader Stock | SHARPS`;
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
  const {
    prices,
    connected,
    nativeBalance,
    nativePriceUsd,
    marketOpen,
    positions,
    buyWithNative,
    sell,
  } = useMarket();
  const price = prices[kol.id] ?? kol.price;
  const {
    score: liveScore,
    marketCapUsd: liveCap,
    changePct,
    winRate,
    realizedPnlSol,
    volumeSol,
    trades,
  } = useKolStats(kol.id);
  const up = changePct >= 0;
  const position = positions.find((p) => p.id === kol.id);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  // on BUY the amount is ETH to spend; on SELL it's shares to sell.
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState(false);

  // Backing per share — what a sell ACTUALLY pays once a listing is
  // undercollateralized (see SharpsMarket.sol's sell()). Shown alongside the
  // quoted price so a haircut is never a surprise.
  const [backingUsd, setBackingUsd] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const client = getPublicClient();
    const pull = async () => {
      try {
        const wad = await fetchBackingPerShareWad(client, kol.wallet as Address);
        if (!alive) return;
        // backingPerShareWad returns 0 when nothing is outstanding — that's
        // "no backing to report yet", not "backing is zero", so show "—".
        setBackingUsd(wad === 0n ? null : (Number(wad) / 1e18) * nativePriceUsd);
      } catch {
        if (alive) setBackingUsd(null);
      }
    };
    pull();
    const t = setInterval(pull, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [kol.wallet, nativePriceUsd]);

  const amt = Math.max(0, Number(amount) || 0);
  const maxSell = position?.shares ?? 0;

  // buy: spend `amt` ETH -> derive shares at current price (an ESTIMATE —
  // the actual fill, reported post-trade below, can differ slightly since
  // price genuinely moves on-chain between quote and confirm)
  const derivedShares = price > 0 ? Math.floor((amt * nativePriceUsd) / price) : 0;
  // sell: `amt` shares -> ETH proceeds at the QUOTED price — the actual
  // payout is min(this, pro-rata vault backing); see backingUsd above.
  const sellProceedsNative = (amt * price) / nativePriceUsd;

  const canSubmit =
    connected &&
    marketOpen &&
    !pending &&
    amt > 0 &&
    (side === "buy" ? amt <= nativeBalance && derivedShares > 0 : amt <= maxSell + 1e-9);

  async function submit(): Promise<void> {
    if (!connected) {
      toast.error("Connect a wallet first");
      return;
    }
    if (!marketOpen) {
      toast.error("Market is closed — trading resumes at the next session open");
      return;
    }
    if (amt <= 0) {
      toast.error(side === "buy" ? "Enter an amount of ETH" : "Enter a share amount");
      return;
    }
    setPending(true);
    try {
      if (side === "buy") {
        if (amt > nativeBalance) {
          toast.error("Insufficient ETH balance");
          return;
        }
        const result = await buyWithNative(kol.id, amt);
        toast.success(`Filled: bought ${result.shares.toLocaleString()} $${kol.ticker}`, {
          description: `${result.nativeSpent.toFixed(4)} ETH spent`,
        });
      } else {
        if (amt > maxSell) {
          toast.error(`You only hold ${maxSell.toLocaleString()} shares`);
          return;
        }
        const result = await sell(kol.id, amt);
        toast.success(`Filled: sold ${result.shares.toLocaleString()} $${kol.ticker}`, {
          description: `${result.nativeOut.toFixed(4)} ETH received`,
        });
      }
    } catch (e) {
      toast.error(describeTradeError(e));
    } finally {
      setPending(false);
    }
  }

  const stats = [
    ["Win rate", winRate != null ? `${Math.round(winRate * 100)}%` : "—"],
    ["PnL (ETH)", realizedPnlSol != null ? realizedPnlSol.toFixed(2) : "—"],
    ["Trades", trades != null ? String(trades) : "—"],
    ["Volume (ETH)", volumeSol != null ? volumeSol.toFixed(1) : "—"],
    ["Since open", fmtPct(changePct)],
    ["Market cap", fmtCompact(liveCap)],
    ["Perf score", String(liveScore)],
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
        <AvatarMark gradient={kol.avatar} label={kol.ticker} src={kol.image} size={64} />
        <div>
          <div className="flex items-center gap-3">
            <h1 className="num text-2xl font-bold tracking-widest">${kol.ticker}</h1>
            <span className="rounded-sm border border-border px-2 py-0.5 text-[9px] tracking-widest uppercase text-muted-foreground">
              {kol.chain}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{kol.name}</p>
          <div className="num mt-1 flex flex-wrap items-center gap-3 text-[10px] tracking-widest uppercase">
            {kol.x ? (
              <a
                href={kol.x}
                target="_blank"
                rel="noreferrer"
                className="text-gold-light hover:underline"
              >
                {kol.handle}
              </a>
            ) : (
              <span className="text-muted-foreground">{kol.handle}</span>
            )}
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(kol.wallet)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              title={kol.wallet}
            >
              {shortWallet(kol.wallet)}
            </button>
          </div>
        </div>
        <div className="ml-auto text-right">
          <LivePrice value={price} className="text-3xl font-bold" />
          <p className={`num text-sm ${up ? "text-up" : "text-down"}`}>
            {fmtPct(changePct)} <span className="text-muted-foreground">since open</span>
          </p>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{kol.bio}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rise overflow-hidden panel">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="num text-[10px] tracking-widest uppercase text-muted-foreground">
              Share price
            </p>
            <div className="flex items-center gap-2">
              <span className="live-dot size-1.5 rounded-full bg-up" />
              <span className="num text-[10px] tracking-widest uppercase text-muted-foreground">
                Live
              </span>
            </div>
          </div>
          <div className="p-2">
            <PriceChart id={kol.id} up={up} />
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="bg-card px-4 py-3">
                <p className="text-[10px] tracking-widest uppercase text-muted-foreground">
                  {label}
                </p>
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
              {side === "buy" ? "ETH to spend" : "Shares to sell"}
            </label>
            <input
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="num mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-lg outline-none focus:border-primary/60"
            />
            <div className="mt-2 flex gap-1.5">
              {(side === "buy" ? [0.5, 1, 5, 10] : [100, 1000, 10000, maxSell]).map((n, i) => (
                <button
                  key={i}
                  onClick={() => setAmount(String(Math.floor(n) === n ? n : n))}
                  className="num flex-1 rounded-sm border border-border py-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {side === "buy" ? n : i === 3 ? "MAX" : n.toLocaleString()}
                </button>
              ))}
            </div>

            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs">
              <Row label="Quoted price / share" value={fmtUsd(price)} />
              <Row
                label="Backing / share"
                value={backingUsd != null ? fmtUsd(backingUsd) : "—"}
                tone={backingUsd != null && backingUsd < price ? "down" : undefined}
              />
              {side === "buy" ? (
                <>
                  <Row label="Est. shares received" value={derivedShares.toLocaleString()} />
                  <Row label="ETH balance" value={`${nativeBalance.toFixed(3)} ETH`} />
                </>
              ) : (
                <>
                  <Row label="Est. ETH proceeds" value={`${sellProceedsNative.toFixed(3)} ETH`} />
                  <Row label="Your shares" value={maxSell.toLocaleString()} />
                </>
              )}
              <Row label="Session" value={marketOpen ? "OPEN" : "CLOSED"} />
            </dl>
            {backingUsd != null && backingUsd < price && (
              <p className="mt-2 text-[10px] text-down">
                This listing is undercollateralized — selling pays the lower backing value, not the
                quoted price.
              </p>
            )}

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
                {pending
                  ? "Confirming…"
                  : side === "buy"
                    ? `Buy $${kol.ticker}`
                    : `Sell $${kol.ticker}`}
              </button>
            ) : (
              <div className="mt-4">
                <ConnectWalletButton full />
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Real on-chain trade — you'll be asked to approve it in your wallet.
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
                <Row
                  label="Avg entry"
                  value={position.entry != null ? fmtUsd(position.entry) : "—"}
                />
                <Row label="Value" value={fmtUsd(position.shares * price)} />
                {position.entry != null ? (
                  <Row
                    label="Unrealized P&L"
                    value={fmtUsd((price - position.entry) * position.shares)}
                    tone={price >= position.entry ? "up" : "down"}
                  />
                ) : (
                  <Row label="Unrealized P&L" value="—" />
                )}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | undefined;
}) {
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
