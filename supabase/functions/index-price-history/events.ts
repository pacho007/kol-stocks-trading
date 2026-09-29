/**
 * events.ts — decoding the sharps program's Anchor events out of transaction
 * logs. Pure (no Deno or Node APIs beyond Web Crypto), so the indexer and its
 * tests share one implementation.
 */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

export async function eventDiscriminator(name: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`event:${name}`)),
  );
  return Array.from(hash.slice(0, 8)).join(",");
}

class Reader {
  private o = 8;
  private view: DataView;
  constructor(private data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  pubkey() {
    const k = base58(this.data.subarray(this.o, this.o + 32));
    this.o += 32;
    return k;
  }
  u8() {
    return this.view.getUint8(this.o++);
  }
  u64() {
    const v = this.view.getBigUint64(this.o, true);
    this.o += 8;
    return v;
  }
  i64() {
    const v = this.view.getBigInt64(this.o, true);
    this.o += 8;
    return v;
  }
}

export type Decoded =
  | { kind: "price"; kolWallet: string; score: number; priceLamports: bigint; ts: bigint }
  | {
      kind: "fill";
      side: "buy" | "sell";
      kolWallet: string;
      trader: string;
      shares: bigint;
      lamports: bigint;
      ts: bigint;
    };

/**
 * The sharps program's events in log order, attributed through the invoke
 * stack so only lines printed while PROGRAM_ID is executing are accepted.
 */
export function programEvents(
  logs: string[],
  programId: string,
  discs: Map<string, string>,
): Decoded[] {
  const stack: string[] = [];
  const out: Decoded[] = [];
  for (const line of logs) {
    const invoke = /^Program (\w+) invoke \[\d+\]$/.exec(line);
    if (invoke) {
      stack.push(invoke[1]!);
      continue;
    }
    if (/^Program \w+ (success|failed)/.test(line)) {
      stack.pop();
      continue;
    }
    if (!line.startsWith("Program data: ") || stack[stack.length - 1] !== programId) continue;

    const data = Uint8Array.from(atob(line.slice("Program data: ".length)), (c) => c.charCodeAt(0));
    const kind = discs.get(Array.from(data.slice(0, 8)).join(","));
    if (!kind) continue;
    const r = new Reader(data);
    if (kind === "PriceUpdated") {
      out.push({
        kind: "price",
        kolWallet: r.pubkey(),
        score: r.u8(),
        priceLamports: r.u64(),
        ts: r.i64(),
      });
    } else if (kind === "Bought" || kind === "Sold") {
      out.push({
        kind: "fill",
        side: kind === "Bought" ? "buy" : "sell",
        kolWallet: r.pubkey(),
        trader: r.pubkey(),
        shares: r.u64(),
        lamports: r.u64(),
        ts: r.i64(),
      });
    }
  }
  return out;
}
