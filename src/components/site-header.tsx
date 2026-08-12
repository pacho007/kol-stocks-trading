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
      className={`group inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold tracking-[0.14em] uppercase transition-all duration-300 hover:-translate-y-px active:translate-y-0 ${
        full ? "w-full" : ""
      } ${
        connected
          ? "border-up/40 bg-up/10 text-up hover:bg-up/15"
          : "border-primary/40 bg-primary text-primary-foreground hover:brightness-110 glow sheen"
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
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto max-w-[80rem]">
        <div className="flex h-14 items-center gap-6 px-1 sm:px-2">
          <Link to="/" className="group flex items-center gap-2.5">
            <div className="gold-ring grid size-7 place-items-center rounded-full p-px transition-transform duration-500 group-hover:rotate-[18deg]">
              <span className="display grid size-full place-items-center rounded-full bg-background text-[12px] font-extrabold text-gold-light">
                S
              </span>
            </div>
            <span className="display text-[13px] font-extrabold tracking-[0.3em] uppercase">Sharps</span>
          </Link>

          <span className="hidden h-5 w-px bg-border md:block" />

          <nav className="hidden items-center gap-0.5 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="relative rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground transition-colors hover:text-gold-light"
                activeProps={{ className: "text-gold-light bg-primary/10" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-surface/50 px-3 py-1.5 sm:flex">
              <span
                className={`size-1.5 rounded-full ${session?.marketOpen ? "live-dot bg-up" : "bg-down"}`}
              />
              <span className="num text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                {session
                  ? session.active.length
                    ? `${session.active.map((s) => s.short).join(" / ")} Session`
                    : session.marketOpen
                      ? "Between Sessions"
                      : "Markets Closed"
                  : "Markets"}
              </span>
            </div>
            <ConnectWalletButton />
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
        <p className="num tracking-wide">SHARPS © 2026, Simulated market. Not financial advice.</p>
        <p className="num tracking-wide">Prices are mock data. Solana program wiring pending.</p>
      </div>
    </footer>
  );
}
