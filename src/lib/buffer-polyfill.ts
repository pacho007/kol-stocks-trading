/**
 * @solana/spl-token (and some paths through @solana/web3.js) reference the
 * Node global `Buffer` directly, which doesn't exist in the browser. Vite
 * doesn't polyfill it automatically, so without this the app throws
 * `ReferenceError: Buffer is not defined` on any code path that touches
 * spl-token (e.g. computing a listing's backing-per-share) — import this
 * before any Solana code runs.
 */
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
