export type Kol = {
  id: string;
  handle: string;
  name: string;
  ticker: string;
  avatar: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  holders: number;
  winRate: number;
  pnl30d: number;
  trades30d: number;
  avgHold: string;
  chain: string;
  bio: string;
  series: number[];
};

type Seed = {
  handle: string;
  name: string;
  ticker: string;
  price: number;
  change24h: number;
  holders: number;
  winRate: number;
  pnl30d: number;
  trades30d: number;
  avgHold: string;
  chain: string;
  bio: string;
  hue: number;
};

const SEEDS: Seed[] = [
  { handle: "@0xLiquid", name: "Liquid", ticker: "LQD", price: 184.22, change24h: 12.4, holders: 4821, winRate: 71, pnl30d: 1284000, trades30d: 312, avgHold: "3h 12m", chain: "Solana", bio: "Memecoin sniper. Enters within 90 seconds of deploy, exits before the influencers arrive.", hue: 140 },
  { handle: "@degenmoth", name: "Moth", ticker: "MOTH", price: 96.4, change24h: -6.8, holders: 3120, winRate: 58, pnl30d: 412000, trades30d: 508, avgHold: "41m", chain: "Solana", bio: "High-frequency degen. Volume machine with a taste for pain and 40x leverage.", hue: 22 },
  { handle: "@saltyquant", name: "Salty Quant", ticker: "SALT", price: 341.05, change24h: 4.1, holders: 8940, winRate: 78, pnl30d: 3120000, trades30d: 96, avgHold: "6d 4h", chain: "Ethereum", bio: "Ex-prop desk. Runs a systematic basis book on-chain. Boring, relentless, up only.", hue: 200 },
  { handle: "@catcapital", name: "Cat Capital", ticker: "CAT", price: 58.9, change24h: 27.6, holders: 2210, winRate: 64, pnl30d: 288000, trades30d: 174, avgHold: "1h 48m", chain: "Base", bio: "Found four 100x runners this quarter. Also lost a house on a dog coin. Net positive.", hue: 60 },
  { handle: "@vaultrat", name: "Vault Rat", ticker: "RAT", price: 22.14, change24h: -14.2, holders: 1490, winRate: 49, pnl30d: -96000, trades30d: 641, avgHold: "18m", chain: "Solana", bio: "Scalps the mempool. Currently in a drawdown and posting through it.", hue: 12 },
  { handle: "@midnightoracle", name: "Midnight Oracle", ticker: "ORCL", price: 214.77, change24h: 8.9, holders: 6402, winRate: 69, pnl30d: 1810000, trades30d: 142, avgHold: "22h", chain: "Ethereum", bio: "Only trades between 2am and 5am UTC. Nobody knows why. It works.", hue: 280 },
  { handle: "@sizerbeamer", name: "Sizer", ticker: "SIZE", price: 127.6, change24h: 1.2, holders: 5210, winRate: 66, pnl30d: 940000, trades30d: 88, avgHold: "2d 6h", chain: "Hyperliquid", bio: "Concentrated size, few positions, zero hedges. Bets the account on conviction.", hue: 320 },
  { handle: "@pixelwhale", name: "Pixel Whale", ticker: "PXL", price: 402.31, change24h: -2.4, holders: 11230, winRate: 74, pnl30d: 4620000, trades30d: 61, avgHold: "11d", chain: "Solana", bio: "Blue-chip of the index. Moves markets by opening a position. Rarely wrong, never early.", hue: 172 },
  { handle: "@ghostbid", name: "Ghost Bid", ticker: "GHST", price: 74.08, change24h: 18.3, holders: 1980, winRate: 62, pnl30d: 331000, trades30d: 267, avgHold: "55m", chain: "Base", bio: "Anonymous wallet that has never posted. Tracked purely by on-chain footprint.", hue: 250 },
  { handle: "@ramenhands", name: "Ramen Hands", ticker: "RMN", price: 39.55, change24h: -9.1, holders: 2640, winRate: 53, pnl30d: 74000, trades30d: 389, avgHold: "1h 05m", chain: "Solana", bio: "Sells the bottom with elite precision. A useful inverse signal for the whole market.", hue: 32 },
  { handle: "@apexdelta", name: "Apex Delta", ticker: "APEX", price: 268.9, change24h: 6.2, holders: 7310, winRate: 72, pnl30d: 2140000, trades30d: 201, avgHold: "9h 30m", chain: "Hyperliquid", bio: "Perps specialist. Delta-neutral until the funding flips, then fully directional.", hue: 100 },
  { handle: "@lunarfade", name: "Lunar Fade", ticker: "LUNA", price: 15.42, change24h: 33.7, holders: 890, winRate: 57, pnl30d: 121000, trades30d: 445, avgHold: "27m", chain: "Solana", bio: "Micro-cap only. The riskiest listing on SHARPS and the best 7-day performer.", hue: 285 },
];

function mulberry(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeries(price: number, change: number, index: number, points = 90) {
  const rand = mulberry(index * 9973 + 17);
  const start = price / (1 + change / 100);
  const out: number[] = [];
  const drift = (price - start) / points;
  let v = start;
  for (let i = 0; i < points; i++) {
    const vol = start * 0.022;
    v = v + drift + (rand() - 0.5) * vol;
    out.push(Math.max(v, start * 0.55));
  }
  out[out.length - 1] = price;
  return out.map((n) => Number(n.toFixed(2)));
}

export const KOLS: Kol[] = SEEDS.map((s, i) => ({
  id: s.ticker.toLowerCase(),
  handle: s.handle,
  name: s.name,
  ticker: s.ticker,
  avatar: `linear-gradient(135deg, oklch(0.72 0.19 ${s.hue}), oklch(0.42 0.13 ${(s.hue + 60) % 360}))`,
  price: s.price,
  change24h: s.change24h,
  marketCap: Math.round(s.price * (s.holders * 118)),
  volume24h: Math.round(s.price * s.trades30d * 91),
  holders: s.holders,
  winRate: s.winRate,
  pnl30d: s.pnl30d,
  trades30d: s.trades30d,
  avgHold: s.avgHold,
  chain: s.chain,
  bio: s.bio,
  series: makeSeries(s.price, s.change24h, i),
}));

export function getKol(id: string) {
  return KOLS.find((k) => k.id === id);
}

export function perfScore(k: Kol) {
  return Math.round(k.winRate * 6 + k.change24h * 3 + (k.pnl30d / 1_000_000) * 42 + k.trades30d / 40);
}

export const fmtUsd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtCompact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
