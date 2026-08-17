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
  // Cloudflare Workers' `workerd` runtime can't resolve rpc-websockets or
  // @solana/codecs (both real deps of @solana/web3.js / wallet-adapter,
  // pulled in once real Solana wallet support was added) — neither package
  // publishes an export map entry for that condition. Node fully supports
  // both, so target Node hosting instead. NOTE: a Lovable-platform build
  // still force-pins Cloudflare via LOVABLE_NITRO_PRESET regardless of this
  // override (see this package's own doc comment) — if this app is deployed
  // through Lovable's own CI rather than self-hosted, that will need
  nitro: { preset: "node-server" },
  // Platform builds can still force the workerd/Cloudflare preset, whose export
  // conditions these two packages don't publish. Point them at their browser
  // builds (web-standard APIs only) so resolution succeeds either way.
  vite: {
    resolve: {
      alias: [
        {
          find: /^rpc-websockets$/,
          replacement: "/dev-server/node_modules/rpc-websockets/dist/index.browser.mjs",
        },
        {
          find: /^@solana\/codecs$/,
          replacement: "/dev-server/node_modules/@solana/codecs/dist/index.browser.mjs",
        },
      ],
    },
  },
});

