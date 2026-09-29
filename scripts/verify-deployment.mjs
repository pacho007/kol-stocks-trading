/**
 * verify-deployment.mjs — do all the moving parts agree on ONE program?
 *
 * WHY THIS EXISTS
 *
 * The cluster and program id are configured in several places and nothing
 * makes them agree: .env.production (the site), Supabase secrets (the
 * indexer), a GitHub secret (the backstop oracle) and a Fly secret (the live
 * oracle). Every component can be individually correct while the board reads
 * one deployment and portfolios another.
 *
 * The secrets themselves cannot be read from here, so this checks OUTCOMES:
 * the program is deployed on the cluster the site is built for, its config is
 * initialized, the first listed trader has a listing, and the newest price
 * event in the database came from a transaction that invoked THIS program.
 *
 *   node scripts/verify-deployment.mjs
 *
 * Env: SOLANA_RPC_URL (else the cluster default), SUPABASE_URL +
 * SUPABASE_ANON_KEY (else read from .env.production) for the database check.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PublicKey } from "@solana/web3.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => (existsSync(resolve(root, p)) ? readFileSync(resolve(root, p), "utf8") : "");
const pick = (text, key) =>
  (text.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m")) || [])[1];

const envProd = read(".env.production");
const envLocal = read(".env");
const idl = JSON.parse(read("src/lib/solana/sharps-idl.json"));

const cluster =
  pick(envProd, "VITE_SOLANA_CLUSTER") ?? pick(envLocal, "VITE_SOLANA_CLUSTER") ?? "devnet";
const programId = pick(envProd, "VITE_PROGRAM_ID") ?? idl.address;
const RPC =
  process.env.SOLANA_RPC_URL ??
  pick(envProd, "VITE_SOLANA_RPC_URL") ??
  (cluster.startsWith("mainnet")
    ? "https://api.mainnet-beta.solana.com"
    : cluster === "localnet"
      ? "http://127.0.0.1:8899"
      : "https://api.devnet.solana.com");

const rpc = async (method, params = []) => {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
};

let failed = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg) => {
  failed++;
  console.log(`  FAIL  ${msg}`);
};

console.log(`Site build: ${cluster} · program ${programId}\nRPC: ${RPC}\n`);

const pid = new PublicKey(programId);
const program = await rpc("getAccountInfo", [programId, { encoding: "base64" }]);
if (program?.value?.executable) ok("program is deployed on this cluster");
else bad("no executable program at that id on this cluster");

const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], pid);
const cfg = await rpc("getAccountInfo", [config.toBase58(), { encoding: "base64" }]);
if (cfg?.value) ok(`config initialized (${config.toBase58()})`);
else bad("config account missing — run the admin init");

const firstWallet = (read("src/lib/kols.ts").match(/wallet:\s*"([1-9A-HJ-NP-Za-km-z]{32,44})"/) ||
  [])[1];
if (firstWallet) {
  const [listing] = PublicKey.findProgramAddressSync(
    [Buffer.from("listing"), new PublicKey(firstWallet).toBuffer()],
    pid,
  );
  const l = await rpc("getAccountInfo", [listing.toBase58(), { encoding: "base64" }]);
  if (l?.value) ok(`first listed trader ${firstWallet} has a listing`);
  else bad(`first listed trader ${firstWallet} has no on-chain listing yet`);
} else {
  bad("no Solana wallet found in src/lib/kols.ts");
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? pick(envProd, "VITE_SUPABASE_URL");
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ?? pick(envProd, "VITE_SUPABASE_PUBLISHABLE_KEY");
if (SUPABASE_URL && SUPABASE_KEY) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/price_history?select=signature&order=block_time.desc&limit=1`,
    { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` } },
  );
  const rows = r.ok ? await r.json() : null;
  if (!rows) bad(`could not read price_history (HTTP ${r.status})`);
  else if (rows.length === 0) console.log("  --    price_history is empty (nothing indexed yet)");
  else {
    const tx = await rpc("getTransaction", [
      rows[0].signature,
      { encoding: "json", maxSupportedTransactionVersion: 0 },
    ]);
    const keys = tx?.transaction?.message?.accountKeys ?? [];
    if (keys.includes(programId)) ok("newest indexed price event came from this program");
    else bad("newest indexed price event did NOT come from this program — indexer is split");
  }
} else {
  console.log("  --    no Supabase credentials; skipped the database check");
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
