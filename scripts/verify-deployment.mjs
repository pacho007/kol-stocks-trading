/**
 * verify-deployment.mjs — do all the moving parts agree on ONE contract?
 *
 * WHY THIS EXISTS
 *
 * MARKET_ADDRESS is configured in four separate places and nothing makes them
 * agree: .env.production (the site), a Lovable secret (the indexer), a GitHub
 * secret (the backstop oracle), and a Fly secret (the live oracle).
 *
 * This has already gone wrong once. On testnet the frontend read
 * 0xe4896dd7… while the oracle and indexer wrote to 0xF3a21d10…, so the board
 * showed real scores from one contract while portfolios read balances from
 * another and came back empty. Every component was individually correct and
 * passed every check aimed at it. Nothing compared them to each other.
 *
 * The secrets themselves cannot be read from here, so this checks the OUTCOME
 * instead: which contract actually emitted the events sitting in the database,
 * versus the one the site is built to read. That is the comparison that
 * catches a split, and it needs no privileged access.
 *
 * Run before opening trading, after any redeploy, and any time the board and a
 * portfolio disagree:
 *
 *   node scripts/verify-deployment.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => (existsSync(resolve(root, p)) ? readFileSync(resolve(root, p), "utf8") : "");
const pick = (text, key) => (text.match(new RegExp(`^${key}\s*=\s*"?([^"\r\n]+)"?`, "m")) || [])[1];

const envProd = read(".env.production");
const envLocal = read(".env");
const deployed = read("evm/.deployed");

const network =
  pick(envProd, "VITE_ROBINHOOD_NETWORK") ?? pick(envLocal, "VITE_ROBINHOOD_NETWORK") ?? "testnet";
const RPC =
  process.env.ROBINHOOD_RPC_URL ??
  (network === "mainnet"
    ? "https://rpc.mainnet.chain.robinhood.com"
    : "https://rpc.testnet.chain.robinhood.com");

const rpc = async (method, params = []) => {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((x) => x.json());
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result;
};

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const fails = [];
const warns = [];

console.log(`\nSHARPS deployment check — ${network} (${RPC})\n`);

// 1. what the site is built to read
const siteAddr = pick(envProd, "VITE_MARKET_ADDRESS") ?? pick(envLocal, "VITE_MARKET_ADDRESS");
const deployAddr = pick(deployed, "MARKET_ADDRESS");
console.log(`  site (.env.production / .env) : ${siteAddr ?? "(unset)"}`);
console.log(`  last deploy (evm/.deployed)   : ${deployAddr ?? "(unset)"}`);
if (!siteAddr) fails.push("No VITE_MARKET_ADDRESS configured — the site cannot trade.");
if (siteAddr && deployAddr && !same(siteAddr, deployAddr))
  warns.push(`Site reads ${siteAddr} but the last recorded deploy was ${deployAddr}.`);

// 2. is it a real contract on this chain, and does it hold listings
if (siteAddr) {
  const chainId = parseInt(await rpc("eth_chainId"), 16);
  const expected = network === "mainnet" ? 4663 : 46630;
  console.log(`  RPC chain id                  : ${chainId} (expects ${expected})`);
  if (chainId !== expected) fails.push(`RPC is chain ${chainId}, not ${expected}.`);

  const code = await rpc("eth_getCode", [siteAddr, "latest"]);
  console.log(
    `  contract code at that address : ${code && code !== "0x" ? `${(code.length - 2) / 2} bytes` : "NONE"}`,
  );
  if (!code || code === "0x") fails.push(`No contract at ${siteAddr} on chain ${chainId}.`);
  else {
    // Does it hold OUR listings, not merely some listings? There is no
    // listingCount() on this contract — create-listings.sh calls one and
    // swallows the revert — so ask getListing() about a wallet we know we
    // list. The last field of the returned tuple is `exists`, and a contract
    // that has been deployed but never seeded answers false.
    const kols = read("src/lib/kols.ts");
    const firstWallet = (kols.match(/wallet:\s*"(0x[0-9a-fA-F]{40})"/) || [])[1];
    if (firstWallet) {
      const data = "0x084af0b2" + firstWallet.slice(2).toLowerCase().padStart(64, "0");
      const res = await rpc("eth_call", [{ to: siteAddr, data }, "latest"]).catch(() => null);
      // tuple ends (..., paused bool, exists bool) — last 32-byte word is `exists`
      const exists = res && res !== "0x" ? res.slice(-64).replace(/^0+/, "") === "1" : null;
      console.log(
        `  our listings present on it    : ${exists === null ? "(could not read)" : exists ? "yes" : "NO"}`,
      );
      if (exists === false)
        fails.push(
          "The contract has no listing for the first wallet in kols.ts — create-listings has not " +
            "been run against this deployment.",
        );
    }
  }
}

// 3. THE CHECK THAT WAS MISSING: which contract produced the indexed data?
const SUPA_URL =
  process.env.SUPABASE_URL ??
  pick(envProd, "VITE_SUPABASE_URL") ??
  pick(envLocal, "VITE_SUPABASE_URL");
const SUPA_KEY =
  process.env.SUPABASE_ANON_KEY ??
  pick(envProd, "VITE_SUPABASE_PUBLISHABLE_KEY") ??
  pick(envLocal, "VITE_SUPABASE_PUBLISHABLE_KEY");

if (SUPA_URL && SUPA_KEY) {
  const rows = await fetch(
    `${SUPA_URL}/rest/v1/price_history?select=tx_hash,block_number&order=block_number.desc&limit=1`,
    { headers: { apikey: SUPA_KEY } },
  ).then((r) => r.json());

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(`  feed source contract          : (no price history yet)`);
    warns.push("public.price_history is empty — nothing has been indexed on this network yet.");
  } else {
    const tx = await rpc("eth_getTransactionByHash", [rows[0].tx_hash]);
    const feedAddr = tx?.to ?? null;
    console.log(`  feed source contract          : ${feedAddr ?? "(tx not found on this chain)"}`);
    if (!tx) {
      fails.push(
        `The newest indexed event (${rows[0].tx_hash}) does not exist on chain ${network}. ` +
          `The database was indexed against a different network.`,
      );
    } else if (siteAddr && !same(feedAddr, siteAddr)) {
      fails.push(
        `SPLIT BRAIN: the site reads ${siteAddr} but every indexed event came from ${feedAddr}. ` +
          `Balances and portfolios will read one contract while prices and history come from another.`,
      );
    }
  }
} else {
  warns.push(
    "No Supabase credentials found — skipped the feed-source check, which is the important one.",
  );
}

console.log("");
for (const w of warns) console.log(`  WARN  ${w}`);
for (const f of fails) console.log(`  FAIL  ${f}`);
console.log("");
if (fails.length === 0 && warns.length === 0)
  console.log("  All sources agree. Safe to open trading.\n");
else if (fails.length === 0) console.log(`  No blocking problems (${warns.length} warning(s)).\n`);
else {
  console.log(`  ${fails.length} blocking problem(s). Do not open trading.\n`);
  process.exit(1);
}
