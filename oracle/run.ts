/**
 * run.ts — the oracle as a service, rather than as a scheduled batch.
 * ---------------------------------------------------------------------------
 * One process that stays up and keeps reading the market: index the cohort,
 * publish the scores, push the ones that moved on chain, repeat. It replaces
 * the GitHub Actions schedule, which could not do this job for two independent
 * reasons:
 *
 *   - Each batch re-walked every wallet's entire history, so one cycle took
 *     ~10.5 minutes and got slower as those wallets kept trading. A five-minute
 *     cron can never be met by a ten-minute job; the concurrency group just
 *     cancelled the overlap.
 *   - GitHub treats `schedule` as best-effort and drops most triggers on a
 *     quiet repo. Measured on this one: three runs a day against a five-minute
 *     cron.
 *
 * What makes continuous operation actually work is the incremental provider
 * (see createIncrementalBlockscoutProvider). The first cycle costs a full
 * crawl; every cycle after it reads one page per wallet, because Blockscout
 * returns newest-first and there is no reason to re-read history that has not
 * changed. Measured over 108 wallets unauthenticated: 550.5s cold, 109.5s
 * warm, identical metrics either way. The cache lives in this process — which
 * is precisely why this has to be a process and not a job.
 *
 * A warm cycle is bound by MIN_GAP_MS, not by latency: ~324 requests spaced
 * 400ms apart without an API key. With BLOCKSCOUT_API_KEY that spacing drops
 * to 120ms and concurrency goes 4 -> 16, which should land a warm cycle near
 * 40s. That is derived from the constants rather than measured.
 *
 * Two properties come free from staying up, which the batch could never have:
 *   - prevAnchors carries across cycles, so the rate cap actually smooths
 *     score -> price over time instead of restarting from BASE_PRICE each run.
 *   - A cycle is never concurrent with itself.
 *
 * Run:
 *   MARKET_ADDRESS=0x... ORACLE_AUTHORITY_PRIVATE_KEY=0x... \
 *   BLOCKSCOUT_API_KEY=... npx tsx oracle/run.ts
 *
 * Env:
 *   CYCLE_SECONDS      pause between cycles, default 30
 *   PUSH_ONCHAIN       "0" to publish scores without signing anything
 *   ROBINHOOD_NETWORK  "mainnet" to target chain 4663
 */

import { runOracle, type ListingInput } from "./indexer.js";
import { createIncrementalBlockscoutProvider } from "./blockscout-provider.js";
import { loadFullListings, fetchNativePriceUsd, publishScores } from "./publish.js";
import { connectOracle, pushScoresOnChain } from "./push-onchain-evm.js";

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

  // Held across cycles: this is the whole point of being a process.
  const provider = createIncrementalBlockscoutProvider();
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
          chainCtx.publicClient,
          chainCtx.walletClient,
          chainCtx.marketAddress,
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
