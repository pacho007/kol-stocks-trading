/**
 * chain.ts — the single place that decides which Robinhood Chain network the
 * app talks to. Defaults to TESTNET so a missing env var can never silently
 * point the app at mainnet with real funds (same rule the old Solana
 * connection.ts followed for devnet).
 */
import { createPublicClient, defineChain, http, type PublicClient } from "viem";

export const ROBINHOOD_MAINNET_ID = 4663;
export const ROBINHOOD_TESTNET_ID = 46630;

export const robinhoodMainnet = defineChain({
  id: ROBINHOOD_MAINNET_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://explorer.chain.robinhood.com" },
  },
});

export const robinhoodTestnet = defineChain({
  id: ROBINHOOD_TESTNET_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
  },
});

const network = import.meta.env["VITE_ROBINHOOD_NETWORK"] as string | undefined;

/** Testnet unless explicitly set to mainnet — never default to real funds. */
export const ACTIVE_CHAIN = network === "mainnet" ? robinhoodMainnet : robinhoodTestnet;

export const RPC_URL: string =
  (import.meta.env["VITE_ROBINHOOD_RPC_URL"] as string | undefined) ??
  ACTIVE_CHAIN.rpcUrls.default.http[0];

/** Deployed SharpsMarket address. Undefined until the contract is deployed —
 * callers must treat that as "nothing is tradable yet" rather than crashing. */
export const MARKET_ADDRESS = import.meta.env["VITE_MARKET_ADDRESS"] as `0x${string}` | undefined;

let _client: PublicClient | null = null;

/** Shared, lazily-created read client — avoid one per component. */
export function getPublicClient(): PublicClient {
  if (!_client) {
    _client = createPublicClient({ chain: ACTIVE_CHAIN, transport: http(RPC_URL) });
  }
  return _client;
}

/** 18-decimals wei -> float, for display. */
export function weiToEth(wei: bigint): number {
  return Number(wei) / 1e18;
}

/** float ETH -> wei, floored (never over-spend from a rounding artifact). */
export function ethToWei(eth: number): bigint {
  return BigInt(Math.floor(eth * 1e18));
}
