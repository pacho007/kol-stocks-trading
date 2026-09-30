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
  if (typeof document === "undefined") return "dark";
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
  // Start dark (the default) on the server and correct on mount. Reading the
  // DOM during render would desync SSR markup from the client.
  const [theme, setTheme] = useState<Theme>("dark");
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
      // Only a stored choice changes the theme; the OS setting never does.
      if (!stored) return;
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
 * Pre-paint theme, inlined in <head> — see src/routes/__root.tsx. Runs before
 * first paint so the page never flashes light and then snaps to dark.
 *
 * Dark is the default for a first visit. A stored choice still wins, so
 * anyone who switches to light with the toggle stays on light.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    document.documentElement.classList.toggle("dark", stored !== "light");
  } catch (e) {}
})();
`.trim();
