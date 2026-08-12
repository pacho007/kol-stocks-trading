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
import { KOLS } from "./kols";

export type Position = { id: string; shares: number; entry: number };
export type Trade = { id: string; side: "buy" | "sell"; shares: number; price: number; at: number };

type Ctx = {
  prices: Record<string, number>;
  live: boolean;
  connected: boolean;
  cash: number;
  positions: Position[];
  trades: Trade[];
  connect: () => void;
  disconnect: () => void;
  buy: (id: string, shares: number) => void;
  sell: (id: string, shares: number) => void;
  reset: () => void;
};

const START_CASH = 25000;
const MarketCtx = createContext<Ctx | null>(null);
const BASE: Record<string, number> = Object.fromEntries(KOLS.map((k) => [k.id, k.price]));

export function MarketProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<Record<string, number>>(BASE);
  const [connected, setConnected] = useState(false);
  const [cash, setCash] = useState(START_CASH);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [live, setLive] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    setLive(true);
    try {
      const raw = localStorage.getItem("sharps.v1");
      if (raw) {
        const s = JSON.parse(raw);
        setConnected(!!s.connected);
        setCash(typeof s.cash === "number" ? s.cash : START_CASH);
        setPositions(Array.isArray(s.positions) ? s.positions : []);
        setTrades(Array.isArray(s.trades) ? s.trades : []);
      }
    } catch {
      /* ignore */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem("sharps.v1", JSON.stringify({ connected, cash, positions, trades }));
  }, [connected, cash, positions, trades]);

  useEffect(() => {
    const t = setInterval(() => {
      setPrices((prev) => {
        const next: Record<string, number> = { ...prev };
        for (const k of KOLS) {
          const base = BASE[k.id] ?? 1;
          const cur = prev[k.id] ?? base;
          const drift = (base - cur) * 0.02;
          const jitter = (Math.random() - 0.5) * base * 0.006;
          next[k.id] = Math.max(base * 0.4, Number((cur + drift + jitter).toFixed(2)));
        }
        return next;
      });
    }, 2200);
    return () => clearInterval(t);
  }, []);

  const buy = useCallback(
    (id: string, shares: number) => {
      const price = prices[id] ?? BASE[id] ?? 0;
      setCash((c) => Math.max(0, c - price * shares));
      setPositions((p) => {
        const found = p.find((x) => x.id === id);
        if (!found) return [...p, { id, shares, entry: price }];
        const total = found.shares + shares;
        return p.map((x) =>
          x.id === id ? { ...x, shares: total, entry: (x.entry * x.shares + price * shares) / total } : x,
        );
      });
      setTrades((t) => [{ id, side: "buy" as const, shares, price, at: Date.now() }, ...t].slice(0, 50));
    },
    [prices],
  );

  const sell = useCallback(
    (id: string, shares: number) => {
      const price = prices[id] ?? BASE[id] ?? 0;
      setPositions((p) =>
        p
          .map((x) => (x.id === id ? { ...x, shares: x.shares - shares } : x))
          .filter((x) => x.shares > 0.0001),
      );
      setCash((c) => c + price * shares);
      setTrades((t) => [{ id, side: "sell" as const, shares, price, at: Date.now() }, ...t].slice(0, 50));
    },
    [prices],
  );

  const reset = useCallback(() => {
    setCash(START_CASH);
    setPositions([]);
    setTrades([]);
  }, []);

  const value = useMemo(
    () => ({
      prices,
      live,
      connected,
      cash,
      positions,
      trades,
      connect: () => setConnected(true),
      disconnect: () => setConnected(false),
      buy,
      sell,
      reset,
    }),
    [prices, live, connected, cash, positions, trades, buy, sell, reset],
  );

  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}

export function useMarket() {
  const ctx = useContext(MarketCtx);
  if (!ctx) throw new Error("useMarket must be used inside MarketProvider");
  return ctx;
}
