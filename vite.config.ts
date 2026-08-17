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
 * Several Solana deps (rpc-websockets, @solana/codecs*) only publish "browser"
 * and "node" export conditions, so a Cloudflare/workerd condition set can't
 * resolve them at all and the build fails. Alias them to their browser entry
 * (web standard APIs only, safe on Node and workerd alike).
 */
const BROWSER_ONLY_PKGS = [
  "rpc-websockets",
  "@solana/codecs",
  "@solana/codecs-core",
  "@solana/codecs-numbers",
  "@solana/codecs-strings",
  "@solana/codecs-data-structures",
];

const browserAliases = BROWSER_ONLY_PKGS.flatMap((name) => {
  try {
    const pkgJsonPath = require.resolve(`${name}/package.json`);
    const pkg = require(pkgJsonPath) as { exports?: { browser?: { import?: string } } };
    const entry = pkg.exports?.browser?.import;
    if (!entry) return [];
    return [
      {
        find: new RegExp(`^${name.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}$`),
        replacement: pkgJsonPath.replace(/package\.json$/, entry.replace(/^\.\//, "")),
      },
    ];
  } catch {
    return [];
  }
});

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Prefer Node hosting (full support for the Solana deps); the aliases above
  // keep the build working when the platform force-pins the Cloudflare preset.
  nitro: { preset: "node-server" },
  vite: {
    resolve: { alias: browserAliases },
  },
});




