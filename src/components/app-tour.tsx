import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { markTourSeen } from "@/lib/use-app-tour";

/* ---------------------------------------------------------------------------
 * Step artwork.
 *
 * Drawn rather than screenshotted. A screenshot of the market goes stale the
 * first time the layout moves and then quietly teaches the wrong thing; these
 * are built from the same tokens as the app, so they cannot drift out of date
 * and they stay legible in both themes.
 * ------------------------------------------------------------------------ */

function ArtBoard() {
  const rows = [
    { t: "VALI", v: "+18.4%", up: true },
    { t: "SEBA", v: "+6.1%", up: true },
    { t: "LOOP", v: "-4.2%", up: false },
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.t} className="flex items-center gap-3 rounded-md bg-surface/60 px-3 py-2">
          <span className="size-6 shrink-0 rounded-full bg-primary/25" />
          <span className="num text-[11px] font-bold tracking-[0.14em]">${r.t}</span>
          <span
            className={`num ml-auto text-[11px] font-bold tabular-nums ${r.up ? "text-up" : "text-down"}`}
          >
            {r.v}
          </span>
        </div>
      ))}
    </div>
  );
}

function ArtScore() {
  return (
    <div className="px-1 py-3">
      <div className="relative h-2 rounded-full bg-surface">
        <div className="absolute inset-y-0 left-0 w-[72%] rounded-full bg-gradient-to-r from-primary/40 to-primary" />
        {/* The opening line, so "50 is where every listing starts" is visible
            rather than only stated. */}
        <span className="absolute -top-1 left-1/2 h-4 w-px -translate-x-1/2 bg-muted-foreground/60" />
        <span className="absolute top-1/2 left-[72%] size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary" />
      </div>
      <div className="num mt-2 flex justify-between text-[9px] tracking-[0.18em] text-muted-foreground">
        <span>0</span>
        <span>50 · OPEN</span>
        <span>100</span>
      </div>
    </div>
  );
}

function ArtCurve() {
  return (
    <svg viewBox="0 0 240 96" className="h-24 w-full" role="img" aria-label="A rising price curve">
      <defs>
        <linearGradient id="tour-curve" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M4 88 C 70 84, 120 62, 160 40 S 214 12, 236 8 L236 92 L4 92 Z"
        fill="url(#tour-curve)"
      />
      <path
        d="M4 88 C 70 84, 120 62, 160 40 S 214 12, 236 8"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="160" cy="40" r="4.5" fill="var(--primary)" />
    </svg>
  );
}

function ArtFees() {
  const parts = [
    { pct: 50, label: "Reserve", sub: "1%" },
    { pct: 25, label: "Trader", sub: "0.5%" },
    { pct: 25, label: "Protocol", sub: "0.5%" },
  ];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.map((p, i) => (
          <span
            key={p.label}
            style={{ width: `${p.pct}%` }}
            className={i === 0 ? "bg-primary" : i === 1 ? "bg-primary/55" : "bg-primary/30"}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="rounded-md bg-surface/60 px-2 py-2 text-center">
            <p className="num text-sm font-bold">{p.sub}</p>
            <p className="num text-[9px] tracking-[0.16em] uppercase text-muted-foreground">
              {p.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtWallet() {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-5 py-2.5">
        <span className="size-2 rounded-full bg-up" />
        <span className="num text-[10px] font-bold tracking-[0.18em] uppercase text-primary">
          Wallet connected
        </span>
      </div>
      <p className="num text-[10px] tracking-[0.16em] text-muted-foreground">ROBINHOOD CHAIN</p>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

type Step = { kicker: string; title: string; body: string; art: () => React.ReactElement };

/**
 * Five steps, and each one states something checkable.
 *
 * The temptation in an onboarding flow is to write reassurance — "trade with
 * confidence", "powered by advanced analytics". This audience checks claims
 * against the contract, so every number here is one that can be verified on
 * chain, and nothing is promised that the code does not enforce.
 */
const STEPS: Step[] = [
  {
    kicker: "Step 1",
    title: "Every listing is a real wallet",
    body: "Each ticker tracks one on-chain trader. Not a token they launched, not a fund — the wallet itself, and the trades it actually makes.",
    art: ArtBoard,
  },
  {
    kicker: "Step 2",
    title: "Their record sets the score",
    body: "An oracle reads each wallet's trades since launch and publishes a score from 0 to 100 on chain. Every listing opens at 50; the score moves as the trading does.",
    art: ArtScore,
  },
  {
    kicker: "Step 3",
    title: "Price follows the score and the demand",
    body: "Share price is a bonding curve multiplied by the score. Buying moves you up the curve, and a rising score lifts the whole curve — so a good week and a busy week are not the same thing.",
    art: ArtCurve,
  },
  {
    kicker: "Step 4",
    title: "Two percent each way, split in code",
    body: "1% stays in the listing's reserve, which is what pays out every sell. 0.5% accrues to the trader being tracked. 0.5% funds the platform. These are constants in the contract — nobody can change them later.",
    art: ArtFees,
  },
  {
    kicker: "Step 5",
    title: "Connect and take a position",
    body: "Trades settle on Robinhood Chain from your own wallet. There is no account and no deposit — what you buy is held by your address, and Portfolio tracks the rest.",
    art: ArtWallet,
  },
];

/**
 * First-run walkthrough for the app.
 *
 * Opens once per browser and never again unless replayed, which is the whole
 * reason it is worth having: a market whose price mechanism is unusual has to
 * explain itself before someone spends money, and the docs page only reaches
 * people who already went looking.
 *
 * Built on the Dialog primitive rather than a bespoke overlay so it inherits a
 * focus trap, Esc-to-close, scroll locking and the correct ARIA roles — the
 * parts of a modal that are easy to omit and hard to notice missing.
 *
 * It deliberately does NOT spotlight real elements on the page. Coach marks
 * anchored to live DOM nodes break when the layout moves, when data is slow, or
 * on a narrow viewport, and a tour that points at nothing is worse than none.
 * Self-contained artwork cannot come unstuck.
 */
export function AppTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;
  const step = STEPS[i]!;
  const Art = step.art;

  const close = useCallback(() => {
    markTourSeen();
    onOpenChange(false);
  }, [onOpenChange]);

  // Arrow keys, because a five-pane sequence invites them. Radix already
  // handles Esc and the focus trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="px-6 pt-6">
          <p className="num text-[10px] tracking-[0.3em] uppercase text-primary">{step.kicker}</p>
          <DialogTitle className="mt-2 text-xl font-bold tracking-tight">{step.title}</DialogTitle>
        </div>

        {/* Fixed height so the panel does not resize between steps — a modal
            that jumps as you page through it reads as unfinished. */}
        <div className="mt-5 flex min-h-[168px] items-center justify-center px-6">
          <div className="w-full">
            <Art />
          </div>
        </div>

        <DialogDescription className="mt-5 px-6 text-[13px] leading-relaxed text-muted-foreground">
          {step.body}
        </DialogDescription>

        <div className="mt-6 flex items-center gap-3 border-t border-border px-6 py-4">
          {/* Dots double as navigation. Labelled, because a bare dot row is
              unusable with a screen reader. */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, n) => (
              <button
                key={s.kicker}
                onClick={() => setI(n)}
                aria-label={`Go to step ${n + 1}: ${s.title}`}
                aria-current={n === i ? "step" : undefined}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  n === i
                    ? "w-5 bg-primary"
                    : "w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/60"
                }`}
              />
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {i > 0 && (
              <button
                onClick={() => setI(i - 1)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Back
              </button>
            )}
            {last ? (
              <button
                onClick={close}
                className="inline-flex h-9 items-center rounded-md bg-primary px-5 text-[10px] font-bold tracking-[0.16em] uppercase text-primary-foreground transition-colors hover:brightness-110"
              >
                Start trading
              </button>
            ) : (
              <button
                onClick={() => setI(i + 1)}
                className="group inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-5 text-[10px] font-bold tracking-[0.16em] uppercase text-primary-foreground transition-colors hover:brightness-110"
              >
                Next
                <ArrowRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
