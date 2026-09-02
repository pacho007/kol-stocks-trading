import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "sharps.theme";

/**
 * Resolve the theme the way the pre-paint script in __root.tsx does, so the
 * button's initial icon matches what's already on screen. Keep the two in
 * sync: if they disagree the icon flips on hydration.
 */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode / storage blocked — the theme still applies for this visit */
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  // Start light on the server and correct on mount. Reading the DOM during
  // render would desync SSR markup from the client and trip hydration.
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    setMounted(true);
  }, []);

  // Follow the OS only while the visitor hasn't made an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (stored) return; // explicit choice wins over the OS
      const next: Theme = e.matches ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      setTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Until mounted the icon is a guess, so don't announce a state that
      // might be wrong to a screen reader mid-hydration.
      aria-label={
        mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Switch theme"
      }
      title={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Switch theme"}
      className={`inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${className}`}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

/**
 * Runs before first paint, inlined in the document head. Without this the
 * page renders light and then snaps to dark on hydration — the classic
 * theme flash. Kept as a string so it can go in a <script> tag verbatim.
 *
 * Mirrors currentTheme()/applyTheme() above: stored choice wins, otherwise
 * follow the OS.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var dark = stored
      ? stored === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`.trim();
