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
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { KOLS } from "./kols";
import { OPEN_PRICE_USD, scoreToPriceUsd } from "./pricing";
import { sessionState } from "./sessions";
import {
  getProgram,
  deriveListingPda,
  deriveMintPda,
  buildBuyIx,
  buildSellIx,
  type OnChainListing,
} from "./solana/program";

/**
 * Real-money market store. Trading is genuinely on-chain (see
 * anchor/programs/sharps) — buy()/sell() sign and send real transactions
 * against the sharps program, positions come from the connected wallet's
 * actual SPL token balances, and price is read from each listing's on-chain
 * account, not recomputed client-side.
 *
 * IMPORTANT: sharps' sell() pays min(quoted price, pro-rata vault NAV) — see
 * anchor/programs/sharps/src/instructions/sell.rs. `prices` below is the
 * QUOTED price; it is not a guaranteed redemption price. Compare it against
 * `backingPerShare` (also exposed here) before assuming a sell will fill at
 * the quote.
 *
 * Before a listing has been created on-chain yet (mid-rollout — see
 * oracle/push-onchain.ts and the admin create_listing script), there is
 * nothing to trade against it. `prices` falls back to an ESTIMATED
 * display-only price (scoreToPriceUsd) for those listings only; buy()/sell()
 * will fail against the program for anything not yet listed, same as they
 * would on-chain regardless.
 */

export type Position = { id: string; shares: number; entry: number | null };
export type PricePoint = { t: number; p: number };
export type KolMetrics = {
  realizedPnlSol: number;
  winRate: number;
  volumeSol: number;
  trades: number;
};
export type Trade = {
  id: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  sol: number;
  at: number;
  signature: string;
};

type Ctx = {
  prices: Record<string, number>;
  scores: Record<string, number>;
  history: Record<string, PricePoint[]>;
  metrics: Record<string, KolMetrics>;
  onChainListings: Record<string, OnChainListing>;
  backingPerShare: Record<string, number>;
  live: boolean;
  connected: boolean;
  connecting: boolean;
  marketOpen: boolean;
  solBalance: number;
  solPriceUsd: number;
  lastUpdated: string | null;
  positions: Position[];
  trades: Trade[];
  connect: () => void;
  disconnect: () => void;
  buyWithSol: (
    id: string,
    solIn: number,
  ) => Promise<{ shares: number; solSpent: number; signature: string }>;
  sell: (
    id: string,
    shares: number,
  ) => Promise<{ shares: number; solOut: number; signature: string }>;
  reset: () => void;
};

const SOL_PRICE_USD = 150;

const MarketCtx = createContext<Ctx | null>(null);

// Everyone starts fresh at the neutral score (50 => $0.01). Nobody is priced
// up or down until the oracle feed reports real post-launch performance.
const SEED_SCORES: Record<string, number> = Object.fromEntries(KOLS.map((k) => [k.id, 50]));

/** Precomputed once — PDA derivation is CPU-bound, no need to redo it per poll. */
const KOL_PDAS = new Map(
  KOLS.map((k) => {
    const kolWallet = new PublicKey(k.wallet);
    const listingPda = deriveListingPda(kolWallet);
    const mintPda = deriveMintPda(listingPda);
    return [k.id, { kolWallet, listingPda, mintPda }];
  }),
);
const MINT_TO_KOL_ID = new Map(
  Array.from(KOL_PDAS.entries()).map(([id, p]) => [p.mintPda.toBase58(), id]),
);

export function MarketProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const {
    connected,
    connecting,
    publicKey,
    connect: walletConnect,
    disconnect: walletDisconnect,
  } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [scores, setScores] = useState<Record<string, number>>(SEED_SCORES);
  const [metrics, setMetrics] = useState<Record<string, KolMetrics>>({});
  const [onChainListings, setOnChainListings] = useState<Record<string, OnChainListing>>({});
  const [solBalance, setSolBalance] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [live, setLive] = useState(false);
  const [marketOpen, setMarketOpen] = useState(true);
  const [solPriceUsd, setSolPriceUsd] = useState(SOL_PRICE_USD);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const solPriceRef = useRef(SOL_PRICE_USD);
  solPriceRef.current = solPriceUsd;

  const readProgram = useMemo(() => getProgram(connection), [connection]);

  useEffect(() => setLive(true), []);

  useEffect(() => {
    const tick = () => setMarketOpen(sessionState(new Date()).marketOpen);
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  // real wallet SOL balance, refreshed on an interval + on-change subscription
  useEffect(() => {
    if (!connected || !publicKey) {
      setSolBalance(0);
      return;
    }
    let alive = true;
    const refresh = async () => {
      try {
        const lamports = await connection.getBalance(publicKey, "confirmed");
        if (alive) setSolBalance(lamports / anchor.web3.LAMPORTS_PER_SOL);
      } catch {
        /* transient RPC error — next tick retries */
      }
    };
    refresh();
    const sub = connection.onAccountChange(publicKey, (info) => {
      if (alive) setSolBalance(info.lamports / anchor.web3.LAMPORTS_PER_SOL);
    });
    const id = setInterval(refresh, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
      connection.removeAccountChangeListener(sub);
    };
  }, [connected, publicKey, connection]);

  // real positions — this wallet's actual SPL balances across every listing mint.
  // Cost-basis/entry price isn't derivable from balances alone (needs an
  // off-chain fills-indexer to do properly); shown as null/"—" for now.
  useEffect(() => {
    if (!connected || !publicKey) {
      setPositions([]);
      return;
    }
    let alive = true;
    const refresh = async () => {
      try {
        const resp = await connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        });
        if (!alive) return;
        const next: Position[] = [];
        for (const { account } of resp.value) {
          const info = account.data.parsed?.info;
          const mint: string | undefined = info?.mint;
          const amount: number | undefined = info?.tokenAmount?.uiAmount;
          if (!mint || !amount) continue;
          const kolId = MINT_TO_KOL_ID.get(mint);
          if (!kolId) continue; // not one of our listing mints
          next.push({ id: kolId, shares: amount, entry: null });
        }
        setPositions(next);
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
  }, [connected, publicKey, connection]);

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
          rows: { id: string; score: number; metrics?: KolMetrics }[];
          solPriceUsd?: number;
          updatedAt?: string;
        };
        if (!alive || !Array.isArray(data.rows)) return;
        if (typeof data.solPriceUsd === "number" && data.solPriceUsd > 0) {
          setSolPriceUsd(data.solPriceUsd);
        }
        if (data.updatedAt) setLastUpdated(data.updatedAt);
        setScores((prev) => {
          const next = { ...prev };
          for (const r of data.rows) next[r.id] = r.score;
          return next;
        });
        setMetrics((prev) => {
          const next = { ...prev };
          for (const r of data.rows) if (r.metrics) next[r.id] = r.metrics;
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

  // ON-CHAIN LISTING STATE — the actual tradable price/pool per listing.
  // Batched (getMultipleAccountsInfo, chunks of 100) so this stays cheap
  // even across ~555 listings. Listings not yet created on-chain simply
  // come back null and fall through to the display-estimate fallback below.
  useEffect(() => {
    let alive = true;
    const ids = Array.from(KOL_PDAS.keys());
    const pull = async () => {
      try {
        const next: Record<string, OnChainListing> = {};
        for (let i = 0; i < ids.length; i += 100) {
          const batchIds = ids.slice(i, i + 100);
          const pdas = batchIds.map((id) => KOL_PDAS.get(id)!.listingPda);
          const infos = await connection.getMultipleAccountsInfo(pdas, "confirmed");
          infos.forEach((info, idx) => {
            if (!info) return;
            try {
              const decoded = readProgram.coder.accounts.decode(
                "listing",
                info.data,
              ) as unknown as OnChainListing;
              next[batchIds[idx]!] = decoded;
            } catch {
              /* account exists but didn't decode as a Listing — skip */
            }
          });
        }
        if (alive) setOnChainListings(next);
      } catch {
        /* transient RPC error — next tick retries, stale data kept meanwhile */
      }
    };
    pull();
    const id = setInterval(pull, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connection, readProgram]);

  const prices = useMemo(() => {
    const next: Record<string, number> = {};
    for (const k of KOLS) {
      const onChain = onChainListings[k.id];
      if (onChain) {
        const sol = onChain.priceLamports.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
        next[k.id] = sol * solPriceRef.current;
      } else {
        // not listed on-chain yet — display-only estimate, never used to trade.
        next[k.id] = scoreToPriceUsd(scores[k.id] ?? 50);
      }
    }
    return next;
  }, [onChainListings, scores]);

  const backingPerShare = useMemo(() => {
    // Populated lazily by kol.$id.tsx via fetchBackingPerShareLamports (needs
    // a live vault balance read, not worth polling for every listing here).
    return {} as Record<string, number>;
  }, []);

  // PRICE HISTORY RECORDER — snapshot each KOL's price over time so the chart
  // has real history to plot.
  const [history, setHistory] = useState<Record<string, PricePoint[]>>(() => {
    try {
      const raw = localStorage.getItem("sharps.history.v1");
      if (raw) return JSON.parse(raw) as Record<string, PricePoint[]>;
    } catch {
      /* ignore */
    }
    return {};
  });
  useEffect(() => {
    const record = () => {
      const now = Date.now();
      setHistory((prev) => {
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
  }, [prices]);

  useEffect(() => {
    const save = setInterval(() => {
      try {
        localStorage.setItem("sharps.history.v1", JSON.stringify(history));
      } catch {
        /* storage full or blocked — ignore */
      }
    }, 15000);
    return () => clearInterval(save);
  }, [history]);

  /** Max tolerated adverse move between quote and confirm before the
   * transaction reverts instead of filling at a worse price. */
  const SLIPPAGE_TOLERANCE = 0.01;

  const buyWithSol = useCallback(
    async (
      id: string,
      solIn: number,
    ): Promise<{ shares: number; solSpent: number; signature: string }> => {
      if (!marketOpen) throw new Error("Market is closed");
      if (!connected || !publicKey || !anchorWallet) throw new Error("Connect a wallet first");
      const pdas = KOL_PDAS.get(id);
      if (!pdas) throw new Error(`Unknown listing: ${id}`);

      const program = getProgram(connection, anchorWallet);
      const listingInfo = await connection.getAccountInfo(pdas.listingPda, "confirmed");
      if (!listingInfo) throw new Error("This listing isn't live on-chain yet");
      const listing = readProgram.coder.accounts.decode(
        "listing",
        listingInfo.data,
      ) as unknown as OnChainListing;
      const priceLamports = listing.priceLamports.toNumber();

      const solInLamports = Math.floor(solIn * anchor.web3.LAMPORTS_PER_SOL);
      const expectedShares = Math.floor(solInLamports / priceLamports);
      const minSharesOut = Math.floor(expectedShares * (1 - SLIPPAGE_TOLERANCE));

      const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
      const buyerAta = getAssociatedTokenAddressSync(pdas.mintPda, publicKey);
      const sharesBefore = await connection
        .getTokenAccountBalance(buyerAta, "confirmed")
        .then((r) => r.value.uiAmount ?? 0)
        .catch(() => 0); // ATA doesn't exist yet — first buy for this listing
      const solBefore = await connection.getBalance(publicKey, "confirmed");

      const ix = await buildBuyIx(program, publicKey, pdas.kolWallet, solInLamports, minSharesOut);
      const tx = new anchor.web3.Transaction().add(ix);
      const signature = await program.provider.sendAndConfirm!(tx, [], { commitment: "confirmed" });

      const sharesAfter = await connection
        .getTokenAccountBalance(buyerAta, "confirmed")
        .then((r) => r.value.uiAmount ?? 0)
        .catch(() => sharesBefore);
      const solAfter = await connection.getBalance(publicKey, "confirmed");

      const shares = Math.max(0, sharesAfter - sharesBefore);
      const solSpent = Math.max(0, (solBefore - solAfter) / anchor.web3.LAMPORTS_PER_SOL);

      setTrades((t) =>
        [
          {
            id,
            side: "buy" as const,
            shares,
            price: shares > 0 ? (solSpent / shares) * solPriceRef.current : 0,
            sol: solSpent,
            at: Date.now(),
            signature,
          },
          ...t,
        ].slice(0, 50),
      );
      return { shares, solSpent, signature };
    },
    [marketOpen, connected, publicKey, anchorWallet, connection, readProgram],
  );

  const sell = useCallback(
    async (
      id: string,
      shares: number,
    ): Promise<{ shares: number; solOut: number; signature: string }> => {
      if (!marketOpen) throw new Error("Market is closed");
      if (!connected || !publicKey || !anchorWallet) throw new Error("Connect a wallet first");
      const pdas = KOL_PDAS.get(id);
      if (!pdas) throw new Error(`Unknown listing: ${id}`);

      const program = getProgram(connection, anchorWallet);
      const listingInfo = await connection.getAccountInfo(pdas.listingPda, "confirmed");
      if (!listingInfo) throw new Error("This listing isn't live on-chain yet");
      const listing = readProgram.coder.accounts.decode(
        "listing",
        listingInfo.data,
      ) as unknown as OnChainListing;
      const priceLamports = listing.priceLamports.toNumber();

      const sharesIn = Math.floor(shares); // whole shares only — see buy()'s mint units
      const quotedSolOut = sharesIn * priceLamports;
      const minSolOut = Math.floor(quotedSolOut * (1 - SLIPPAGE_TOLERANCE));

      const ix = await buildSellIx(program, publicKey, pdas.kolWallet, sharesIn, minSolOut);

      const balBefore = await connection.getBalance(publicKey, "confirmed");
      const tx = new anchor.web3.Transaction().add(ix);
      const signature = await program.provider.sendAndConfirm!(tx, [], { commitment: "confirmed" });
      const balAfter = await connection.getBalance(publicKey, "confirmed");
      // actual executed proceeds, not the pre-trade quote — this can be less
      // than shares * quotedPrice if the listing was undercollateralized.
      const solOut = Math.max(0, (balAfter - balBefore) / anchor.web3.LAMPORTS_PER_SOL);

      setTrades((t) =>
        [
          {
            id,
            side: "sell" as const,
            shares: sharesIn,
            price: sharesIn > 0 ? (solOut / sharesIn) * solPriceRef.current : 0,
            sol: solOut,
            at: Date.now(),
            signature,
          },
          ...t,
        ].slice(0, 50),
      );
      return { shares: sharesIn, solOut, signature };
    },
    [marketOpen, connected, publicKey, anchorWallet, connection, readProgram],
  );

  const reset = useCallback(() => {
    // No local wallet state left to wipe (chain is source of truth) — this
    // only clears the cached chart history.
    setHistory({});
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
      onChainListings,
      history,
      backingPerShare,
      live,
      connected,
      connecting,
      marketOpen,
      solBalance,
      solPriceUsd,
      lastUpdated,
      positions,
      trades,
      connect: () => {
        walletConnect().catch(() => {
          /* user closed the wallet picker / rejected — nothing to do */
        });
      },
      disconnect: () => {
        walletDisconnect().catch(() => {});
      },
      buyWithSol,
      sell,
      reset,
    }),
    [
      prices,
      scores,
      metrics,
      onChainListings,
      history,
      backingPerShare,
      live,
      connected,
      connecting,
      marketOpen,
      solBalance,
      solPriceUsd,
      lastUpdated,
      positions,
      trades,
      walletConnect,
      walletDisconnect,
      buyWithSol,
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
 *  - changePct: move since the $0.01 equal open (so day-one = 0%)
 */
export function useKolStats(id: string) {
  const { prices, scores, metrics, onChainListings } = useMarket();
  const price = prices[id] ?? OPEN_PRICE_USD;
  // Prefer the score actually pushed on-chain by the oracle; scores.json is a
  // periodically-republished snapshot and can lag behind on-chain updates.
  const score = onChainListings[id]?.score ?? scores[id] ?? 50;
  const marketCapUsd = price * 10_000_000; // SHARES_PER_LISTING
  const changePct = ((price - OPEN_PRICE_USD) / OPEN_PRICE_USD) * 100;
  const m = metrics[id];
  return {
    price,
    score,
    marketCapUsd,
    changePct,
    winRate: m ? m.winRate : undefined,
    realizedPnlSol: m ? m.realizedPnlSol : undefined,
    volumeSol: m ? m.volumeSol : undefined,
    trades: m ? m.trades : undefined,
  };
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

/**
 * Returns this KOL's recorded price points within the chosen timeframe window.
 * Empty/short on fresh load — history only covers time elapsed while running.
 */
export function useKolHistory(id: string, tfMs: number): PricePoint[] {
  const { history } = useMarket();
  const all = history[id] ?? [];
  const cutoff = Date.now() - tfMs;
  const windowed = all.filter((pt) => pt.t >= cutoff);
  if (windowed.length < 2 && all.length >= 2) return all.slice(-2);
  return windowed;
}
