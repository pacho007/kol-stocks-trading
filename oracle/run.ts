/**
 * run.ts — the oracle as a service, rather than as a scheduled batch.
 * ---------------------------------------------------------------------------
 * One process that stays up and keeps reading the market: index the cohort,
 * publish the scores, push the ones that moved on chain, repeat.
 *
 * It has to be a process: the Solana provider caches each wallet's history
 * and the newest signature it has read, so the first cycle costs a full read
 * since launch and every cycle after it reads only what is new. prevAnchors
 * also carries across cycles, so the rate cap smooths score -> price over
 * time. A cycle is never concurrent with itself.
 *
 * Run:
 *   TRADER_RPC_URL=https://mainnet.helius-rpc.com/?api-key=... \
 *   SOLANA_CLUSTER=devnet ORACLE_KEYPAIR_PATH=~/.config/sharps-devnet/oracle.json \
 *   npx tsx oracle/run.ts
 *
 * Env:
 *   CYCLE_SECONDS    pause between cycles, default 30
 *   PUSH_ONCHAIN     "0" to publish scores without signing anything
 *   TRADER_RPC_URL   where traders are read from (Solana mainnet)
 *   SOLANA_CLUSTER / SOLANA_RPC_URL   where the market program lives
 */

import { runOracle, type ListingInput } from "./indexer.js";
import { createSolanaProvider, traderRpcHost } from "./solana-provider.js";
import { loadFullListings, fetchNativePriceUsd, publishScores } from "./publish.js";
import { connectOracle, pushScoresOnChain } from "./push-onchain.js";

/**
 * Pause BETWEEN cycles, not a cycle period. The next cycle starts this long
 * after the previous one finished, so a slow cycle delays the next rather than
 * overlapping it — the bug both --watch modes had, where setInterval would
 * start a second pass while the first was still crawling.
 */
const CYCLE_SECONDS = Number(process.env["CYCLE_SECONDS"] ?? 30);

/** Publishing scores is read-only; pushing them on chain signs and costs gas. */
const PUSH_ONCHAIN = process.env["PUSH_ONCHAIN"] !== "0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Back off after a failure so a persistent outage does not become a hot loop
 * against someone else's API. Doubles per consecutive failure to a ceiling,
 * and resets the moment a cycle succeeds.
 */
const BACKOFF_CEILING_MS = 5 * 60_000;

async function main(): Promise<void> {
  const listings: ListingInput[] | null = await loadFullListings();
  if (!listings || listings.length === 0) {
    throw new Error("Could not load KOLS from src/lib/kols.ts — nothing to index.");
  }
  console.log(`SHARPS oracle starting — ${listings.length} wallets.`);
  console.log(`Cycle pause: ${CYCLE_SECONDS}s · on-chain push: ${PUSH_ONCHAIN ? "on" : "off"}`);

  // Preflight once at boot rather than one reverted batch at a time.
  const chainCtx = PUSH_ONCHAIN ? await connectOracle() : null;

  const provider = createSolanaProvider();
  console.log(`Trader history source: ${traderRpcHost()}`);
  let prevAnchors: Record<string, number> = {};

  let cycle = 0;
  let consecutiveFailures = 0;

  // Finish the cycle in flight before exiting, so a deploy or a restart never
  // interrupts a half-submitted batch of on-chain updates.
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) process.exit(1); // second signal: go now
      stopping = true;
      console.log(`\n${signal} received — finishing this cycle, then stopping.`);
    });
  }

  while (!stopping) {
    cycle++;
    const startedAt = Date.now();
    try {
      const nativePriceUsd = await fetchNativePriceUsd();
      const rows = await runOracle(listings, provider, prevAnchors);
      prevAnchors = Object.fromEntries(rows.map((r) => [r.id, r.targetAnchor]));

      await publishScores(rows, nativePriceUsd);

      if (chainCtx) {
        await pushScoresOnChain(
          chainCtx,
          listings,
          rows.map((r) => ({ id: r.id, wallet: r.wallet, score: r.score })),
        );
      }

      consecutiveFailures = 0;
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`Cycle ${cycle} complete in ${secs}s.`);
    } catch (e) {
      consecutiveFailures++;
      const wait = Math.min(CYCLE_SECONDS * 1000 * 2 ** consecutiveFailures, BACKOFF_CEILING_MS);
      console.error(
        `Cycle ${cycle} failed (${consecutiveFailures} in a row): ${(e as Error).message}\n` +
          `Retrying in ${Math.round(wait / 1000)}s.`,
      );
      // Deliberately does not exit. A transient explorer outage or a dropped
      // RPC should cost one cycle, not the oracle's uptime.
      if (stopping) break;
      await sleep(wait);
      continue;
    }

    if (stopping) break;
    await sleep(CYCLE_SECONDS * 1000);
  }

  console.log("Oracle stopped cleanly.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
