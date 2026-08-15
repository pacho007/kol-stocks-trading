/**
 * connection.ts — the single place that decides which Solana cluster the
 * app talks to. Defaults to devnet so a missing env var can never silently
 * point the app at mainnet with real funds.
 */
import { Connection, clusterApiUrl } from "@solana/web3.js";

export type SolanaCluster = "devnet" | "mainnet-beta" | "testnet";

export const SOLANA_CLUSTER: SolanaCluster =
  (import.meta.env["VITE_SOLANA_CLUSTER"] as SolanaCluster | undefined) ?? "devnet";

export const SOLANA_RPC_URL: string =
  import.meta.env["VITE_SOLANA_RPC_URL"] ?? clusterApiUrl(SOLANA_CLUSTER);

export const PROGRAM_ID_STR: string | undefined = import.meta.env["VITE_PROGRAM_ID"];

let _connection: Connection | null = null;

/** Shared, lazily-created Connection — avoid instantiating one per component. */
export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(SOLANA_RPC_URL, "confirmed");
  }
  return _connection;
}
