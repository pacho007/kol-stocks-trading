// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type Plugin } from "vite";

/**
 * Refuse to build a bundle whose network settings disagree with each other.
 *
 * VITE_ROBINHOOD_NETWORK picks the chain; VITE_ROBINHOOD_RPC_URL, when set,
 * overrides that chain's default RPC. Nothing keeps the two honest, and Vite
 * loads plain `.env` in production mode as well — so a developer's local
 * `.env` pinning the testnet RPC silently survives into a mainnet build. The
 * result is the worst possible combination: the header says Robinhood Chain
 * 4663, links go to rh-scan, and every read and every signed transaction goes
 * to testnet. Nothing errors, and the site looks live.
 *
 * The runtime preflight does detect this, but only once it is deployed and in
 * front of users. A mismatch is fully knowable at build time, so fail here —
 * a failed build costs a minute, a wrong-chain deploy costs trust.
 */
function networkConsistency(): Plugin {
  return {
    name: "sharps:network-consistency",
    apply: "build",
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const network = env["VITE_ROBINHOOD_NETWORK"] ?? "testnet";
      const rpc = env["VITE_ROBINHOOD_RPC_URL"];
      if (!rpc) return;

      // Substring rather than an exact host list: the point is to catch an RPC
      // that plainly names the other network, which is the mistake that
      // actually happens. A private or proxied RPC names neither and passes.
      const rpcIsTestnet = /testnet/i.test(rpc);
      const rpcIsMainnet = /mainnet/i.test(rpc);
      const wantMainnet = network === "mainnet";

      if (wantMainnet && rpcIsTestnet) {
        throw new Error(
          `Refusing to build: VITE_ROBINHOOD_NETWORK=mainnet but VITE_ROBINHOOD_RPC_URL is ${rpc}.
` +
            `This build would show mainnet everywhere and send every transaction to testnet.
` +
            `Set VITE_ROBINHOOD_RPC_URL to a mainnet RPC, or remove it to use the chain default.`,
        );
      }
      if (!wantMainnet && rpcIsMainnet) {
        throw new Error(
          `Refusing to build: VITE_ROBINHOOD_NETWORK=${network} but VITE_ROBINHOOD_RPC_URL is ${rpc}.
` +
            `A testnet build must not point at a mainnet RPC. Remove the override or fix it.`,
        );
      }
    },
  };
}

export default defineConfig({
  vite: { plugins: [networkConsistency()] },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Cloudflare's `workerd` runtime is the Lovable deploy target. The previous
  // `node-server` override existed only because @solana/web3.js and
  // wallet-adapter pulled in rpc-websockets / @solana/codecs, neither of which
  // publishes a workerd export condition. Those dependencies are gone — the
  // app is on Robinhood Chain via viem now, which is fetch-based and runs on
  // workerd unmodified — so the override is no longer needed and Lovable's
  // default preset applies.
  //
  // Keep it that way: adding a dependency that needs Node built-ins (fs,
  // native addons) will break the deploy, not just local dev.
});
