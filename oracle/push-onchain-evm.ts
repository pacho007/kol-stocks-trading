/**
 * push-onchain-evm.ts — Robinhood Chain (EVM) port of push-onchain.ts.
 * -------------------------------------------------------------------------
 * Signs and submits batchUpdatePrice to SharpsMarket.sol (evm/src/SharpsMarket.sol).
 * Same role as push-onchain.ts on Solana: this is the ONLY thing that moves
 * the actual tradable on-chain price. publish.ts's public/scores.json is a
 * separate display snapshot, not touched here.
 *
 * NOT YET WIRED TO REAL SCORES: this script's chain-interaction layer
 * (viem client, batching, retry/manifest logic) is a complete, working port
 * — but it still calls runOracle() with `EvmPnlProvider`
 * (oracle/evm-pnl-provider.ts), which currently throws on every wallet. See
 * that file's comment for what's needed before this pushes real scores
 * instead of failing loudly. Do not swap in HeliusPnlProvider/RpcPnlProvider
 * to "make it work" — those read Solana history, which is meaningless for
 * these 0x... wallets.
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
    default: { http: [process.env.ROBINHOOD_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com"] },
  },
});

const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"] },
  },
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
const CHUNK_SIZE = Number(process.env.ONCHAIN_CHUNK_SIZE ?? 50);
const SEND_GAP_MS = Number(process.env.ONCHAIN_SEND_GAP_MS ?? 400);
const MAX_TX_RETRIES = Number(process.env.ONCHAIN_TX_RETRIES ?? 5);
const REFRESH_MIN = Number(process.env.REFRESH_MIN ?? 20);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadOracleAuthority(): Hex {
  const key = process.env.ORACLE_AUTHORITY_PRIVATE_KEY;
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
) {
  console.log(`Indexing ${listings.length} wallets for on-chain price push...`);
  const rows = await runOracle(listings, EvmPnlProvider, {});

  const manifest: Manifest = {
    cycleStartedAt: new Date().toISOString(),
    cycleFinishedAt: null,
    chunkSize: CHUNK_SIZE,
    results: {},
  };

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

async function main() {
  const watch = process.argv.includes("--watch");
  const privateKey = loadOracleAuthority();
  const account = privateKeyToAccount(privateKey);

  const marketAddressStr = process.env.MARKET_ADDRESS;
  if (!marketAddressStr) {
    console.error("Missing MARKET_ADDRESS (the deployed SharpsMarket contract address).");
    process.exit(1);
  }
  const marketAddress = marketAddressStr as Address;

  const isMainnet = process.env.ROBINHOOD_NETWORK === "mainnet";
  const chain = isMainnet ? robinhoodMainnet : robinhoodTestnet;

  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = createWalletClient({ account, chain, transport: http() });

  console.log(`Network: ${chain.name} (chain id ${chain.id})`);
  console.log(`Oracle authority: ${account.address}`);
  console.log(`Market: ${marketAddress}`);

  let listings: ListingInput[];
  const full = await loadFullListings();
  if (!full) {
    console.error("Could not load KOLS from src/lib/kols.ts — nothing to push.");
    process.exit(1);
  }
  listings = full;
  console.log(`Using FULL list from app source (${listings.length} wallets).`);

  if (process.env.BATCH_START != null || process.env.BATCH_COUNT != null) {
    const start = Number(process.env.BATCH_START ?? 0);
    const count = Number(process.env.BATCH_COUNT ?? listings.length - start);
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
