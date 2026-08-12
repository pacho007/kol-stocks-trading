import { Link } from "@tanstack/react-router";
import { Wallet, Menu } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMarket } from "@/lib/market-store";

const NAV = [
  { to: "/market", label: "Market" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/portfolio", label: "Portfolio" },
] as const;

export function ConnectWalletButton({ full = false }: { full?: boolean }) {
  const { connected, connect, disconnect } = useMarket();

  return (
    <button
      onClick={() => {
        if (connected) {
          disconnect();
          toast("Wallet disconnected");
        } else {
          connect();
          toast.success("Phantom connected (simulated)", {
            description: "7xKX…9fTq · Devnet demo balance loaded",
          });
        }
      }}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold tracking-wide uppercase transition-all ${
        full ? "w-full" : ""
      } ${
        connected
          ? "border-up/40 bg-up/10 text-up hover:bg-up/15"
          : "border-primary/50 bg-primary text-primary-foreground hover:brightness-110 glow"
      }`}
    >
      <Wallet className="size-3.5" />
      {connected ? "7xKX…9fTq" : "Connect Wallet"}
    </button>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5">
          <div className="gold-ring grid size-8 place-items-center rounded-lg p-px transition-transform duration-300 group-hover:rotate-6">
            <span className="display grid size-full place-items-center rounded-[7px] bg-background text-[13px] font-extrabold text-gold-light">
              S
            </span>
          </div>
          <span className="display text-sm font-extrabold tracking-[0.3em] uppercase">Sharps</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="relative rounded-lg px-3 py-1.5 text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground transition-colors hover:text-gold-light"
              activeProps={{ className: "text-gold-light bg-primary/10" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>


        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="live-dot size-1.5 rounded-full bg-up" />
            <span className="num text-[10px] tracking-widest uppercase text-muted-foreground">
              Markets Open
            </span>
          </div>
          <ConnectWalletButton />
          <button
            className="md:hidden text-muted-foreground"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>
      {open && (
        <nav className="flex flex-col border-t border-border px-4 py-2 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              className="py-2 text-xs font-medium tracking-wide uppercase text-muted-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="num tracking-wide">SHARPS © 2026, Simulated market. Not financial advice.</p>
        <p className="num tracking-wide">Prices are mock data. Solana program wiring pending.</p>
      </div>
    </footer>
  );
}
