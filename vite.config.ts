// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";

/**
 * Refuse to build a bundle whose cluster settings disagree with each other.
 *
 * VITE_SOLANA_CLUSTER picks the cluster; VITE_SOLANA_RPC_URL, when set,
 * overrides its default RPC. Nothing keeps the two honest, and Vite loads
 * plain `.env` in production mode as well — so a local `.env` pinning a devnet
 * RPC silently survives into a mainnet build: the header says Solana, and
 * every signed transaction goes to devnet. A mismatch is knowable at build
 * time, so fail here — a failed build costs a minute, a wrong-cluster deploy
 * costs trust. (src/lib/solana/preflight.ts also checks at runtime, by
 * genesis hash, for RPCs whose URL names neither cluster.)
 */
function networkConsistency(): Plugin {
  return {
    name: "sharps:network-consistency",
    apply: "build",
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const cluster = env["VITE_SOLANA_CLUSTER"] ?? "devnet";
      const rpc = env["VITE_SOLANA_RPC_URL"];
      if (!rpc) return;

      const wantMainnet = cluster === "mainnet-beta" || cluster === "mainnet";
      const rpcIsDevnet = /devnet|testnet|localhost|127\.0\.0\.1/i.test(rpc);
      const rpcIsMainnet = /mainnet/i.test(rpc);

      if (wantMainnet && rpcIsDevnet) {
        throw new Error(
          `Refusing to build: VITE_SOLANA_CLUSTER=${cluster} but VITE_SOLANA_RPC_URL is ${rpc}.\n` +
            `This build would show mainnet everywhere and send every transaction elsewhere.`,
        );
      }
      if (!wantMainnet && rpcIsMainnet) {
        throw new Error(
          `Refusing to build: VITE_SOLANA_CLUSTER=${cluster} but VITE_SOLANA_RPC_URL is ${rpc}.\n` +
            `A devnet build must not point at a mainnet RPC. Remove the override or fix it.`,
        );
      }
    },
  };
}

/**
 * @solana/web3.js depends on rpc-websockets, which publishes only "browser"
 * and "node" export conditions — none for Cloudflare's workerd, the Lovable
 * deploy target, so the server build cannot resolve it at all. Its browser
 * build only needs the global WebSocket, which workerd has; and the server
 * never opens a subscription anyway (every chain read runs client-side, in
 * effects). So resolve it to the browser build everywhere.
 */
const RPC_WEBSOCKETS_BROWSER = fileURLToPath(
  new URL("./node_modules/rpc-websockets/dist/index.browser.mjs", import.meta.url),
);
const BUFFER_BROWSER = fileURLToPath(
  new URL("./node_modules/buffer/index.js", import.meta.url),
);
export default defineConfig({
  vite: {
    plugins: [networkConsistency()],
    resolve: {
      alias: [
        { find: /^rpc-websockets$/, replacement: RPC_WEBSOCKETS_BROWSER },
        // Match only the browser package import. Never rewrite `node:buffer`:
        // Nitro and crossws need the Worker's native implementation.
        { find: /^buffer$/, replacement: BUFFER_BROWSER },
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Cloudflare's `workerd` runtime is the Lovable deploy target. Keep it
  // that way: a dependency that needs Node built-ins (fs, native addons) will
  // break the deploy, not just local dev — see the rpc-websockets alias above
  // for how the Solana client is kept workerd-compatible.
});
