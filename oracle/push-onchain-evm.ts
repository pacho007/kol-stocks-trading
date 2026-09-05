/**
 * push-onchain-evm.ts — Robinhood Chain (EVM) port of push-onchain.ts.
 * -------------------------------------------------------------------------
 * Signs and submits batchUpdatePrice to SharpsMarket.sol (evm/src/SharpsMarket.sol).
 * Same role as push-onchain.ts on Solana: this is the ONLY thing that moves
 * the actual tradable on-chain price. publish.ts's public/scores.json is a
 * separate display snapshot, not touched here.
 *
 * WIRED TO REAL SCORES. EvmPnlProvider was a throwing stub when this warning
 * was written; it now re-exports BlockscoutPnlProvider and returns real
 * metrics. Verified against live Robinhood Chain data: differentiated scores,
 * real token symbols in topWins, and confidence tracking trades/(trades+20).
 *
 * Still do not swap in HeliusPnlProvider/RpcPnlProvider to "fix" anything —
 * those read Solana history, which is meaningless for these 0x... wallets.
 *
 * Rate limiting is the live constraint, not correctness. Blockscout's public
 * API sustains roughly one request per second; below that a full 108-wallet
 * cycle exhausts its retries and the affected wallets fall back to a neutral
 * 50 at confidence 0, indistinguishable from not having traded. See
 * BLOCKSCOUT_GAP_MS in blockscout-provider.ts. An API key removes the problem
 * properly; pacing only rations it.
 *
 * Key custody: same separation-of-privilege as the Solana version — the
 * oracle authority key can ONLY call updatePrice/batchUpdatePrice
 * (SharpsMarket.sol's onlyOracle functions never touch vaultBalance or
 * shareBalances), so a compromised key can at most nudge quoted prices
 * within the rate-cap/rails, never move funds. Keep it separate from the
 * admin key, same as ORACLE_AUTHORITY_KEYPAIR_PATH was on Solana.
 *
 * Run:
 *   ORACLE_AUTHORITY_PRIVATE_KEY=0x... \
 *   MARKET_ADDRESS=0x... \
 *   ROBINHOOD_RPC_URL=https://rpc.testnet.chain.robinhood.com \
 *   npx tsx oracle/push-onchain-evm.ts [--watch] [BATCH_START=0] [BATCH_COUNT=50]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { runOracle, type ListingInput } from "./indexer.js";
import { EvmPnlProvider } from "./evm-pnl-provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const marketAbi = JSON.parse(
  readFileSync(resolve(__dirname, "../evm/src/SharpsMarketAbi.json"), "utf8"),
);

const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env["ROBINHOOD_RPC_URL"] ?? "https://rpc.testnet.chain.robinhood.com"],
    },
  },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env["ROBINHOOD_RPC_URL"] ?? "https://rpc.mainnet.chain.robinhood.com"],
    },
  },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

async function loadFullListings(): Promise<ListingInput[] | null> {
  const candidates = [
    "../src/lib/kols.js",
    "../src/lib/kols.ts",
    "../../src/lib/kols.js",
    "../../src/lib/kols.ts",
  ];
  for (const path of candidates) {
    try {
      const mod = await import(path);
      const kols = (mod as { KOLS?: { id: string; wallet: string }[] }).KOLS;
      if (Array.isArray(kols) && kols.length) {
        const seen = new Set<string>();
        const unique: ListingInput[] = [];
        for (const k of kols) {
          if (seen.has(k.wallet)) continue;
          seen.add(k.wallet);
          unique.push({ id: k.id, wallet: k.wallet });
        }
        return unique;
      }
    } catch {
      /* try next path */
    }
  }
  return null;
}

// EVM calldata isn't as tightly capped as a legacy Solana tx (1232 bytes),
// so batches can be much larger than push-onchain.ts's CHUNK_SIZE=10 — the
// real constraint here is the block gas limit, not calldata size. 50 is a
// conservative starting point pending a real gas measurement on testnet.
const CHUNK_SIZE = Number(process.env["ONCHAIN_CHUNK_SIZE"] ?? 50);
const SEND_GAP_MS = Number(process.env["ONCHAIN_SEND_GAP_MS"] ?? 400);
const MAX_TX_RETRIES = Number(process.env["ONCHAIN_TX_RETRIES"] ?? 5);
const REFRESH_MIN = Number(process.env["REFRESH_MIN"] ?? 20);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadOracleAuthority(): Hex {
  const key = process.env["ORACLE_AUTHORITY_PRIVATE_KEY"];
  if (!key) {
    console.error(
      "Missing ORACLE_AUTHORITY_PRIVATE_KEY. Set it to a key that is ONLY ever used\n" +
        "to sign updatePrice/batchUpdatePrice — never the contract admin key, never a\n" +
        "key that holds real funds. Fund it with a small amount of ETH for gas.",
    );
    process.exit(1);
  }
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}

type ListingStatus = "confirmed" | "failed" | "unknown_error";

type Manifest = {
  cycleStartedAt: string;
  cycleFinishedAt: string | null;
  chunkSize: number;
  results: Record<string, { status: ListingStatus; error?: string; txHash?: string }>;
};

const MANIFEST_PATH = resolve(__dirname, ".last-onchain-run-evm.json");

async function once(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  marketAddress: Address,
  listings: ListingInput[],
  /**
   * Scores the caller has already computed this cycle. oracle/run.ts passes
   * these so a continuous cycle indexes once and pushes what it just derived,
   * rather than crawling the whole cohort a second time and pushing a
   * distribution that no longer matches the one it published.
   */
  precomputed?: { id: string; wallet: string; score: number }[],
) {
  // --from-scores reuses the scores publish.ts already computed instead of
  // crawling Blockscout again. A full cohort pass is ~25 minutes at the rate
  // limit that pass has to respect, and re-deriving scores that were just
  // derived buys nothing — worse, the two runs would disagree slightly, so
  // what lands on chain would not be the distribution that was reviewed.
  //
  // The default still re-indexes, because a scheduled --watch push should read
  // the chain fresh rather than whatever file happens to be on disk.
  let rows: Awaited<ReturnType<typeof runOracle>>;
  if (precomputed) {
    rows = precomputed as typeof rows;
  } else if (process.argv.includes("--from-scores")) {
    const path = resolve(__dirname, "../public/scores.json");
    const snap = JSON.parse(readFileSync(path, "utf8")) as {
      updatedAt: string;
      rows: { id: string; score: number }[];
    };
    const byId = new Map(snap.rows.map((r) => [r.id, r.score]));
    const missing = listings.filter((l) => !byId.has(l.id));
    if (missing.length) {
      console.error(
        `scores.json is missing ${missing.length} of the ${listings.length} listings ` +
          `(e.g. ${missing[0]!.id}). Re-run oracle/publish.ts before pushing, or drop ` +
          `--from-scores to index fresh.`,
      );
      process.exit(1);
    }
    rows = listings.map((l) => ({
      id: l.id,
      wallet: l.wallet,
      score: byId.get(l.id)!,
    })) as typeof rows;
    console.log(
      `Pushing ${rows.length} scores from public/scores.json (published ${snap.updatedAt}).`,
    );
  } else {
    console.log(`Indexing ${listings.length} wallets for on-chain price push...`);
    rows = await runOracle(listings, EvmPnlProvider, {});
  }

  // Only push scores that would actually change something.
  //
  // updatePrice is not free and it is not idempotent-for-free: writing a score
  // identical to the one already stored still costs a full storage write and
  // still emits PriceUpdated, so an unchanged listing bought nothing and put a
  // meaningless point on its own chart.
  //
  // That barely matters on testnet, where gas is 0.01 gwei. On mainnet a full
  // 108-listing push measures 6.58M gas, about 0.0048 ETH, and at a five minute
  // cadence that is roughly 1.38 ETH a day — most of it rewriting values that
  // did not move. Scores converge under the rate cap and then sit still, so in
  // steady state the large majority of any given cycle is redundant.
  //
  // Read current on-chain scores first (one multicall) and push only the
  // differences. A listing that has already reached its target costs nothing.
  const current = await publicClient.multicall({
    contracts: rows.map((r) => ({
      address: marketAddress,
      abi: marketAbi,
      functionName: "listings",
      args: [r.wallet as Address],
    })),
    allowFailure: true,
  });

  const changed: typeof rows = [];
  let unchanged = 0;
  let unreadable = 0;
  rows.forEach((r, i) => {
    const res = current[i];
    if (!res || res.status !== "success") {
      // Could not read it, so do not assume. Pushing a listing that turns out
      // to be current wastes a little gas; skipping one that actually moved
      // leaves a stale price on the board, which is the worse error.
      unreadable++;
      changed.push(r);
      return;
    }
    const onChainScore = Number((res.result as unknown as unknown[])[0]);
    if (onChainScore === r.score) unchanged++;
    else changed.push(r);
  });

  console.log(
    `Scores to push: ${changed.length} changed, ${unchanged} already at target` +
      (unreadable ? `, ${unreadable} unreadable (pushed anyway)` : ""),
  );

  if (changed.length === 0) {
    console.log("Nothing to push — every listing already matches its target score.");
    return;
  }

  rows = changed;

  const manifest: Manifest = {
    cycleStartedAt: new Date().toISOString(),
    cycleFinishedAt: null,
    chunkSize: CHUNK_SIZE,
    results: {},
  };

  // Balance, checked per cycle rather than only at startup.
  //
  // connectOracle() reports this once when the service boots, which catches
  // launching with an empty wallet and nothing else. The failure that
  // actually happens is draining three days in: sends start failing, the
  // retry loop exhausts, the cycle logs and continues, and the board simply
  // stops moving. Two RPC calls against a 15 minute cycle is nothing next to
  // finding out from a user that prices look stuck.
  try {
    const bal = await publicClient.getBalance({ address: walletClient.account!.address });
    const gp = await publicClient.getGasPrice();
    const perPush = 7_700_000n * gp;
    const left = perPush > 0n ? bal / perPush : 0n;
    if (left < 20n) {
      console.warn(
        `LOW BALANCE: ${(Number(bal) / 1e18).toFixed(5)} ETH left on ${walletClient.account!.address}, about ` +
          `${left} more full pushes. Scores stop moving when this runs out and the board ` +
          `looks stale rather than broken.`,
      );
    }
  } catch {
    // A balance read failing must never stop the push it was warning about.
  }
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const wallets = chunk.map((r) => r.wallet as Address);
    const scores = chunk.map((r) => r.score);

    let lastErr: unknown;
    let txHash: string | undefined;
    for (let attempt = 0; attempt < MAX_TX_RETRIES && !txHash; attempt++) {
      try {
        const hash = await walletClient.writeContract({
          address: marketAddress,
          abi: marketAbi,
          functionName: "batchUpdatePrice",
          args: [wallets, scores],
          chain: walletClient.chain,
          account: walletClient.account!,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        txHash = hash;
      } catch (e) {
        lastErr = e;
        await sleep(500 * (attempt + 1));
      }
    }

    if (txHash) {
      for (const r of chunk) manifest.results[r.id] = { status: "confirmed", txHash };
      console.log(`  chunk ${i / CHUNK_SIZE + 1}: confirmed ${chunk.length} listings (${txHash})`);
    } else {
      const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
      for (const r of chunk) manifest.results[r.id] = { status: "unknown_error", error: message };
      console.warn(
        `  chunk ${i / CHUNK_SIZE + 1}: FAILED for ${chunk.map((r) => r.id).join(", ")}: ${message}`,
      );
    }

    await sleep(SEND_GAP_MS);
  }

  manifest.cycleFinishedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");

  const failed = Object.entries(manifest.results).filter(([, v]) => v.status === "unknown_error");
  const confirmed = Object.values(manifest.results).filter((v) => v.status === "confirmed").length;
  console.log(
    `\nCycle done: ${confirmed}/${rows.length} confirmed on-chain, ${failed.length} failed.` +
      (failed.length
        ? ` See ${MANIFEST_PATH} for details — these listings' on-chain price is stale.`
        : ""),
  );
}

/**
 * Connect as the oracle authority and run every preflight before anything is
 * signed: the contract exists, this key is the authority the contract expects,
 * and the wallet can pay for gas.
 *
 * Exported so a long-running process does these checks once at boot rather
 * than discovering a misconfiguration one reverted batch at a time. Throws
 * rather than calling process.exit, because a supervisor needs to decide what
 * a failure means — the CLI below still exits.
 */
export async function connectOracle(): Promise<{
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  marketAddress: Address;
  oracleAddress: Address;
}> {
  const privateKey = loadOracleAuthority();
  const account = privateKeyToAccount(privateKey);

  const marketAddressStr = process.env["MARKET_ADDRESS"];
  if (!marketAddressStr) {
    throw new Error("Missing MARKET_ADDRESS (the deployed SharpsMarket contract address).");
  }
  const marketAddress = marketAddressStr as Address;

  const isMainnet = process.env["ROBINHOOD_NETWORK"] === "mainnet";
  const chain = isMainnet ? robinhoodMainnet : robinhoodTestnet;

  const publicClient = createPublicClient({ chain, transport: http() });
  // The RPC must actually be the chain we think we are on.
  //
  // ROBINHOOD_NETWORK picks the chain object; ROBINHOOD_RPC_URL overrides the
  // URL inside BOTH chain definitions above, so the two settings can disagree
  // and nothing in viem objects. A mainnet-labelled client pointed at a testnet
  // node reads testnet state, and this process signs prices for 126 listings
  // off what it reads.
  //
  // The bytecode check below usually catches it, but only because the address
  // happens to be empty on the other chain — and that is luck, not a guarantee.
  // Deploy from the same key at the same nonce on both networks and the
  // contract lands at an identical address on each, at which point the
  // bytecode check passes on the wrong chain and the oracle publishes against
  // it. Asking the node for its chain id costs one call and cannot be fooled.
  const rpcChainId = await publicClient.getChainId();
  if (rpcChainId !== chain.id) {
    console.error(
      `RPC chain id mismatch: ROBINHOOD_NETWORK selects ${chain.name} (${chain.id}) but the ` +
        `RPC reports ${rpcChainId}. ROBINHOOD_RPC_URL overrides the URL for whichever chain is ` +
        `selected, so these two settings must name the same network.`,
    );
    process.exit(1);
  }

  const walletClient = createWalletClient({ account, chain, transport: http() });

  const deployedCode = await publicClient.getBytecode({ address: marketAddress });
  if (!deployedCode || deployedCode === "0x") {
    throw new Error(`No contract deployed at ${marketAddress}. Check MARKET_ADDRESS.`);
  }

  const onChainOracle = (await publicClient.readContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: "oracleAuthority",
  })) as Address;
  if (onChainOracle.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `This key is not the contract's oracle authority.\n` +
        `  contract expects: ${onChainOracle}\n` +
        `  key derives to:   ${account.address}\n` +
        `Every batch would revert.`,
    );
  }

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    throw new Error(
      `Oracle wallet ${account.address} has no ETH and cannot sign.\n` +
        `Fund it: bash evm/fund-oracle.sh`,
    );
  }

  // Running out of gas is not a crash, which is the problem. sendTransaction
  // fails, the retry loop exhausts, the cycle logs an error and the process
  // keeps going — so the failure lives in Fly's logs while the board shows
  // prices that have not moved for hours, indistinguishable from a quiet
  // market to anyone looking at the product.
  //
  // Report it as a count of full pushes at the live gas price. A full
  // 126-listing push measures about 7.7M gas; pricing it live beats a fixed
  // ETH threshold, which goes stale the moment gas moves.
  const gasPriceNow = await publicClient.getGasPrice();
  const fullPushWei = 7_700_000n * gasPriceNow;
  const pushesLeft = fullPushWei > 0n ? balance / fullPushWei : 0n;
  console.log(
    `Oracle balance: ${(Number(balance) / 1e18).toFixed(5)} ETH (~${pushesLeft} full pushes ` +
      `at ${(Number(gasPriceNow) / 1e9).toFixed(4)} gwei)`,
  );
  if (pushesLeft < 20n) {
    console.warn(
      `LOW BALANCE: about ${pushesLeft} full pushes left. Scores stop moving when this runs ` +
        `out and the board just looks stale rather than broken. Top up ${account.address}.`,
    );
  }
  console.log(`Network: ${chain.name} (chain id ${chain.id})`);
  console.log(`Oracle authority: ${account.address}`);
  console.log(`Market: ${marketAddress}`);
  console.log(`Oracle balance: ${Number(balance) / 1e18} ETH`);

  return { publicClient, walletClient, marketAddress, oracleAddress: account.address };
}

/** One on-chain push of already-computed scores. See `once`. */
export async function pushScoresOnChain(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  marketAddress: Address,
  listings: ListingInput[],
  scores: { id: string; wallet: string; score: number }[],
): Promise<void> {
  await once(publicClient, walletClient, marketAddress, listings, scores);
}

async function main() {
  const watch = process.argv.includes("--watch");
  const privateKey = loadOracleAuthority();
  const account = privateKeyToAccount(privateKey);

  const marketAddressStr = process.env["MARKET_ADDRESS"];
  if (!marketAddressStr) {
    console.error("Missing MARKET_ADDRESS (the deployed SharpsMarket contract address).");
    process.exit(1);
  }
  const marketAddress = marketAddressStr as Address;

  const isMainnet = process.env["ROBINHOOD_NETWORK"] === "mainnet";
  const chain = isMainnet ? robinhoodMainnet : robinhoodTestnet;

  const publicClient = createPublicClient({ chain, transport: http() });
  // The RPC must actually be the chain we think we are on.
  //
  // ROBINHOOD_NETWORK picks the chain object; ROBINHOOD_RPC_URL overrides the
  // URL inside BOTH chain definitions above, so the two settings can disagree
  // and nothing in viem objects. A mainnet-labelled client pointed at a testnet
  // node reads testnet state, and this process signs prices for 126 listings
  // off what it reads.
  //
  // The bytecode check below usually catches it, but only because the address
  // happens to be empty on the other chain — and that is luck, not a guarantee.
  // Deploy from the same key at the same nonce on both networks and the
  // contract lands at an identical address on each, at which point the
  // bytecode check passes on the wrong chain and the oracle publishes against
  // it. Asking the node for its chain id costs one call and cannot be fooled.
  const rpcChainId = await publicClient.getChainId();
  if (rpcChainId !== chain.id) {
    console.error(
      `RPC chain id mismatch: ROBINHOOD_NETWORK selects ${chain.name} (${chain.id}) but the ` +
        `RPC reports ${rpcChainId}. ROBINHOOD_RPC_URL overrides the URL for whichever chain is ` +
        `selected, so these two settings must name the same network.`,
    );
    process.exit(1);
  }

  const walletClient = createWalletClient({ account, chain, transport: http() });

  console.log(`Network: ${chain.name} (chain id ${chain.id})`);
  console.log(`Oracle authority: ${account.address}`);
  console.log(`Market: ${marketAddress}`);

  // Preflight, here rather than in a wrapper script, so it holds however this
  // is invoked — shell, scheduler, or CI.
  const deployedCode = await publicClient.getBytecode({ address: marketAddress });
  if (!deployedCode || deployedCode === "0x") {
    console.error(`No contract deployed at ${marketAddress}. Check MARKET_ADDRESS.`);
    process.exit(1);
  }

  // updatePrice/batchUpdatePrice are onlyOracle, so the wrong key does not fail
  // once — it reverts every chunk in turn, after spending gas discovering that.
  const onChainOracle = (await publicClient.readContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: "oracleAuthority",
  })) as Address;
  if (onChainOracle.toLowerCase() !== account.address.toLowerCase()) {
    console.error(
      `This key is not the contract's oracle authority.\n` +
        `  contract expects: ${onChainOracle}\n` +
        `  key derives to:   ${account.address}\n` +
        `Every batch would revert.`,
    );
    process.exit(1);
  }

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    console.error(
      `Oracle wallet ${account.address} has no ETH and cannot sign.\n` +
        `Fund it: bash evm/fund-oracle.sh`,
    );
    process.exit(1);
  }
  console.log(`Oracle balance: ${Number(balance) / 1e18} ETH`);

  let listings: ListingInput[];
  const full = await loadFullListings();
  if (!full) {
    console.error("Could not load KOLS from src/lib/kols.ts — nothing to push.");
    process.exit(1);
  }
  listings = full;
  console.log(`Using FULL list from app source (${listings.length} wallets).`);

  if (process.env["BATCH_START"] != null || process.env["BATCH_COUNT"] != null) {
    const start = Number(process.env["BATCH_START"] ?? 0);
    const count = Number(process.env["BATCH_COUNT"] ?? listings.length - start);
    listings = listings.slice(start, start + count);
    console.log(`Batch slice: [${start}, ${start + count}) — ${listings.length} wallets this run.`);
  }

  await once(publicClient, walletClient, marketAddress, listings);
  if (watch) {
    console.log(`\nWatching — pushing on-chain updates every ${REFRESH_MIN} min. Ctrl-C to stop.`);
    setInterval(() => {
      once(publicClient, walletClient, marketAddress, listings).catch((e) =>
        console.error("push cycle failed:", e),
      );
    }, REFRESH_MIN * 60_000);
  }
}

/**
 * Only run the CLI when this file IS the program. oracle/run.ts imports
 * pushScoresOnChain from here to do the on-chain half of a continuous cycle,
 * and without this guard that import would also start a second, independent
 * push run as a side effect of loading the module.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
