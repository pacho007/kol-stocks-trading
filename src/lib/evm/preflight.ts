/**
 * preflight.ts — does this build's configuration actually describe a real,
 * reachable market?
 *
 * Three env vars decide where every trade goes: VITE_ROBINHOOD_NETWORK,
 * VITE_ROBINHOOD_RPC_URL and VITE_MARKET_ADDRESS. Nothing checked that they
 * agreed with each other, and Vite inlines them at BUILD time, so a wrong one
 * cannot be corrected by restarting anything — it ships.
 *
 * The failure that motivates this is the mainnet cutover. Flip the network to
 * mainnet, leave the testnet contract address in place, and every read returns
 * empty while every write reverts: a launch that looks like a broken site
 * rather than a misconfiguration. The RPC is the same story in reverse — a
 * mainnet build pointed at a testnet RPC reads testnet state under a mainnet
 * banner.
 *
 * So this asks the chain the same question evm/_network.sh asks before it
 * signs anything: what chain are you actually, and is the contract really
 * there? Answering it in the app closes the gap between "configured" and
 * "true".
 *
 * Read-only and cheap — two RPC calls once at startup.
 */
import { getPublicClient, ACTIVE_CHAIN, MARKET_ADDRESS, RPC_URL } from "./chain";

export type ConfigProblem = {
  /** Short, user-facing. This is rendered, not just logged. */
  headline: string;
  detail: string;
};

/**
 * Returns null when the configuration is coherent, or the first problem found.
 *
 * Deliberately returns a problem rather than throwing: a misconfigured build
 * should render a page that explains itself, not a blank screen from an
 * unhandled rejection during hydration.
 */
export async function checkMarketConfig(): Promise<ConfigProblem | null> {
  if (!MARKET_ADDRESS) {
    return {
      headline: "No market contract configured",
      detail:
        "VITE_MARKET_ADDRESS is not set in this build, so there is nothing to trade against. " +
        "Set it and rebuild — Vite inlines it at build time, so a restart is not enough.",
    };
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(MARKET_ADDRESS)) {
    return {
      headline: "Market contract address is malformed",
      detail: `VITE_MARKET_ADDRESS is "${MARKET_ADDRESS}", which is not a 20-byte hex address.`,
    };
  }

  const client = getPublicClient();

  // What chain is this RPC really? The URL is not evidence — it can be
  // overridden by VITE_ROBINHOOD_RPC_URL independently of the network name.
  let actualChainId: number;
  try {
    actualChainId = await client.getChainId();
  } catch {
    return {
      headline: "Cannot reach the network",
      detail: `No response from ${RPC_URL}. The market cannot load until the RPC answers.`,
    };
  }

  if (actualChainId !== ACTIVE_CHAIN.id) {
    return {
      headline: "Network mismatch",
      detail:
        `This build is configured for ${ACTIVE_CHAIN.name} (chain ${ACTIVE_CHAIN.id}), but ` +
        `${RPC_URL} reports chain ${actualChainId}. Prices and balances shown would come from ` +
        `the wrong network.`,
    };
  }

  // Is the contract actually there? This is the stale-address case: the one
  // that turns a mainnet cutover into an empty board.
  let code: string | undefined;
  try {
    code = await client.getBytecode({ address: MARKET_ADDRESS });
  } catch {
    return {
      headline: "Cannot verify the market contract",
      detail: `Failed to read code at ${MARKET_ADDRESS} on ${ACTIVE_CHAIN.name}.`,
    };
  }

  if (!code || code === "0x") {
    return {
      headline: "No contract at the configured address",
      detail:
        `${MARKET_ADDRESS} has no code on ${ACTIVE_CHAIN.name} (chain ${ACTIVE_CHAIN.id}). ` +
        `This usually means VITE_MARKET_ADDRESS still points at a contract from a different ` +
        `network — check it against the address the deploy actually produced.`,
    };
  }

  return null;
}
