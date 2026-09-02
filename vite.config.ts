// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
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
