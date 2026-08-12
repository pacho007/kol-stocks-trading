import { Link } from "@tanstack/react-router";
import { Wallet, Menu } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMarket } from "@/lib/market-store";
import { useSession } from "@/hooks/use-session";

const NAV = [
  { to: "/market", label: "Market" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/portfolio", label: "Portfolio" },
] as const;

export function ConnectWalletButton({
  full = false,
  size = "sm",
}: {
  full?: boolean;
  size?: "sm" | "lg";
}) {
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
      className={`group inline-flex items-center justify-center gap-2 rounded-lg border text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors duration-200 ${
        size === "lg" ? "h-12 px-6" : "h-9 px-4"
      } ${full ? "w-full" : ""} ${
        connected
          ? "border-up/30 bg-up/8 text-up hover:bg-up/14"
          : "border-primary/25 bg-primary/[0.06] text-gold-light hover:border-primary/50 hover:bg-primary/12"
      }`}
    >
      <Wallet className="size-3.5 opacity-80" />
      {connected ? "7xKX…9fTq" : "Connect Wallet"}
    </button>
  );
}


export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const session = useSession();

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto max-w-[80rem]">
        <div className="flex h-14 items-center gap-6 px-1 sm:px-2">
          <Link to="/" className="group flex items-center gap-2.5">
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
