import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Address } from "viem";
import { KOLS } from "./kols";
import { useMarketFeed } from "./market-feed";
import { OPEN_PRICE_USD, scoreToPriceUsd } from "./pricing";
import { sessionState } from "./sessions";
import { getPublicClient, weiToEth, ethToWei, MARKET_ADDRESS } from "./evm/chain";
import { useEvmWallet } from "./evm/wallet-provider";
import {
  fetchListings,
  fetchShareBalances,
  sharesForBudget,
  quoteSell,
  buy as buyOnChain,
  sell as sellOnChain,
  type OnChainListing,
} from "./evm/market";

/**
 * Real-money market store, on Robinhood Chain. Trading is genuinely on-chain
 * (see evm/src/SharpsMarket.sol) — buy()/sell() sign and send real
 * transactions, positions come from the contract's own share ledger, and
 * price is read from each listing's on-chain state, not recomputed
 * client-side.
 *
 * Pricing is a bonding curve scaled by the trader's score. The reserve is held
 * equal to the curve's value of all outstanding shares, so a sell is always
 * payable in full — quotes come from the contract (quoteBuy/quoteSell/
 * sharesForBudget), never from price * amount, which the curve makes wrong.
 *
 * Before a listing has been created on-chain (mid-rollout — see
 * oracle/push-onchain-evm.ts and the createListing admin script), there is
 * nothing to trade against it. `prices` falls back to an ESTIMATED
 * display-only price (scoreToPriceUsd) for those listings only; buy()/sell()
 * will revert against the contract for anything not yet listed.
 *
 * Chart history does NOT come from this store's own polling — it comes from
 * the shared feed (lib/market-feed.tsx), so every trader sees the same chart.
 */

/**
 * The percentile components behind a score, plus how much of that raw blend
 * actually landed after small-sample shrinkage. Computed by oracle/score.ts
 * and published in scores.json — this is what the "why this score" panel on a
 * listing page renders, so the headline number isn't unexplained.
 */
export type ScoreBreakdown = {
  pnlPct: number;
  winPct: number;
  volPct: number;
  tradesPct: number;
  confidence: number;
};

export type Position = { id: string; shares: number; entry: number | null };
export type PricePoint = { t: number; p: number };
/** One closed position — the evidence behind a score, not an input to it. */
export type ClosedTrade = {
  symbol: string;
  /** Realized PnL for this close, in the native token. */
  pnl: number;
  proceeds: number;
  ts: number;
  /** proceeds / cost basis; null when there was no recorded basis. */
  multiple: number | null;
};

export type KolMetrics = {
  /** Realized PnL over the scoring window, in the chain's native token. */
  realizedPnlEth: number;
  winRate: number;
  /** Traded volume over the scoring window, in the chain's native token. */
  volumeEth: number;
  trades: number;
  topWins?: ClosedTrade[];
  topLosses?: ClosedTrade[];
};
export type Trade = {
  id: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  /** Native-token amount moved by this fill. */
  native: number;
  at: number;
  signature: string;
};

type Ctx = {
  prices: Record<string, number>;
  scores: Record<string, number>;
  history: Record<string, PricePoint[]>;
  metrics: Record<string, KolMetrics>;
  breakdowns: Record<string, ScoreBreakdown>;
  onChainListings: Record<string, OnChainListing>;
  backingPerShare: Record<string, number>;
  live: boolean;
  connected: boolean;
  connecting: boolean;
  wrongChain: boolean;
  marketOpen: boolean;
  /** Connected wallet's native-token balance. */
  nativeBalance: number;
  /** USD price of the chain's native token, for display conversion. */
  nativePriceUsd: number;
  lastUpdated: string | null;
  positions: Position[];
  trades: Trade[];
  connect: () => void;
  disconnect: () => void;
  switchChain: () => void;
  buyWithNative: (
    id: string,
    nativeIn: number,
  ) => Promise<{ shares: number; nativeSpent: number; signature: string }>;
  sell: (
    id: string,
    shares: number,
  ) => Promise<{ shares: number; nativeOut: number; signature: string }>;
  reset: () => void;
};

/**
 * Static ETH/USD estimate for display conversion only — never used to size or
 * settle a trade (the contract prices everything in wei). Same rough
 * approximation the Solana build made with SOL_PRICE_USD; replace with a real
 * price feed (Chainlink is available on Robinhood Chain) before treating any
 * USD figure here as authoritative.
 */
const NATIVE_PRICE_USD = 2500;

const MarketCtx = createContext<Ctx | null>(null);

// Everyone starts fresh at the neutral score (50 => the open price). Nobody is
// priced up or down until the oracle feed reports real post-launch performance.
const SEED_SCORES: Record<string, number> = Object.fromEntries(KOLS.map((k) => [k.id, 50]));

/** Listings addressed by their KOL wallet — no PDA derivation needed on EVM. */
const KOL_WALLETS: { id: string; wallet: Address }[] = KOLS.map((k) => ({
  id: k.id,
  wallet: k.wallet as Address,
}));

export function MarketProvider({ children }: { children: ReactNode }) {
  const {
    address,
    connected,
    connecting,
    wrongChain,
    walletClient,
    connect: walletConnect,
    disconnect: walletDisconnect,
    switchChain,
  } = useEvmWallet();

  const [scores, setScores] = useState<Record<string, number>>(SEED_SCORES);
  const [localMetrics, setMetrics] = useState<Record<string, KolMetrics>>({});
  const [localBreakdowns, setBreakdowns] = useState<Record<string, ScoreBreakdown>>({});
  const [onChainListings, setOnChainListings] = useState<Record<string, OnChainListing>>({});
  const [nativeBalance, setNativeBalance] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [live, setLive] = useState(false);
  const [marketOpen, setMarketOpen] = useState(true);
  const [nativePriceUsd, setNativePriceUsd] = useState(NATIVE_PRICE_USD);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const nativePriceRef = useRef(NATIVE_PRICE_USD);
  nativePriceRef.current = nativePriceUsd;

  const client = useMemo(() => getPublicClient(), []);

  useEffect(() => setLive(true), []);

  useEffect(() => {
    const tick = () => setMarketOpen(sessionState(new Date()).marketOpen);
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  // Connected wallet's native balance.
  useEffect(() => {
    if (!connected || !address) {
      setNativeBalance(0);
      return;
    }
    let alive = true;
    const refresh = async () => {
      try {
        const bal = await client.getBalance({ address });
        if (alive) setNativeBalance(weiToEth(bal));
      } catch {
        /* transient RPC error — next tick retries */
      }
    };
    refresh();
    const id = setInterval(refresh, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connected, address, client]);

  // Real positions — the contract's own share ledger for this wallet, read in
  // one multicall rather than the Solana build's per-token-account scan.
  // Cost basis isn't derivable from balances alone (needs a fills indexer),
  // so entry stays null until the Bought/Sold events are indexed.
  useEffect(() => {
    if (!connected || !address || !MARKET_ADDRESS) {
      setPositions([]);
      return;
    }
    let alive = true;
    const refresh = async () => {
      try {
        const balances = await fetchShareBalances(client, KOL_WALLETS, address);
        if (!alive) return;
        setPositions(
          Object.entries(balances).map(([id, shares]) => ({
            id,
            shares: Number(shares),
            entry: null,
          })),
        );
      } catch {
        /* transient RPC error — next tick retries */
      }
    };
    refresh();
    const id = setInterval(refresh, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connected, address, client]);

  // REAL ORACLE FEED (display/breakdown data). Fetches scores.json published
  // by oracle/publish.ts. Falls back to seed scores if the file isn't there
  // yet, so the app works whether or not the indexer has run.
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch("/scores.json", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          rows: {
            id: string;
            score: number;
            metrics?: KolMetrics;
            breakdown?: ScoreBreakdown;
            confidence?: number;
          }[];
          nativePriceUsd?: number;
          solPriceUsd?: number;
          updatedAt?: string;
        };
        if (!alive || !Array.isArray(data.rows)) return;
        const nativeUsd = data.nativePriceUsd ?? data.solPriceUsd;
        if (typeof nativeUsd === "number" && nativeUsd > 0) setNativePriceUsd(nativeUsd);
        if (data.updatedAt) setLastUpdated(data.updatedAt);
        setScores((prev) => {
          const next = { ...prev };
          for (const r of data.rows) next[r.id] = r.score;
          return next;
        });
        setMetrics((prev) => {
          const next = { ...prev };
          for (const r of data.rows) {
            if (!r.metrics) continue;
            // These were realizedPnlSol/volumeSol before the move to Robinhood
            // Chain, and a scores.json published by an older oracle may still
            // be sitting in public/ or on a deployed build. Accept either
            // spelling rather than rendering "—" for PnL and volume until the
            // next oracle run, same as nativePriceUsd ?? solPriceUsd above.
            const m = r.metrics as KolMetrics & {
              realizedPnlSol?: number;
              volumeSol?: number;
            };
            next[r.id] = {
              ...m,
              realizedPnlEth: m.realizedPnlEth ?? m.realizedPnlSol ?? 0,
              volumeEth: m.volumeEth ?? m.volumeSol ?? 0,
            };
          }
          return next;
        });
        setBreakdowns((prev) => {
          const next = { ...prev };
          for (const r of data.rows) {
            if (r.breakdown) {
              next[r.id] = { ...r.breakdown, confidence: r.confidence ?? 1 };
            }
          }
          return next;
        });
      } catch {
        /* offline or file missing — keep current scores */
      }
    };
    pull();
    const id = setInterval(pull, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ON-CHAIN LISTING STATE — the actual tradable price/pool per listing, read
  // in a single multicall. Listings not yet created come back exists=false and
  // fall through to the display-estimate below.
  useEffect(() => {
    if (!MARKET_ADDRESS) return;
    let alive = true;
    const pull = async () => {
      try {
        const next = await fetchListings(client, KOL_WALLETS);
        if (alive) setOnChainListings(next);
      } catch {
        /* transient RPC error — stale data kept meanwhile */
      }
    };
    pull();
    const id = setInterval(pull, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [client]);

  // Shared feed is the preferred source of current price: it's what every
  // other trader is seeing at this moment. Direct chain reads are the
  // fallback when the feed isn't configured yet.
  const feed = useMarketFeed();

  const prices = useMemo(() => {
    const next: Record<string, number> = {};
    for (const k of KOLS) {
      const fromFeed = feed.listings[k.id];
      if (fromFeed) {
        next[k.id] = (Number(fromFeed.price_wei) / 1e18) * nativePriceRef.current;
        continue;
      }
      const onChain = onChainListings[k.id];
      if (onChain) {
        next[k.id] = weiToEth(onChain.priceWei) * nativePriceRef.current;
      } else {
        // not listed on-chain yet — display-only estimate, never used to trade.
        next[k.id] = scoreToPriceUsd(scores[k.id] ?? 50);
      }
    }
    return next;
    // nativePriceUsd is intentionally listed even though the body reads
    // nativePriceRef.current instead. The ref is what keeps the value current
    // without re-subscribing, but a ref read cannot trigger recomputation —
    // without this dep, every USD price would freeze at whatever the rate was
    // when the memo last ran. eslint sees an "unnecessary" dep; removing it
    // would silently stop the board updating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.listings, onChainListings, scores, nativePriceUsd]);

  /**
   * Metrics, preferring the shared feed over the local scores.json snapshot.
   *
   * Both sources carry the same numbers, but only one of them exists in
   * production: scores.json is generated and gitignored, so a deployed build
   * has no /scores.json to fetch and every panel below the price would be
   * empty. The feed is also the fair source — two people reading a listing get
   * the same row from Postgres, rather than whatever each browser last managed
   * to fetch.
   *
   * scores.json remains the fallback so the app is still fully usable with no
   * backend configured at all.
   */
  const metrics = useMemo<Record<string, KolMetrics>>(() => {
    if (!feed.configured) return localMetrics;
    const next: Record<string, KolMetrics> = { ...localMetrics };
    for (const [id, m] of Object.entries(feed.metrics)) {
      next[id] = {
        realizedPnlEth: m.realized_pnl_eth,
        volumeEth: m.volume_eth,
        winRate: m.win_rate,
        trades: m.trades,
        topWins: m.top_wins ?? [],
        topLosses: m.top_losses ?? [],
      };
    }
    return next;
  }, [feed.configured, feed.metrics, localMetrics]);

  const breakdowns = useMemo<Record<string, ScoreBreakdown>>(() => {
    if (!feed.configured) return localBreakdowns;
    const next: Record<string, ScoreBreakdown> = { ...localBreakdowns };
    for (const [id, m] of Object.entries(feed.metrics)) {
      const b = m.breakdown;
      if (!b) continue;
      next[id] = {
        pnlPct: b.pnlPct ?? 0.5,
        winPct: b.winPct ?? 0.5,
        volPct: b.volPct ?? 0.5,
        tradesPct: b.tradesPct ?? 0.5,
        confidence: m.confidence ?? 0,
      };
    }
    return next;
  }, [feed.configured, feed.metrics, localBreakdowns]);

  const backingPerShare = useMemo(() => {
    // Populated lazily by kol.$id.tsx via fetchBackingPerShareWad (a live read
    // per listing, not worth polling for all of them here).
    return {} as Record<string, number>;
  }, []);

  // PRICE HISTORY — comes from the shared feed (lib/market-feed.tsx), NOT from
  // this browser. Previously each client recorded its own snapshots into
  // localStorage every second, so two people looking at the same KOL saw
  // different charts and a new visitor saw a flat line until their session had
  // run long enough. The shared feed is written only by the indexer from
  // on-chain PriceUpdated events, so everyone charts identical data.
  const [localHistory, setLocalHistory] = useState<Record<string, PricePoint[]>>({});
  useEffect(() => {
    if (feed.configured) return;
    const record = () => {
      const now = Date.now();
      setLocalHistory((prev) => {
        const next: Record<string, PricePoint[]> = { ...prev };
        for (const k of KOLS) {
          const price = prices[k.id] ?? OPEN_PRICE_USD;
          const arr = next[k.id]?.slice() ?? [];
          arr.push({ t: now, p: price });
          if (arr.length > 4000) arr.splice(0, arr.length - 4000);
          next[k.id] = arr;
        }
        return next;
      });
    };
    record();
    const id = setInterval(record, 1000);
    return () => clearInterval(id);
  }, [prices, feed.configured]);

  const history = useMemo<Record<string, PricePoint[]>>(() => {
    if (!feed.configured) return localHistory;
    const next: Record<string, PricePoint[]> = {};
    for (const [id, points] of Object.entries(feed.history)) {
      // Shared feed prices are in the chain's native token; the UI charts USD.
      next[id] = points.map((pt) => ({ t: pt.t, p: pt.p * nativePriceRef.current }));
    }
    return next;
    // Same reasoning as `prices` above: the body converts through
    // nativePriceRef.current, so this dep is what makes the chart re-derive
    // when the USD rate moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.configured, feed.history, localHistory, nativePriceUsd]);

  /** Max tolerated adverse move between quote and confirm before the
   * transaction reverts instead of filling at a worse price. */
  const SLIPPAGE_TOLERANCE = 0.01;

  const buyWithNative = useCallback(
    async (
      id: string,
      nativeIn: number,
    ): Promise<{ shares: number; nativeSpent: number; signature: string }> => {
      if (!marketOpen) throw new Error("Market is closed");
      if (!connected || !address || !walletClient) throw new Error("Connect a wallet first");
      if (wrongChain) throw new Error("Wrong network — switch to Robinhood Chain");
      const entry = KOL_WALLETS.find((k) => k.id === id);
      if (!entry) throw new Error(`Unknown listing: ${id}`);

      const listing = onChainListings[id];
      if (!listing) throw new Error("This listing isn't live on-chain yet");

      const valueWei = ethToWei(nativeIn);
      // Ask the contract, don't divide by price: the curve makes each share
      // dearer than the last, so budget/price overestimates and would trip
      // the slippage guard on the way in.
      const expectedShares = await sharesForBudget(client, entry.wallet, valueWei);
      if (expectedShares === 0n) throw new Error("Amount is too small to buy a whole share");
      const minSharesOut =
        (expectedShares * BigInt(Math.floor((1 - SLIPPAGE_TOLERANCE) * 1000))) / 1000n;

      const balBefore = await client.getBalance({ address });
      const signature = await buyOnChain(
        walletClient,
        address,
        entry.wallet,
        valueWei,
        minSharesOut,
      );
      await client.waitForTransactionReceipt({ hash: signature });
      const balAfter = await client.getBalance({ address });

      // Actual executed cost (includes gas), not the pre-trade quote.
      const nativeSpent = Math.max(0, weiToEth(balBefore - balAfter));
      const shares = Number(expectedShares);

      setTrades((t) =>
        [
          {
            id,
            side: "buy" as const,
            shares,
            price: shares > 0 ? (nativeSpent / shares) * nativePriceRef.current : 0,
            native: nativeSpent,
            at: Date.now(),
            signature,
          },
          ...t,
        ].slice(0, 50),
      );
      return { shares, nativeSpent, signature };
    },
    [marketOpen, connected, address, walletClient, wrongChain, onChainListings, client],
  );

  const sell = useCallback(
    async (
      id: string,
      shares: number,
    ): Promise<{ shares: number; nativeOut: number; signature: string }> => {
      if (!marketOpen) throw new Error("Market is closed");
      if (!connected || !address || !walletClient) throw new Error("Connect a wallet first");
      if (wrongChain) throw new Error("Wrong network — switch to Robinhood Chain");
      const entry = KOL_WALLETS.find((k) => k.id === id);
      if (!entry) throw new Error(`Unknown listing: ${id}`);

      const listing = onChainListings[id];
      if (!listing) throw new Error("This listing isn't live on-chain yet");

      const sharesIn = BigInt(Math.floor(shares)); // whole shares only
      if (sharesIn <= 0n) throw new Error("Enter at least one whole share");
      // Curve price, not shares * spot: selling walks back DOWN the curve, so
      // each share fetches slightly less than the current marginal price.
      const quotedOut = await quoteSell(client, entry.wallet, sharesIn);
      const minWeiOut = (quotedOut * BigInt(Math.floor((1 - SLIPPAGE_TOLERANCE) * 1000))) / 1000n;

      const balBefore = await client.getBalance({ address });
      const signature = await sellOnChain(walletClient, address, entry.wallet, sharesIn, minWeiOut);
      await client.waitForTransactionReceipt({ hash: signature });
      const balAfter = await client.getBalance({ address });

      // Actual executed proceeds (net of gas) — can be less than
      // shares * quoted price if the listing was undercollateralized.
      const nativeOut = Math.max(0, weiToEth(balAfter - balBefore));

      setTrades((t) =>
        [
          {
            id,
            side: "sell" as const,
            shares: Number(sharesIn),
            price: shares > 0 ? (nativeOut / Number(sharesIn)) * nativePriceRef.current : 0,
            native: nativeOut,
            at: Date.now(),
            signature,
          },
          ...t,
        ].slice(0, 50),
      );
      return { shares: Number(sharesIn), nativeOut, signature };
    },
    [marketOpen, connected, address, walletClient, wrongChain, onChainListings, client],
  );

  const reset = useCallback(() => {
    // Nothing local left to wipe: the chain is the source of truth for
    // balances, and chart history now comes from the shared feed rather than
    // this browser. Only the unconfigured-fallback trace is local. The old
    // "sharps.history.v1" key is removed too, so anyone upgrading doesn't keep
    // a stale private chart sitting in their browser forever.
    setLocalHistory({});
    try {
      localStorage.removeItem("sharps.history.v1");
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      prices,
      scores,
      metrics,
      breakdowns,
      onChainListings,
      history,
      backingPerShare,
      live,
      connected,
      connecting,
      wrongChain,
      marketOpen,
      nativeBalance,
      nativePriceUsd,
      lastUpdated,
      positions,
      trades,
      connect: () => {
        walletConnect().catch(() => {
          /* user closed the wallet picker / rejected — nothing to do */
        });
      },
      disconnect: walletDisconnect,
      switchChain: () => {
        switchChain().catch(() => {});
      },
      buyWithNative,
      sell,
      reset,
    }),
    [
      prices,
      scores,
      metrics,
      breakdowns,
      onChainListings,
      history,
      backingPerShare,
      live,
      connected,
      connecting,
      wrongChain,
      marketOpen,
      nativeBalance,
      nativePriceUsd,
      lastUpdated,
      positions,
      trades,
      walletConnect,
      walletDisconnect,
      switchChain,
      buyWithNative,
      sell,
      reset,
    ],
  );

  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}

export function useMarket() {
  const ctx = useContext(MarketCtx);
  if (!ctx) throw new Error("useMarket must be used inside MarketProvider");
  return ctx;
}

/**
 * Live per-KOL stats derived from the oracle feed:
 *  - price (USD, on-chain-driven once listed, estimate beforehand)
 *  - score (0..100)
 *  - marketCapUsd (price * fixed pool)
 *  - changePct: move since the equal open (so day-one = 0%)
 */
export function useKolStats(id: string) {
  const { prices, scores, metrics, breakdowns, onChainListings } = useMarket();
  const feed = useMarketFeed();
  const price = prices[id] ?? OPEN_PRICE_USD;
  // Prefer the score every other trader is seeing (shared feed), then the
  // direct on-chain read, then the scores.json snapshot which can lag.
  const score = feed.listings[id]?.score ?? onChainListings[id]?.score ?? scores[id] ?? 50;
  const marketCapUsd = price * 10_000_000; // SHARES_PER_LISTING
  const changePct = ((price - OPEN_PRICE_USD) / OPEN_PRICE_USD) * 100;
  const m = metrics[id];
  return {
    price,
    score,
    marketCapUsd,
    changePct,
    winRate: m ? m.winRate : undefined,
    realizedPnlEth: m ? m.realizedPnlEth : undefined,
    volumeEth: m ? m.volumeEth : undefined,
    trades: m ? m.trades : undefined,
    topWins: m?.topWins ?? [],
    topLosses: m?.topLosses ?? [],
    breakdown: breakdowns[id],
  };
}

/** Shares minted per listing — the denominator behind every market cap here. */
export const SHARES_PER_LISTING = 10_000_000;

/**
 * Live per-listing figures, keyed by id, for anywhere rendering a list.
 *
 * useKolStats covers a single listing, but it is a hook, so a table cannot
 * call it per row. Without this the list views fall back to KOLS.change24h /
 * .marketCap / .volume24h, which are seed placeholders sitting at zero — so
 * every row reads "+0.00%" no matter what the market is doing.
 *
 * changePct is measured against the shared opening price, which is what makes
 * a day-one 0% honest rather than a placeholder: every listing genuinely does
 * open at the same price.
 *
 * There is no volume here on purpose. Volume needs Bought/Sold events, and the
 * indexer subscribes to PriceUpdated only, so any number would be invented.
 */
export function useLiveMetrics() {
  const { prices, nativePriceUsd } = useMarket();
  const feed = useMarketFeed();
  return useMemo(() => {
    const changePct: Record<string, number> = {};
    const marketCapUsd: Record<string, number> = {};
    // Real share turnover from indexed Bought/Sold events, not the trader own
    // on-chain volume the oracle measures. Undefined rather than 0 when the
    // fills feed is not configured, so callers can show a dash instead of
    // asserting that nothing traded.
    const volumeUsd24h: Record<string, number | undefined> = {};
    for (const k of KOLS) {
      const price = prices[k.id] ?? OPEN_PRICE_USD;
      changePct[k.id] = ((price - OPEN_PRICE_USD) / OPEN_PRICE_USD) * 100;
      marketCapUsd[k.id] = price * SHARES_PER_LISTING;
      const v = feed.volume[k.id];
      volumeUsd24h[k.id] = feed.configured
        ? (Number(v?.volume_wei ?? 0) / 1e18) * nativePriceUsd
        : undefined;
    }
    return { changePct, marketCapUsd, volumeUsd24h };
  }, [prices, feed.volume, feed.configured, nativePriceUsd]);
}

/**
 * Index-wide stats, derived live rather than read from kols.ts.
 *
 * The static marketCap/volume24h/winRate/change24h fields on KOLS are seed
 * placeholders and are all literally zero, so anything rendering them shows
 * "$0.00M · $0K · 0%" forever, however busy the market actually is. These come
 * from the same sources a listing page uses: on-chain price via the shared
 * feed, and oracle metrics.
 *
 * `bestChangePct` is measured against the equal opening price, not a rolling
 * 24h window — every listing starts at the same open, so on day one everything
 * is legitimately 0%. Label it for what it is rather than calling it 24h.
 *
 * Volume is deliberately absent: it would have to come from Bought/Sold
 * events, and the indexer subscribes to PriceUpdated only, so there is no
 * honest number to show. A zero that means "not measured" is worse than no
 * figure at all on a stat bar people read as live.
 */
export function useIndexStats() {
  const { prices, metrics, onChainListings, nativePriceUsd } = useMarket();
  const feed = useMarketFeed();

  return useMemo(() => {
    let capUsd = 0;
    let bestChangePct = 0;
    let bestId: string | null = null;
    let winSum = 0;
    let winCount = 0;
    let listedOnChain = 0;
    let volumeWei = 0n;

    for (const k of KOLS) {
      const price = prices[k.id] ?? OPEN_PRICE_USD;
      capUsd += price * SHARES_PER_LISTING;

      const changePct = ((price - OPEN_PRICE_USD) / OPEN_PRICE_USD) * 100;
      if (bestId === null || changePct > bestChangePct) {
        bestChangePct = changePct;
        bestId = k.id;
      }

      const m = metrics[k.id];
      // Only count wallets the oracle actually scored. Averaging in a missing
      // wallet as 0% would drag the index average down purely because that
      // wallet was rate-limited, which is a data gap, not a losing trader.
      if (m && typeof m.winRate === "number" && m.trades > 0) {
        winSum += m.winRate;
        winCount++;
      }

      if (onChainListings[k.id] || feed.listings[k.id]) listedOnChain++;
      const v = feed.volume[k.id];
      if (v?.volume_wei) volumeWei += BigInt(v.volume_wei);
    }

    return {
      capUsd,
      avgWinRatePct: winCount > 0 ? (winSum / winCount) * 100 : null,
      scoredWallets: winCount,
      bestChangePct,
      bestId,
      bestTicker: KOLS.find((k) => k.id === bestId)?.ticker ?? null,
      listedOnChain,
      // Undefined rather than 0 when there is no fills feed: an authoritative
      // $0K is a claim that nothing traded, which is not what we know.
      volumeUsd24h: feed.configured ? (Number(volumeWei) / 1e18) * nativePriceUsd : undefined,
      totalListings: KOLS.length,
      live: feed.configured,
    };
  }, [
    prices,
    metrics,
    onChainListings,
    feed.listings,
    feed.volume,
    feed.configured,
    nativePriceUsd,
  ]);
}

/** Timeframe windows in milliseconds for the price chart. */
export const TIMEFRAMES = [
  { key: "1s", ms: 1_000 },
  { key: "5s", ms: 5_000 },
  { key: "15s", ms: 15_000 },
  { key: "1m", ms: 60_000 },
  { key: "5m", ms: 5 * 60_000 },
  { key: "1h", ms: 60 * 60_000 },
  { key: "3h", ms: 3 * 60 * 60_000 },
  { key: "1d", ms: 24 * 60 * 60_000 },
] as const;

export type TimeframeKey = (typeof TIMEFRAMES)[number]["key"];

/** This KOL's shared-feed price points within the chosen timeframe window. */
export function useKolHistory(id: string, tfMs: number): PricePoint[] {
  const { history } = useMarket();
  const all = history[id] ?? [];
  const cutoff = Date.now() - tfMs;
  const windowed = all.filter((pt) => pt.t >= cutoff);
  if (windowed.length < 2 && all.length >= 2) return all.slice(-2);
  return windowed;
}
