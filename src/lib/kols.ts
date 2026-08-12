export type Kol = {
  id: string;
  handle: string;
  name: string;
  ticker: string;
  wallet: string;
  image: string;
  x: string;
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
  id: string;
  name: string;
  ticker: string;
  wallet: string;
  image: string;
  x: string;
  handle: string;
  hue: number;
};

/** Traders imported from the kolscan.io leaderboard. All listings open at $0.00. */
const SEEDS: Seed[] = [
  { id: "4bdkax", name: "Jijo", ticker: "JIJO", wallet: "4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk", image: "https://cdn.kolscan.io/profiles/4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk.png", x: "https://x.com/Jijo", handle: "@Jijo", hue: 222 },
  { id: "6s8gez", name: "Nyhrox", ticker: "NYHR", wallet: "6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC", image: "https://cdn.kolscan.io/profiles/6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC.png", x: "https://x.com/Nyhrox", handle: "@Nyhrox", hue: 287 },
  { id: "bi4rd5", name: "theo", ticker: "THEO", wallet: "Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt", image: "https://cdn.kolscan.io/profiles/Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt.png", x: "https://x.com/theo", handle: "@theo", hue: 201 },
  { id: "btf4a2", name: "Kev", ticker: "KEV", wallet: "BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd", image: "https://cdn.kolscan.io/profiles/BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd.png", x: "https://x.com/Kev", handle: "@Kev", hue: 157 },
  { id: "ztrg1p", name: "ItsVine", ticker: "ITSV", wallet: "ztRg1PdZbBQzMGbaz5UXqzaKX4frC82USoWiaVfohSv", image: "https://cdn.kolscan.io/profiles/ztRg1PdZbBQzMGbaz5UXqzaKX4frC82USoWiaVfohSv.png", x: "https://x.com/ItsVine", handle: "@ItsVine", hue: 251 },
  { id: "g3gzwq", name: "Goyim", ticker: "GOYI", wallet: "G3gZWqrYkNmYFKYCyfRCNtGuxdyuE2wiYKkZpiZn4WSS", image: "https://cdn.kolscan.io/profiles/G3gZWqrYkNmYFKYCyfRCNtGuxdyuE2wiYKkZpiZn4WSS.png", x: "https://x.com/Goyim", handle: "@Goyim", hue: 106 },
  { id: "sadnbe", name: "Ethan Prosper", ticker: "ETHA", wallet: "sAdNbe1cKNMDqDsa4npB3TfL62T14uAo2MsUQfLvzLT", image: "https://cdn.kolscan.io/profiles/sAdNbe1cKNMDqDsa4npB3TfL62T14uAo2MsUQfLvzLT.png", x: "https://x.com/EthanProsper", handle: "@EthanProsper", hue: 44 },
  { id: "7mhql9", name: "Kimba", ticker: "KIMB", wallet: "7mHqL9GzGnbsYLoHLDzB7FiHAZbND2CZCJYFvU9PU1d3", image: "https://cdn.kolscan.io/profiles/7mHqL9GzGnbsYLoHLDzB7FiHAZbND2CZCJYFvU9PU1d3.png", x: "https://x.com/Kimba", handle: "@Kimba", hue: 134 },
  { id: "gja1he", name: "Latuche", ticker: "LATU", wallet: "GJA1HEbxGnqBhBifH9uQauzXSB53to5rhDrzmKxhSU65", image: "https://cdn.kolscan.io/profiles/GJA1HEbxGnqBhBifH9uQauzXSB53to5rhDrzmKxhSU65.png", x: "https://x.com/Latuche", handle: "@Latuche", hue: 53 },
  { id: "4fzfck", name: "Rilsio", ticker: "RILS", wallet: "4fZFcK8ms3bFMpo1ACzEUz8bH741fQW4zhAMGd5yZMHu", image: "https://cdn.kolscan.io/profiles/4fZFcK8ms3bFMpo1ACzEUz8bH741fQW4zhAMGd5yZMHu.png", x: "https://x.com/Rilsio", handle: "@Rilsio", hue: 106 },
  { id: "gfxqes", name: "Spuno", ticker: "SPUN", wallet: "GfXQesPe3Zuwg8JhAt6Cg8euJDTVx751enp9EQQmhzPH", image: "https://cdn.kolscan.io/profiles/GfXQesPe3Zuwg8JhAt6Cg8euJDTVx751enp9EQQmhzPH.png", x: "https://x.com/Spuno", handle: "@Spuno", hue: 3 },
  { id: "ez2jp3", name: "Keano", ticker: "KEAN", wallet: "Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN", image: "https://cdn.kolscan.io/profiles/Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN.png", x: "https://x.com/Keano", handle: "@Keano", hue: 120 },
  { id: "5hagyc", name: "Schoen", ticker: "SCHO", wallet: "5hAgYC8TJCcEZV7LTXAzkTrm7YL29YXyQQJPCNrG84zM", image: "https://cdn.kolscan.io/profiles/5hAgYC8TJCcEZV7LTXAzkTrm7YL29YXyQQJPCNrG84zM.png", x: "https://x.com/Schoen", handle: "@Schoen", hue: 48 },
  { id: "98t65w", name: "Leck", ticker: "LECK", wallet: "98T65wcMEjoNLDTJszBHGZEX75QRe8QaANXokv4yw3Mp", image: "https://cdn.kolscan.io/profiles/98T65wcMEjoNLDTJszBHGZEX75QRe8QaANXokv4yw3Mp.png", x: "https://x.com/Leck", handle: "@Leck", hue: 10 },
  { id: "a8i6j8", name: "Mike", ticker: "MIKE", wallet: "A8i6J8B1DgVdQaoeyrCmc18473EzYocEtZGavHT4sXzw", image: "https://cdn.kolscan.io/profiles/A8i6J8B1DgVdQaoeyrCmc18473EzYocEtZGavHT4sXzw.png", x: "https://x.com/Mike", handle: "@Mike", hue: 119 },
  { id: "djm7tu", name: "LUKEY", ticker: "LUKE", wallet: "DjM7Tu7whh6P3pGVBfDzwXAx2zaw51GJWrJE3PwtuN7s", image: "https://cdn.kolscan.io/profiles/DjM7Tu7whh6P3pGVBfDzwXAx2zaw51GJWrJE3PwtuN7s.png", x: "https://x.com/LUKEY", handle: "@LUKEY", hue: 99 },
  { id: "5yrgrp", name: "slingoor", ticker: "SLIN", wallet: "5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij", image: "https://cdn.kolscan.io/profiles/5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij.png", x: "https://x.com/slingoor", handle: "@slingoor", hue: 111 },
  { id: "jdd3hy", name: "West", ticker: "WEST", wallet: "JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN", image: "https://cdn.kolscan.io/profiles/JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN.png", x: "https://x.com/West", handle: "@West", hue: 275 },
  { id: "8mava9", name: "Daumen", ticker: "DAUM", wallet: "8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5", image: "https://cdn.kolscan.io/profiles/8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5.png", x: "https://x.com/Daumen", handle: "@Daumen", hue: 98 },
  { id: "9yyya3", name: "Loopierr", ticker: "LOOP", wallet: "9yYya3F5EJoLnBNKW6z4bZvyQytMXzDcpU5D6yYr4jqL", image: "https://cdn.kolscan.io/profiles/9yYya3F5EJoLnBNKW6z4bZvyQytMXzDcpU5D6yYr4jqL.png", x: "https://x.com/Loopierr", handle: "@Loopierr", hue: 67 },
  { id: "d1h83u", name: "Jeets", ticker: "JEET", wallet: "D1H83ueSw5Nxy5okxH7VBfV4jRnqAK5Mm1tm3JAj3m5t", image: "https://cdn.kolscan.io/profiles/D1H83ueSw5Nxy5okxH7VBfV4jRnqAK5Mm1tm3JAj3m5t.png", x: "https://x.com/Jeets", handle: "@Jeets", hue: 308 },
  { id: "4yzpsz", name: "xunle", ticker: "XUNL", wallet: "4YzpSZpxDdjNf3unjkCtdWEsz2FL5mok7e5XQaDNqry8", image: "https://cdn.kolscan.io/profiles/4YzpSZpxDdjNf3unjkCtdWEsz2FL5mok7e5XQaDNqry8.png", x: "https://x.com/xunle", handle: "@xunle", hue: 306 },
  { id: "2w14ah", name: "Veloce", ticker: "VELO", wallet: "2W14ahXD3XBfWJchQ4K5NLXmguWWcTTUTuHDhEzeuvP3", image: "https://cdn.kolscan.io/profiles/2W14ahXD3XBfWJchQ4K5NLXmguWWcTTUTuHDhEzeuvP3.png", x: "https://x.com/Veloce", handle: "@Veloce", hue: 164 },
  { id: "862tys", name: "Wugi", ticker: "WUGI", wallet: "862TYSvRYoiHAK3F3WwTRYAfuGiQaGdxedN9AGvRGWo2", image: "https://cdn.kolscan.io/profiles/862TYSvRYoiHAK3F3WwTRYAfuGiQaGdxedN9AGvRGWo2.png", x: "https://x.com/Wugi", handle: "@Wugi", hue: 68 },
  { id: "j9tyas", name: "Johnson", ticker: "JOHN", wallet: "J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB", image: "https://cdn.kolscan.io/profiles/J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB.png", x: "https://x.com/Johnson", handle: "@Johnson", hue: 6 },
  { id: "hrcpnd", name: "0xWinged", ticker: "0XWI", wallet: "HrCPnDvDgbpbFxKxer6Pw3qEcfAQQNNjb6aJNFWgTEng", image: "https://cdn.kolscan.io/profiles/HrCPnDvDgbpbFxKxer6Pw3qEcfAQQNNjb6aJNFWgTEng.png", x: "https://x.com/0xWinged", handle: "@0xWinged", hue: 257 },
  { id: "8fskll", name: "Stigman", ticker: "STIG", wallet: "8fsKLLtvKNanL4ginCaiRS6UfeemY11rSf8U8fN1dJw4", image: "https://cdn.kolscan.io/profiles/8fsKLLtvKNanL4ginCaiRS6UfeemY11rSf8U8fN1dJw4.png", x: "https://x.com/Stigman", handle: "@Stigman", hue: 112 },
  { id: "bqvz7f", name: "Limfork.eth", ticker: "LIMF", wallet: "BQVz7fQ1WsQmSTMY3umdPEPPTm1sdcBcX9sP7o6kPRmB", image: "https://cdn.kolscan.io/profiles/BQVz7fQ1WsQmSTMY3umdPEPPTm1sdcBcX9sP7o6kPRmB.png", x: "https://x.com/Limforketh", handle: "@Limforketh", hue: 260 },
  { id: "dts6kb", name: "Peenuts", ticker: "PEEN", wallet: "DTS6KBsfaveqP5WUuWpmk4Mac14nanwwnBaraUAWsrYJ", image: "https://cdn.kolscan.io/profiles/DTS6KBsfaveqP5WUuWpmk4Mac14nanwwnBaraUAWsrYJ.png", x: "https://x.com/Peenuts", handle: "@Peenuts", hue: 201 },
  { id: "78n177", name: "Sheep", ticker: "SHEE", wallet: "78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2", image: "https://cdn.kolscan.io/profiles/78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2.png", x: "https://x.com/Sheep", handle: "@Sheep", hue: 225 },
  { id: "f8wtsr", name: "kz", ticker: "KZ", wallet: "F8WtsrLzexRkjv11b1sgA3Qj7E889RGYa1jFLGoPwKTB", image: "https://cdn.kolscan.io/profiles/F8WtsrLzexRkjv11b1sgA3Qj7E889RGYa1jFLGoPwKTB.png", x: "https://x.com/kz", handle: "@kz", hue: 59 },
  { id: "cxvjew", name: "Swan", ticker: "SWAN", wallet: "CXVJewdc79TYR55sz4SGLSWUPz3r4LBJ9Mn93bZ8ZyAz", image: "https://cdn.kolscan.io/profiles/CXVJewdc79TYR55sz4SGLSWUPz3r4LBJ9Mn93bZ8ZyAz.png", x: "https://x.com/Swan", handle: "@Swan", hue: 185 },
  { id: "2k7mnf", name: "Setsu", ticker: "SETS", wallet: "2k7Mnf2K3GhpB7hEVN1CFFeV4oNzzuCS5Q6SmcfAoLHd", image: "https://cdn.kolscan.io/profiles/2k7Mnf2K3GhpB7hEVN1CFFeV4oNzzuCS5Q6SmcfAoLHd.png", x: "https://x.com/Setsu", handle: "@Setsu", hue: 48 },
  { id: "dvbv5t", name: "CookDoc", ticker: "COOK", wallet: "Dvbv5TdAyPpJk16X9mUxWFVicYtCUxTLhuof8TGuUaRv", image: "https://cdn.kolscan.io/profiles/Dvbv5TdAyPpJk16X9mUxWFVicYtCUxTLhuof8TGuUaRv.png", x: "https://x.com/CookDoc", handle: "@CookDoc", hue: 301 },
  { id: "36a6me", name: "Mel", ticker: "MEL", wallet: "36A6mEN5rYJdVTb6fMqVvG6ez8g2mTYdr1omWcQ1kDKG", image: "https://cdn.kolscan.io/profiles/36A6mEN5rYJdVTb6fMqVvG6ez8g2mTYdr1omWcQ1kDKG.png", x: "https://x.com/Mel", handle: "@Mel", hue: 157 },
  { id: "2t5ngd", name: "Idontpaytaxes", ticker: "IDON", wallet: "2T5NgDDidkvhJQg8AHDi74uCFwgp25pYFMRZXBaCUNBH", image: "https://cdn.kolscan.io/profiles/2T5NgDDidkvhJQg8AHDi74uCFwgp25pYFMRZXBaCUNBH.png", x: "https://x.com/Idontpaytaxes", handle: "@Idontpaytaxes", hue: 49 },
  { id: "922vvm", name: "Zuki", ticker: "ZUKI", wallet: "922VvmmYDHV9KMTJJ71Y5Yd3Vn7cfJuFasLNSsZPygrG", image: "https://cdn.kolscan.io/profiles/922VvmmYDHV9KMTJJ71Y5Yd3Vn7cfJuFasLNSsZPygrG.png", x: "https://x.com/Zuki", handle: "@Zuki", hue: 115 },
  { id: "cukfkd", name: "Baraka", ticker: "BARA", wallet: "CUKFKdJw7F91bZBbtAJMrLLxqtVigVSJhx644EFnCnw", image: "https://cdn.kolscan.io/profiles/CUKFKdJw7F91bZBbtAJMrLLxqtVigVSJhx644EFnCnw.png", x: "https://x.com/Baraka", handle: "@Baraka", hue: 77 },
  { id: "4sausq", name: "Scharo", ticker: "SCHA", wallet: "4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU", image: "https://cdn.kolscan.io/profiles/4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU.png", x: "https://x.com/Scharo", handle: "@Scharo", hue: 83 },
  { id: "9r1ben", name: "Mazino", ticker: "MAZI", wallet: "9r1BenK1nPvkZyD88q3e6bTKjfqDcLjxnXn9ovreDL52", image: "https://cdn.kolscan.io/profiles/9r1BenK1nPvkZyD88q3e6bTKjfqDcLjxnXn9ovreDL52.png", x: "https://x.com/Mazino", handle: "@Mazino", hue: 85 },
  { id: "9bs2xg", name: "woopig", ticker: "WOOP", wallet: "9Bs2XgZynPdMfbpn3HQX8NKWLToPDwGrMHRbZruwbyPD", image: "https://cdn.kolscan.io/profiles/9Bs2XgZynPdMfbpn3HQX8NKWLToPDwGrMHRbZruwbyPD.png", x: "https://x.com/woopig", handle: "@woopig", hue: 77 },
  { id: "2ipgng", name: "Jdn", ticker: "JDN", wallet: "2iPgNgss7ow3v5YFkTpzABStfjFSyG3BGvP5sZqADtFM", image: "https://cdn.kolscan.io/profiles/2iPgNgss7ow3v5YFkTpzABStfjFSyG3BGvP5sZqADtFM.png", x: "https://x.com/Jdn", handle: "@Jdn", hue: 227 },
  { id: "3uz65g", name: "Felix", ticker: "FELI", wallet: "3uz65G8e463MA5FxcSu1rTUyWRtrRLRZYskKtEHHj7qn", image: "https://cdn.kolscan.io/profiles/3uz65G8e463MA5FxcSu1rTUyWRtrRLRZYskKtEHHj7qn.png", x: "https://x.com/Felix", handle: "@Felix", hue: 59 },
  { id: "egjcs3", name: "Legend", ticker: "LEGE", wallet: "EgjCS3ULUCU5JN83XumirPr6171zvN5i6wc12SDiVGX3", image: "https://cdn.kolscan.io/profiles/EgjCS3ULUCU5JN83XumirPr6171zvN5i6wc12SDiVGX3.png", x: "https://x.com/Legend", handle: "@Legend", hue: 242 },
  { id: "4eszfz", name: "dash", ticker: "DASH", wallet: "4ESzFZUWUdr2GsgHBVeQKuzAmBWS5sRSaXw6PZH2EAau", image: "https://cdn.kolscan.io/profiles/4ESzFZUWUdr2GsgHBVeQKuzAmBWS5sRSaXw6PZH2EAau.png", x: "https://x.com/dash", handle: "@dash", hue: 13 },
  { id: "9eypam", name: "Connor", ticker: "CONN", wallet: "9EyPAMyQvXaUWFxd2uQHvG8vpkKs33YdXvDvwmRXrUiH", image: "https://cdn.kolscan.io/profiles/9EyPAMyQvXaUWFxd2uQHvG8vpkKs33YdXvDvwmRXrUiH.png", x: "https://x.com/Connor", handle: "@Connor", hue: 305 },
  { id: "2net6e", name: "rambo", ticker: "RAMB", wallet: "2net6etAtTe3Rbq2gKECmQwnzcKVXRaLcHy2Zy1iCiWz", image: "https://cdn.kolscan.io/profiles/2net6etAtTe3Rbq2gKECmQwnzcKVXRaLcHy2Zy1iCiWz.png", x: "https://x.com/rambo", handle: "@rambo", hue: 236 },
  { id: "4esy8h", name: "prosciutto", ticker: "PROS", wallet: "4EsY8HQB4Ak65diFrSHjwWhKSGC8sKmnzyusM993gk2w", image: "https://cdn.kolscan.io/profiles/4EsY8HQB4Ak65diFrSHjwWhKSGC8sKmnzyusM993gk2w.png", x: "https://x.com/prosciutto", handle: "@prosciutto", hue: 3 },
  { id: "cdp8h7", name: "Splinter", ticker: "SPLI", wallet: "CDp8H7appttPykZGthR8orkPvyzc53RvQDwnFskYFNU8", image: "https://cdn.kolscan.io/profiles/CDp8H7appttPykZGthR8orkPvyzc53RvQDwnFskYFNU8.png", x: "https://x.com/Splinter", handle: "@Splinter", hue: 332 },
  { id: "7eqjth", name: "neko", ticker: "NEKO", wallet: "7EQjTHVNHunhQHT7iRQDCR99mjDm2GvHyGKHVGzX8jv2", image: "https://cdn.kolscan.io/profiles/7EQjTHVNHunhQHT7iRQDCR99mjDm2GvHyGKHVGzX8jv2.png", x: "https://x.com/neko", handle: "@neko", hue: 243 },
];

const FLAT = Array.from({ length: 90 }, () => 0);

export const KOLS: Kol[] = SEEDS.map((s) => ({
  id: s.id,
  handle: s.handle,
  name: s.name,
  ticker: s.ticker,
  wallet: s.wallet,
  image: s.image,
  x: s.x,
  avatar: `linear-gradient(135deg, oklch(0.72 0.19 ${s.hue}), oklch(0.42 0.13 ${(s.hue + 60) % 360}))`,
  price: 0,
  change24h: 0,
  marketCap: 0,
  volume24h: 0,
  holders: 0,
  winRate: 0,
  pnl30d: 0,
  trades30d: 0,
  avgHold: "n/a",
  chain: "Solana",
  bio: `On-chain Solana trader tracked from wallet ${s.wallet.slice(0, 4)}...${s.wallet.slice(-4)}. Listing opens at $0.00 and reprices at each daily close from realised on-chain performance.`,
  series: FLAT,
}));

export function getKol(id: string) {
  return KOLS.find((k) => k.id === id);
}

export function shortWallet(w: string) {
  return `${w.slice(0, 4)}...${w.slice(-4)}`;
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
