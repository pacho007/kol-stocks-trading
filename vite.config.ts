// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Several Solana deps (rpc-websockets, @solana/codecs*) only publish "browser"
 * and "node" export conditions. Under the Cloudflare/workerd condition set the
 * bundler cannot resolve them at all and the build fails. Resolve those
 * packages to their browser entry (web standard APIs only, safe on both Node
 * and workerd), walking the importer's own node_modules chain so nested copies
 * keep their matching version.
 */
const rootDir = fileURLToPath(new URL("./", import.meta.url));

const isBrowserOnlyPkg = (id: string) =>
  id === "rpc-websockets" || /^@solana\/[a-z0-9-]+$/.test(id);

function findPkgDir(id: string, importer?: string) {
  let dir = importer ? dirname(importer) : rootDir;
  for (let i = 0; i < 20; i++) {
    const candidate = join(dir, "node_modules", id);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const fallback = join(rootDir, "node_modules", id);
  return existsSync(join(fallback, "package.json")) ? fallback : null;
}

function solanaBrowserEntries() {
  return {
    name: "solana-browser-entries",
    enforce: "pre" as const,
    resolveId(id: string, importer?: string) {
      if (!isBrowserOnlyPkg(id)) return null;
      const pkgDir = findPkgDir(id, importer);
      if (!pkgDir) return null;
      try {
        const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as {
          exports?: { browser?: { import?: string } };
        };
        const entry = pkg.exports?.browser?.import;
        if (!entry) return null;
        return resolvePath(pkgDir, entry);
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
  // keeps the build working if the platform force-pins Cloudflare.
  nitro: { preset: "node-server" },
  vite: {
    plugins: [solanaBrowserEntries()],
  },
});
