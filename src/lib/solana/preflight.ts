/**
 * preflight.ts — does this build's configuration actually describe a real,
 * reachable market?
 *
 * VITE_SOLANA_CLUSTER, VITE_SOLANA_RPC_URL and VITE_PROGRAM_ID are inlined at
 * BUILD time, so a wrong one can't be fixed by restarting anything — it ships.
 * The failure this catches is a cluster mismatch: a mainnet build left pointed
 * at a devnet RPC (or the reverse) reads the wrong chain's state under the
 * right banner, and every listing looks empty. So ask the RPC which cluster it
 * really is (by genesis hash) and whether the program is deployed there.
 *
 * Read-only and cheap — two RPC calls once at startup.
 */
import { CLUSTER, CLUSTER_NAME, PROGRAM_ID, RPC_URL, getConnection } from "./chain";

export type ConfigProblem = {
  /** Short, user-facing. This is rendered, not just logged. */
  headline: string;
  detail: string;
};

const GENESIS: Partial<Record<typeof CLUSTER, string>> = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
};

/** Returns null when the configuration is coherent, or the first problem found. */
export async function checkMarketConfig(): Promise<ConfigProblem | null> {
  const connection = getConnection();

  const expected = GENESIS[CLUSTER];
  if (expected) {
    let genesis: string;
    try {
      genesis = await connection.getGenesisHash();
    } catch {
      return {
        headline: "Can't reach the Solana RPC",
        detail: `${RPC_URL} did not answer. Prices and trading are unavailable until it does.`,
      };
    }
    if (genesis !== expected) {
      return {
        headline: "RPC is on the wrong cluster",
        detail: `This build is for ${CLUSTER_NAME}, but ${RPC_URL} is serving a different cluster. Check VITE_SOLANA_RPC_URL.`,
      };
    }
  }

  const info = await connection.getAccountInfo(PROGRAM_ID);
  if (!info || !info.executable) {
    return {
      headline: "Market program not found",
      detail: `No program is deployed at ${PROGRAM_ID.toBase58()} on ${CLUSTER_NAME}. Check VITE_PROGRAM_ID and VITE_SOLANA_CLUSTER.`,
    };
  }
  return null;
}
