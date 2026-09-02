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
import {
  fetchBackingPerShareWad,
  sharesForBudget,
  quoteSell,
  fetchTraderEscrow,
  claimTraderFees,
} from "@/lib/evm/market";
import { useEvmWallet } from "@/lib/evm/wallet-provider";
import { getPublicClient, ethToWei, weiToEth } from "@/lib/evm/chain";

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
    breakdown,
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

  // Quotes come from the contract, not from price * amount: shares sit on a
  // bonding curve, so each one costs more than the last and a flat
  // multiplication is always wrong. Falls back to a rough flat estimate only
  // when the listing isn't on-chain yet and there's nothing to quote against.
  const [quotedShares, setQuotedShares] = useState<number | null>(null);
  const [quotedProceeds, setQuotedProceeds] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const client = getPublicClient();
    const run = async () => {
      if (amt <= 0) {
        if (alive) {
          setQuotedShares(null);
          setQuotedProceeds(null);
        }
        return;
      }
      try {
        if (side === "buy") {
          const n = await sharesForBudget(client, kol.wallet as Address, ethToWei(amt));
          if (alive) setQuotedShares(Number(n));
        } else {
          const out = await quoteSell(client, kol.wallet as Address, BigInt(Math.floor(amt)));
          if (alive) setQuotedProceeds(weiToEth(out));
        }
      } catch {
        if (alive) {
          setQuotedShares(null);
          setQuotedProceeds(null);
        }
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [amt, side, kol.wallet]);

  const derivedShares =
    quotedShares ?? (price > 0 ? Math.floor((amt * nativePriceUsd) / price) : 0);
  const sellProceedsNative = quotedProceeds ?? (amt * price) / nativePriceUsd;

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
            {kol.x && kol.handle ? (
              <a
                href={kol.x}
                target="_blank"
                rel="noreferrer"
                className="text-gold-light hover:underline"
              >
                {kol.handle}
              </a>
            ) : kol.handle ? (
              <span className="text-muted-foreground">{kol.handle}</span>
            ) : null}
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

          <TraderEscrowPanel kol={kol} />

          <ScoreBreakdownPanel
            ticker={kol.ticker}
            score={liveScore}
            breakdown={breakdown}
            trades={trades}
          />
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
              <Row label="Price / share now" value={fmtUsd(price)} />
              <Row
                label="Backing / share"
                value={backingUsd != null ? fmtUsd(backingUsd) : "—"}
              />
              {side === "buy" ? (
                <>
                  <Row label="Shares you'll get" value={derivedShares.toLocaleString()} />
                  <Row label="Fee (2%)" value={`${(amt * 0.02).toFixed(4)} ETH`} />
                  <Row label="ETH balance" value={`${nativeBalance.toFixed(3)} ETH`} />
                </>
              ) : (
                <>
                  <Row label="You'll receive" value={`${sellProceedsNative.toFixed(4)} ETH`} />
                  <Row label="Fee (2%)" value="included above" />
                  <Row label="Your shares" value={maxSell.toLocaleString()} />
                </>
              )}
              <Row label="Session" value={marketOpen ? "OPEN" : "CLOSED"} />
            </dl>

            <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
              {side === "buy" ? (
                <>
                  <p>
                    <b className="text-foreground">Each share costs more than the last.</b> Shares
                    sit on a curve, so buying pushes the price up as you go — the number above is
                    the exact fill for this amount, not an average.
                  </p>
                  <p>
                    <b className="text-foreground">You can always sell back.</b> The listing's
                    reserve is what you and every other buyer paid in, and it always covers a sell
                    at the curve price. There's no scenario where a sell can't be paid.
                  </p>
                  <p>
                    A round trip costs about <b className="text-foreground">4%</b> (2% in, 2% out)
                    before the price moves at all. Those fees stay in this listing's own reserve —
                    the house takes nothing — and they're what lets a rising score lift the price.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <b className="text-foreground">You're paid the full curve price.</b> Selling
                    walks back down the same curve you bought on. The figure above is what actually
                    lands in your wallet, not an estimate that can be cut short.
                  </p>
                  <p>
                    Selling reduces the supply, so the price steps down for whoever holds next —
                    the same way your buy stepped it up.
                  </p>
                </>
              )}
            </div>

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
            <p className="text-[10px] tracking-widest uppercase text-muted-foreground">
              How ${kol.ticker} is priced
            </p>
            <ol className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <li>
                <b className="text-foreground">1 · The score.</b> {kol.name}'s wallet is read
                straight off Robinhood Chain — realized PnL, win rate, volume, trade count — and
                ranked against every other listed trader. That produces the perf score of{" "}
                <b className="text-foreground">{liveScore}</b> above. It's relative, so it falls
                when they slip against the field, not just when they lose money.
              </li>
              <li>
                <b className="text-foreground">2 · The score sets the multiplier.</b> A score of 50
                is neutral (1×). Higher lifts the whole curve, lower drops it. The score itself
                moves at most 25% toward its new target per update, so one good day can't reprice
                the listing.
              </li>
              <li>
                <b className="text-foreground">3 · The curve sets the price.</b> On top of that,
                each share costs more than the one before it. Buying walks the price up, selling
                walks it back down — and because every share bought is held in this listing's own
                reserve, a sell can always be paid in full.
              </li>
              <li>
                <b className="text-foreground">4 · Price can lag the score.</b> A score rise only
                lifts the price as far as the reserve can actually back. A trader who's performing
                but barely traded will show a high score and a price still catching up — that gap
                is real, and shown rather than hidden.
              </li>
            </ol>
            <p className="mt-3 border-t border-border pt-2.5 text-[10px] text-muted-foreground">
              Market cap is price × the 10,000,000 share cap, so it moves in lockstep with price —
              it isn't a measure of money actually in the listing. That's{" "}
              <b className="text-foreground">backing / share</b> in the trade panel.
            </p>
          </div>

          {/* Holder count intentionally removed: `kol.holders` was hardcoded 0
              for every listing and nothing ever updated it, so the panel
              displayed a fake measurement. Share balances live in a Solidity
              mapping, which isn't enumerable, so a real count needs the
              Bought/Sold events indexed first — bring this back then. */}

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

/**
 * Escrow panel — fees accrued to the listed trader, claimable by that wallet.
 *
 * The wallet-native version of the "unclaimed" pattern: because a listing IS
 * an address, proving you're the trader is just signing from it. No handle
 * verification, no review queue — the connected wallet either matches or it
 * doesn't.
 */
function TraderEscrowPanel({ kol }: { kol: ReturnType<typeof getKol> & {} }) {
  const { nativePriceUsd } = useMarket();
  const { address, connected, walletClient } = useEvmWallet();
  const [owedWei, setOwedWei] = useState<bigint>(0n);
  const [claiming, setClaiming] = useState(false);

  const isTrader =
    connected && !!address && address.toLowerCase() === kol.wallet.toLowerCase();

  useEffect(() => {
    let alive = true;
    const client = getPublicClient();
    const pull = async () => {
      const owed = await fetchTraderEscrow(client, kol.wallet as Address);
      if (alive) setOwedWei(owed);
    };
    pull();
    const t = setInterval(pull, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [kol.wallet]);

  const owedUsd = weiToEth(owedWei) * nativePriceUsd;

  async function claim() {
    if (!walletClient || !address) return;
    setClaiming(true);
    try {
      await claimTraderFees(walletClient, address);
      toast.success("Claimed", { description: `${weiToEth(owedWei).toFixed(5)} ETH sent` });
      setOwedWei(0n);
    } catch (e) {
      toast.error(describeTradeError(e));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="panel mt-6 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-gold-light/40 px-2 py-0.5 text-[9px] tracking-widest uppercase text-gold-light">
          {isTrader ? "This is your wallet" : "Unclaimed"}
        </span>
        <p className="text-sm font-semibold">
          {isTrader ? `You're the trader behind $${kol.ticker}` : `Earning for ${kol.name}`}
        </p>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        A share of every trade on this listing accrues to{" "}
        <span className="num text-foreground">{shortWallet(kol.wallet)}</span> — the wallet the
        listing tracks. The protocol can't take it and traders can't take it. It pays out in full
        the moment that wallet claims it, and claiming is just signing a transaction from it: no
        verification, no application, nothing to prove.
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-3">
        <div>
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground">
            Waiting in escrow
          </p>
          <p className="num mt-1 text-2xl font-bold">{fmtUsd(owedUsd)}</p>
          <p className="num text-[10px] text-muted-foreground">
            {weiToEth(owedWei).toFixed(6)} ETH
          </p>
        </div>

        {isTrader ? (
          <button
            onClick={claim}
            disabled={claiming || owedWei === 0n}
            className="rounded-md bg-primary px-4 py-2.5 text-[11px] font-bold tracking-widest uppercase text-primary-foreground transition-all disabled:opacity-40 hover:brightness-110"
          >
            {claiming ? "Claiming…" : owedWei === 0n ? "Nothing to claim" : "Claim"}
          </button>
        ) : (
          kol.x && (
            <a
              href={kol.x}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-input px-4 py-2.5 text-[11px] font-bold tracking-widest uppercase text-foreground hover:bg-accent"
            >
              Open on X
            </a>
          )
        )}
      </div>

      {!isTrader && (
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          If this is your wallet, connect it and the claim button appears here. Nothing expires —
          it keeps accruing whether or not anyone ever turns up for it.
        </p>
      )}
    </div>
  );
}

/**
 * "Why this score" — the four percentile components the score is actually
 * blended from, plus how much of that blend survived small-sample shrinkage.
 * oracle/score.ts computes these and calls them the transparent why panel;
 * this is that panel. Without it the headline score is a number with no
 * visible reasoning, which is a bad look for a product whose entire pitch is
 * that price is earned rather than speculated.
 */
function ScoreBreakdownPanel({
  ticker,
  score,
  breakdown,
  trades,
}: {
  ticker: string;
  score: number;
  breakdown:
    | { pnlPct: number; winPct: number; volPct: number; tradesPct: number; confidence: number }
    | undefined;
  trades: number | undefined;
}) {
  const parts = breakdown
    ? ([
        ["Realized PnL", breakdown.pnlPct, 50],
        ["Win rate", breakdown.winPct, 20],
        ["Volume", breakdown.volPct, 15],
        ["Trade count", breakdown.tradesPct, 15],
      ] as const)
    : [];

  return (
    <div className="panel mt-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] tracking-widest uppercase text-muted-foreground">
          Why ${ticker} scores {score}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Ranked against every other listed trader
        </p>
      </div>

      {!breakdown ? (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          No scored data for this trader yet. Every listing starts at the neutral 50 and only
          diverges once the oracle has indexed real post-launch trading — so a 50 here means
          "nothing measured", not "measured as average".
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            {parts.map(([label, pct, weight]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-foreground">
                    {label}{" "}
                    <span className="text-[10px] text-muted-foreground">{weight}% of score</span>
                  </span>
                  <span className="num text-muted-foreground">
                    {Math.round(pct * 100)}
                    <span className="text-[10px]">th pct</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(1, Math.min(100, pct * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            {breakdown.confidence < 0.5 ? (
              <p>
                <b className="text-foreground">
                  Only {Math.round(breakdown.confidence * 100)}% of this blend is being applied.
                </b>{" "}
                With {trades ?? "few"} recorded trades there isn't enough of a sample to trust the
                ranking yet, so the score is pulled toward the neutral 50. It moves toward the true
                percentile as the record builds — one good trade can't buy a high score.
              </p>
            ) : (
              <p>
                {Math.round(breakdown.confidence * 100)}% of this blend is being applied — enough
                trades on record for the ranking to be taken close to face value. The remainder is
                held back toward neutral until the sample grows further.
              </p>
            )}
          </div>
        </>
      )}
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
