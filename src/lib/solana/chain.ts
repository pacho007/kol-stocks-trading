/**
 * chain.ts — the single place that decides which Solana cluster the app talks
 * to. Defaults to DEVNET so a missing env var can never silently point the app
 * at mainnet with real funds.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./sharps-idl.json";

export type Cluster = "mainnet-beta" | "devnet" | "localnet";

/**
 * Build-time env in the app (Vite inlines import.meta.env); process.env when
 * the oracle and admin scripts import this module under Node, where
 * import.meta.env does not exist. Each lookup tries the VITE_ name first and
 * the bare name second, so one .env serves both.
 */
function env(name: string): string | undefined {
  const vite = typeof import.meta.env === "object" ? import.meta.env : undefined;
  const node = typeof process === "object" ? process.env : undefined;
  return (
    (vite?.[`VITE_${name}`] as string | undefined) ||
    node?.[`VITE_${name}`] ||
    node?.[name] ||
    undefined
  );
}

const raw = env("SOLANA_CLUSTER");

/** Devnet unless explicitly set otherwise — never default to real funds. */
export const CLUSTER: Cluster =
  raw === "mainnet-beta" || raw === "mainnet"
    ? "mainnet-beta"
    : raw === "localnet"
      ? "localnet"
      : "devnet";

export const IS_MAINNET = CLUSTER === "mainnet-beta";

/** Human label for the footer, tooltips and docs. */
export const CLUSTER_NAME =
  CLUSTER === "mainnet-beta"
    ? "Solana"
    : CLUSTER === "devnet"
      ? "Solana Devnet"
      : "Solana Localnet";

const DEFAULT_RPC: Record<Cluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

export const RPC_URL: string = env("SOLANA_RPC_URL") || DEFAULT_RPC[CLUSTER];

/**
 * The deployed sharps program. The IDL carries the address it was built for;
 * VITE_PROGRAM_ID overrides it for a redeploy under a different key.
 */
export const PROGRAM_ID: PublicKey = new PublicKey(env("PROGRAM_ID") || idl.address);

/**
 * Block explorer links. For this audience the first two questions are "show me
 * the program" and "show me the wallet", so every address and signature on the
 * site links out. Solscan takes the cluster as a query parameter; a localnet
 * link goes through Solana Explorer's custom-RPC mode instead.
 */
const clusterQuery =
  CLUSTER === "mainnet-beta"
    ? ""
    : CLUSTER === "devnet"
      ? "?cluster=devnet"
      : `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;

const EXPLORER_BASE = CLUSTER === "localnet" ? "https://explorer.solana.com" : "https://solscan.io";

export const explorerAddressUrl = (address: string) =>
  `${EXPLORER_BASE}/${CLUSTER === "localnet" ? "address" : "account"}/${address}${clusterQuery}`;
export const explorerTxUrl = (signature: string) =>
  `${EXPLORER_BASE}/tx/${signature}${clusterQuery}`;
export const EXPLORER_NAME = CLUSTER === "localnet" ? "Solana Explorer" : "Solscan";

let _connection: Connection | null = null;

/** Shared, lazily-created connection — avoid one per component. */
export function getConnection(): Connection {
  if (!_connection) _connection = new Connection(RPC_URL, "confirmed");
  return _connection;
}

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** lamports -> float SOL, for display. */
export function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/** float SOL -> lamports, floored (never over-spend from a rounding artifact). */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * LAMPORTS_PER_SOL));
}

/** True for a well-formed base58 public key. */
export function isValidAddress(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}
