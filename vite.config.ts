// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

const pkgFile = (p: string) => fileURLToPath(new URL(`./node_modules/${p}`, import.meta.url));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Cloudflare Workers' `workerd` runtime can't resolve rpc-websockets or
  // @solana/codecs (both real deps of @solana/web3.js / wallet-adapter).
  // Prefer Node hosting, but platform builds can still force the Cloudflare
  // preset, so also alias those two packages to their browser builds (web
  // standard APIs only) which resolve under every condition set.
  nitro: { preset: "node-server" },
  vite: {
    resolve: {
      alias: [
        {
          find: /^rpc-websockets$/,
          replacement: pkgFile("rpc-websockets/dist/index.browser.mjs"),
        },
        {
          find: /^@solana\/codecs$/,
          replacement: pkgFile("@solana/codecs/dist/index.browser.mjs"),
        },
      ],
    },
  },
});


