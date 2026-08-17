// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Several Solana deps (rpc-websockets, @solana/codecs*) only publish "browser"
// and "node" export conditions. Under the Cloudflare/workerd condition set the
// bundler can't resolve them at all, so add "browser" (web standard APIs only,
// safe on both Node and workerd) as a fallback condition for the server build.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BROWSER_ONLY_PKGS = ["rpc-websockets", "@solana/codecs", "@solana/codecs-numbers"];

const browserAliases = BROWSER_ONLY_PKGS.flatMap((name) => {
  const dir = fileURLToPath(new URL(`./node_modules/${name}/`, import.meta.url));
  const pkg = JSON.parse(readFileSync(`${dir}package.json`, "utf8")) as {
    exports?: { browser?: { import?: string } };
  };
  const entry = pkg.exports?.browser?.import;
  if (!entry) return [];
  return [
    {
      find: new RegExp(`^${name.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}$`),
      replacement: dir + entry.replace(/^\.\//, ""),
    },
  ];
});

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Prefer Node hosting (full support for the Solana deps); the conditions
  // above keep the build working if the platform force-pins Cloudflare.
  nitro: { preset: "node-server" },
  vite: {
    resolve: { alias: browserAliases },
  },
});
