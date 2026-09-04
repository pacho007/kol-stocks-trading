/**
 * fetch-avatars.mjs — pull every listing's avatar once, serve it ourselves.
 *
 * WHY THIS EXISTS
 *
 * Listings pointed `image` straight at unavatar.io/x/<handle>. That is one
 * third-party request per listing per page load, and the market page renders
 * the whole cohort twice over — the grid plus the ticker tape. At 126 listings
 * that is a lot of requests to a free service, and it does what free services
 * do: measured today, 4 of 18 handles came back 429 and one returned a generic
 * SVG placeholder instead of the real photo. The visible symptom is a board
 * that fills with initials for no reason a user could understand, and it gets
 * worse with more traffic rather than better.
 *
 * So the avatars are fetched once, written into public/avatars/, and served
 * from the same origin as the app. No runtime dependency, no rate limit, no
 * per-visitor cost, and the images stop changing under us.
 *
 * Run:  node scripts/fetch-avatars.mjs
 *
 * Safe to re-run: it skips files it already has unless --force is passed, so
 * adding new listings only fetches the new ones.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "public/avatars");
const KOLS = resolve(root, "src/lib/kols.ts");
const FORCE = process.argv.includes("--force");

/** Spacing between requests. unavatar 429s readily; this is well under it. */
const GAP_MS = 700;
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const src = readFileSync(KOLS, "utf8");
// id, then the handle out of whichever image URL form the entry currently uses.
const seeds = [
  ...src.matchAll(/id: "([^"]+)",[\s\S]{0,320}?image: "([^"]*)"[\s\S]{0,160}?handle: "@([^"]+)"/g),
].map((m) => ({ id: m[1], image: m[2], handle: m[3] }));

if (!seeds.length) {
  console.error("Parsed no listings out of src/lib/kols.ts — refusing to continue.");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const have = new Set(readdirSync(OUT));

let fetched = 0;
let skipped = 0;
const failed = [];

for (const s of seeds) {
  const file = `${s.id}.jpg`;
  if (!FORCE && have.has(file)) {
    skipped++;
    continue;
  }

  let ok = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
    await sleep(GAP_MS * attempt);
    try {
      const r = await fetch(`https://unavatar.io/x/${s.handle}?fallback=false`, {
        redirect: "follow",
      });
      if (r.status === 429) continue; // backs off via the widening sleep above
      if (!r.ok) break; // 404 and friends will not improve on retry
      const type = r.headers.get("content-type") || "";
      const buf = Buffer.from(await r.arrayBuffer());
      // A tiny SVG is unavatar's generic silhouette, not the trader's photo.
      // Better to have no file and let the initials show than to ship a stock
      // avatar that looks like a real person's picture failed to load.
      if (type.includes("svg") || buf.byteLength < 1024) break;
      writeFileSync(resolve(OUT, file), buf);
      fetched++;
      ok = true;
    } catch {
      /* retry */
    }
  }
  if (!ok) failed.push(`${s.id} (@${s.handle})`);
}

console.log(`fetched ${fetched}, already had ${skipped}, no image for ${failed.length}`);
if (failed.length) {
  console.log("  these keep their initials fallback:");
  for (const f of failed) console.log(`    ${f}`);
}
