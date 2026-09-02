/**
 * evm-pnl-provider.ts — PnL metrics for Robinhood Chain wallets.
 * ---------------------------------------------------------------------------
 * Was a throwing stub; now backed by Blockscout, the official Robinhood Chain
 * explorer API (see oracle/blockscout-provider.ts for the reconstruction
 * logic and why Blockscout rather than GMGN).
 *
 * Kept as its own module so the data source stays swappable: if GMGN's Agent
 * API ever adds Robinhood Chain (it supports only SOL/BSC/Base as of the last
 * check), swapping the export below is the whole migration.
 */

export { BlockscoutPnlProvider as EvmPnlProvider } from "./blockscout-provider.js";
