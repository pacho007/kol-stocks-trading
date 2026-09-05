import { ThemeToggle } from "@/components/theme-toggle";
import { SharpsMark } from "@/components/brand";
import { ExplorerLink } from "@/components/explorer-link";
import { Link } from "@tanstack/react-router";
import { Wallet, Menu, ChevronDown } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useMarket } from "@/lib/market-store";
import { useSession } from "@/hooks/use-session";
import { useEvmWallet } from "@/lib/evm/wallet-provider";
import { ACTIVE_CHAIN, MARKET_ADDRESS } from "@/lib/evm/chain";

const NAV = [
  { to: "/market", label: "Market" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/docs", label: "Docs" },
  { to: "/sharps", label: "$SHARPS" },
] as const;

/** Truncated hex address, e.g. "0x7xKX…9fTq", from the connected EVM wallet. */
function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWalletButton({
  full = false,
  size = "sm",
}: {
  full?: boolean;
  size?: "sm" | "lg";
}) {
  const {
    wallets,
    selected,
    address,
    connected,
    connecting,
    wrongChain,
    connect,
    disconnect,
    switchChain,
  } = useEvmWallet();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  /**
   * The menu is portalled to <body> and positioned from the button's rect.
   * It has to be: this button also renders inside the hero, which is
   * `overflow-hidden` to clip its background image to the rounded corners.
   * Any absolutely-positioned child is cut off at that boundary, and no
   * amount of z-index escapes a clipping ancestor — only leaving the
   * subtree does.
   */
  useEffect(() => {
    if (!pickerOpen) return;
    const place = () => {
      const el = pickerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    place();
    // Fixed positioning is viewport-relative, so it must follow scroll.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      // The menu lives outside pickerRef now (it's portalled), so a click
      // inside it would otherwise read as "outside" and close it instantly.
      if (pickerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  // On EVM the wallet is only usable on the right network — surface that as
  // its own state rather than letting a trade fail deep in the contract call.
  if (connected && address && wrongChain) {
    return (
      <button
        onClick={() => {
          switchChain().catch(() => toast.error("Could not switch network"));
        }}
        className={`group inline-flex items-center justify-center gap-2 rounded-lg border text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors duration-200 ${
          size === "lg" ? "h-12 px-6" : "h-9 px-4"
        } ${full ? "w-full" : ""} border-down/40 bg-down/10 text-down hover:bg-down/16`}
        title={`Wrong network — click to switch to ${ACTIVE_CHAIN.name}`}
      >
        <Wallet className="size-3.5 opacity-80" />
        Wrong network
      </button>
    );
  }

  if (connected && address) {
    return (
      <button
        onClick={() => {
          disconnect();
          // Say what actually happened. "Disconnected" alone left people
          // clicking connect again and getting the same account back with no
          // prompt, because the wallet had not been told anything.
          toast("Wallet disconnected", {
            description: "Your wallet will ask which account to use next time.",
          });
        }}
        className={`group inline-flex items-center justify-center gap-2 rounded-lg border text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors duration-200 ${
          size === "lg" ? "h-12 px-6" : "h-9 px-4"
        } ${full ? "w-full" : ""} border-up/30 bg-up/8 text-up hover:bg-up/14`}
        title={`${selected?.info.name ?? "Wallet"} · ${ACTIVE_CHAIN.name} · click to disconnect and choose a different account`}
      >
        <Wallet className="size-3.5 opacity-80" />
        {shortAddress(address)}
      </button>
    );
  }

  const installedWallets = wallets;

  return (
    <div className={`relative ${full ? "w-full" : ""}`} ref={pickerRef}>
      <button
        onClick={() => {
          if (installedWallets.length === 1 && installedWallets[0]) {
            connect(installedWallets[0]).catch(() => {
              /* user rejected the wallet prompt */
            });
          } else {
            setPickerOpen((v) => !v);
          }
        }}
        disabled={connecting}
        className={`group inline-flex items-center justify-center gap-2 rounded-lg border text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors duration-200 disabled:opacity-60 ${
          size === "lg" ? "h-12 px-6" : "h-9 px-4"
        } ${full ? "w-full" : ""} border-primary/25 bg-primary/[0.06] text-gold-light hover:border-primary/50 hover:bg-primary/12`}
      >
        <Wallet className="size-3.5 opacity-80" />
        {connecting ? "Connecting…" : "Connect Wallet"}
        {installedWallets.length > 1 && <ChevronDown className="size-3 opacity-60" />}
      </button>

      {pickerOpen &&
        menuPos &&
        typeof document !== "undefined" &&
        createPortal(
          // Portalled to <body> so a clipping ancestor (the hero panel is
          // overflow-hidden) can't cut it off, and scrollable + viewport-capped
          // because EIP-6963 discovers an unbounded number of wallets.
          <div
            ref={menuRef}
            style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
            className="z-[100] max-h-[min(60vh,22rem)] w-52 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background/95 py-1 shadow-xl backdrop-blur-xl"
          >
            {installedWallets.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                No EVM wallet detected. Install MetaMask or Rabby.
              </p>
            ) : (
              installedWallets.map((w) => (
                <button
                  key={w.info.rdns}
                  onClick={() => {
                    connect(w).catch(() => {
                      /* user rejected the wallet prompt */
                    });
                    setPickerOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-foreground hover:bg-primary/10"
                >
                  {w.info.icon && <img src={w.info.icon} alt="" className="size-4" />}
                  {w.info.name}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const session = useSession();

  return (
    /* Now that this actually sticks (see __root.tsx), it needs a ground —
       otherwise the market grid scrolls visibly through the nav. Blur rather
       than an opaque bar, so the brand wash behind it still reads. */
    <header className="border-b border-border/60 bg-background/72 px-3 pt-3 pb-3 backdrop-blur-xl sm:px-5 sm:pt-4">
      <div className="mx-auto max-w-[80rem]">
        <div className="flex h-14 items-center gap-6 px-1 sm:px-2">
          <Link
            to="/app"
            aria-label="SHARPS home"
            className="group flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <SharpsMark
              size={20}
              className="text-primary transition-transform duration-300 group-hover:-translate-y-px"
            />
            <span className="display text-[13px] font-extrabold tracking-[0.3em] uppercase">
              Sharps
            </span>
          </Link>

          <span className="hidden h-5 w-px bg-border md:block" />

          <nav className="hidden items-center gap-2 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="relative rounded-full border border-border/70 bg-surface/40 px-4 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:bg-primary/[0.06] hover:text-gold-light"
                activeProps={{ className: "border-primary/45 bg-primary/10 text-gold-light" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <OracleStatus />
            {/* Which of the traditional sessions are awake. Context only — the
                contract has no session concept and never blocks a trade, so
                this must never be phrased as whether the market is open. */}
            <div
              data-testid="sessions-indicator"
              className="hidden items-center gap-2 pr-1 sm:flex"
            >
              <span
                className={`size-1.5 rounded-full ${
                  session?.active.length ? "live-dot bg-up" : "bg-muted-foreground/45"
                }`}
              />
              <span className="num text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                {session?.active.length
                  ? `${session.active.map((s) => s.short).join(" / ")} Open`
                  : "Between sessions"}
              </span>
            </div>
            <ThemeToggle />
            <span data-tour="wallet" className="inline-flex">
              <ConnectWalletButton />
            </span>
            <button
              className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-gold-light md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              <Menu className="size-4" />
            </button>
          </div>
        </div>

        {open && (
          <nav className="mt-2 flex flex-col rounded-2xl border border-border bg-background/90 px-4 py-2 backdrop-blur-xl md:hidden">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="py-2 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="num flex items-center gap-2 tracking-wide">
          <SharpsMark size={14} className="shrink-0 text-primary/70" />
          SHARPS © 2026, {ACTIVE_CHAIN.name}. Not financial advice.
        </p>
        {/* The official account, stated where the product itself states it.
            Impersonation is the standard attack on a launch — a fake @sharps
            posting a fake contract address costs somebody their money — and
            the defence is that the real handle is reachable from the site
            rather than only from a post. Same reasoning as the CA box on
            /sharps: this page is the thing people can check against. */}
        <a
          href="https://x.com/TradeSharps"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="SHARPS on X (opens in a new tab)"
          className="num inline-flex items-center gap-2 tracking-wide transition-colors hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          @TradeSharps
        </a>
        {/* The contract holding everyone's money, one click away. Not showing
            it at all was the strangest omission in the product: it is the one
            address a visitor most wants to check before connecting a wallet. */}
        {MARKET_ADDRESS && (
          <p className="num flex items-center gap-1.5 tracking-wide">
            <span className="text-muted-foreground/70">Contract</span>
            <ExplorerLink address={MARKET_ADDRESS} />
          </p>
        )}
        <p className="num tracking-wide">
          Displayed price is a quote, not a guaranteed redemption value — sell payouts are capped by
          each listing&apos;s available on-chain balance.
        </p>
      </div>
    </footer>
  );
}

function OracleStatus() {
  const { lastUpdated } = useMarket();
  const [, tick] = useState(0);
  // re-render every 10s so the "x ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, []);

  if (!lastUpdated) {
    // "Offline" was wrong for every case it actually appeared in. It showed on
    // a deployed site whose oracle was running fine (nothing had published a
    // timestamp the browser could see) and before the first run had ever
    // happened. Claiming a working system is down invites people to distrust
    // prices that are perfectly fresh, so say only what is known: no reading
    // yet.
    return (
      <div
        className="hidden items-center gap-2 sm:flex"
        title="No oracle publish recorded yet. Prices still come from the contract; this only tracks when scores were last refreshed."
      >
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="num text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          Awaiting oracle
        </span>
      </div>
    );
  }

  const secs = Math.max(0, Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000));
  const ago =
    secs < 60
      ? `${secs}s ago`
      : secs < 3600
        ? `${Math.floor(secs / 60)}m ago`
        : `${Math.floor(secs / 3600)}h ago`;
  // Green while within roughly three oracle cycles.
  //
  // What this timestamp is, precisely: publish.ts upserts every row into
  // listing_metrics with a fresh updated_at at the end of each cycle,
  // unconditionally — the ONCHAIN_MIN_SCORE_DELTA deadband gates the on-chain
  // push, not this write. So it already is an oracle heartbeat: it advances
  // whether or not any score moved, and it stops advancing when the oracle
  // stops running or aborts a cycle. There is nothing to add.
  //
  // 75 minutes, sized off what the oracle actually does. CYCLE_SECONDS is the
  // pause BETWEEN cycles (1200) and a cycle itself takes two to six minutes,
  // so a healthy interval is 22-26 minutes. The first transient failure backs
  // off by CYCLE_SECONDS * 2, which pushes the next success out to about 66
  // minutes — so a tighter window would flash red every time an explorer
  // hiccuped. Raising CYCLE_SECONDS means raising this with it.
  const fresh = secs < 75 * 60;

  return (
    <div
      className="hidden items-center gap-2 sm:flex"
      title={`Oracle last completed a cycle ${ago}. It runs about every 22 minutes; scores only change on chain when one moves by 2 or more points.`}
    >
      <span className={`size-1.5 rounded-full ${fresh ? "live-dot bg-up" : "bg-down"}`} />
      <span className="num text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
        Oracle {ago}
      </span>
    </div>
  );
}
