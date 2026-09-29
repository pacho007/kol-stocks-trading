/**
 * launch.ts — LAUNCH GATE: everyone starts fresh.
 *
 * No historical trades count. Scores reflect ONLY trades made after the
 * moment the product went live. The launch time is persisted to a file so
 * restarting the oracle does NOT reset everyone's clock — go-live happens
 * once, the first time this runs.
 *
 * An explicit LAUNCH_TS env var wins over the file, and is what production
 * should use: inside a container the file is part of the image, and a deploy
 * that ever lost it would silently re-stamp "now" and reset every listing's
 * history — scores would collapse to 50 and prices would unwind.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LAUNCH_FILE = resolve(dirname(fileURLToPath(import.meta.url)), ".launch");

/** Unix seconds of go-live. Set once, then reused on every subsequent run. */
export const LAUNCH_TS: number = (() => {
  const fromEnv = Number(process.env["LAUNCH_TS"] ?? "");
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

  if (existsSync(LAUNCH_FILE)) {
    const v = Number(readFileSync(LAUNCH_FILE, "utf8").trim());
    if (Number.isFinite(v) && v > 0) return v;
  }
  const now = Math.floor(Date.now() / 1000);
  writeFileSync(LAUNCH_FILE, String(now), "utf8");
  console.log(`\n*** GO-LIVE: launch time set to ${new Date(now * 1000).toISOString()} ***`);
  console.log(`*** Everyone starts fresh. Only trades AFTER this count. ***\n`);
  return now;
})();
