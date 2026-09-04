/**
 * chain.ts — the single place that decides which Robinhood Chain network the
 * app talks to. Defaults to TESTNET so a missing env var can never silently
 * point the app at mainnet with real funds (same rule the old Solana
 * connection.ts followed for devnet).
 */
import { createPublicClient, defineChain, http, type PublicClient } from "viem";

export const ROBINHOOD_MAINNET_ID = 4663;
export const ROBINHOOD_TESTNET_ID = 46630;

/**
 * Multicall3, at the canonical CREATE2 address it holds on essentially every
 * EVM chain. Verified deployed and answering on both Robinhood networks
 * (3808 bytes of code, getBlockNumber() responds).
 *
 * This is NOT optional decoration. viem refuses client.multicall() outright on
 * a chain with no multicall3 configured — "Chain does not support contract
 * multicall3" — and evm/market.ts reads every listing and every share balance
 * through exactly that call. Without this the board cannot load a single
 * listing: not a degraded chart, an empty market.
 */
const MULTICALL3 = {
  multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as const },
};

export const robinhoodMainnet = defineChain({
  id: ROBINHOOD_MAINNET_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://explorer.chain.robinhood.com" },
  },
  contracts: MULTICALL3,
});

export const robinhoodTestnet = defineChain({
  id: ROBINHOOD_TESTNET_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  contracts: MULTICALL3,
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

/**
 * Block explorer links.
 *
 * The whole product asserts that a trader's real on-chain record sets their
 * share price, and until now none of it was checkable: the wallet was printed
 * as plain text, the contract address was never shown at all, and no page
 * linked to a chain explorer anywhere. The docs even told people to "check the
 * wallet address yourself on a Robinhood Chain explorer" without giving them
 * the link.
 *
 * That is not a missing nicety. For this audience the first two questions are
 * "show me the contract" and "show me the wallet", and a market that answers
 * neither reads as evasive rather than unfinished.
 *
 * rh-scan.com on mainnet — its /address/ and /tx/ paths were verified live
 * rather than assumed. It bills itself as the Robinhood MAINNET explorer, so
 * testnet keeps the chain's own explorer: pointing a testnet address at a
 * mainnet-only index would produce a link that resolves, renders, and shows
 * nothing, which is worse than no link because it looks like the address has
 * no history.
 */
const EXPLORER_BASE =
  ACTIVE_CHAIN.id === ROBINHOOD_MAINNET_ID
    ? "https://rh-scan.com"
    : ACTIVE_CHAIN.blockExplorers.default.url;

export const explorerAddressUrl = (address: string) => `${EXPLORER_BASE}/address/${address}`;
export const explorerTxUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`;
export const EXPLORER_NAME =
  ACTIVE_CHAIN.id === ROBINHOOD_MAINNET_ID ? "rh-scan" : ACTIVE_CHAIN.blockExplorers.default.name;

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
