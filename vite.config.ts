// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Several Solana deps (rpc-websockets, @solana/codecs and its sub-packages)
 * only publish "browser" and "node" export conditions. Under the Cloudflare
 * /workerd condition set the bundler can't resolve them at all, which fails
 * the build. Resolve those packages to their browser entry (web standard APIs
 * only, safe on both Node and workerd).
 */
function solanaBrowserEntries() {
  const shouldPatch = (id: string) =>
    id === "rpc-websockets" || id.startsWith("@solana/codecs");

  return {
    name: "solana-browser-entries",
    enforce: "pre" as const,
    resolveId(id: string) {
      if (!shouldPatch(id)) return null;
      try {
        const pkgJsonPath = require.resolve(`${id}/package.json`);
        const pkg = require(pkgJsonPath) as {
          exports?: { browser?: { import?: string } };
        };
        const browserEntry = pkg.exports?.browser?.import;
        if (!browserEntry) return null;
        return pkgJsonPath.replace(/package\.json$/, browserEntry.replace(/^\.\//, ""));
      } catch {
        return null;
      }
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Prefer Node hosting (full support for the Solana deps); the plugin above
  // keeps the build working when the platform force-pins the Cloudflare preset.
  nitro: { preset: "node-server" },
  vite: {
    plugins: [solanaBrowserEntries()],
  },
});



