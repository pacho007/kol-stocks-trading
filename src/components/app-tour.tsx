import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { markTourSeen } from "@/lib/use-app-tour";

/**
 * A step points at a real element via data-tour, never a CSS selector.
 *
 * The attribute is a contract: it exists only to be found by this tour and it
 * shows up in a grep, so a refactor that removes the element is visibly
 * removing an anchor. A class-based selector looks harmless to delete and takes
 * the tour down silently.
 */
type Step = {
  anchor: string;
  kicker: string;
  title: string;
  body: string;
  /** Where the card prefers to sit. Falls back automatically when it won't fit. */
  prefer?: "top" | "bottom" | "left" | "right";
};

/**
 * Five stops, each pointing at something real on the page and each stating
 * something checkable.
 *
 * The temptation in onboarding is reassurance — "trade with confidence",
 * "powered by advanced analytics". This audience reads the contract, so every
 * number here is verifiable on chain and nothing is promised that the code does
 * not enforce.
 */
const STEPS: Step[] = [
  {
    anchor: "markets",
    kicker: "",
    title: "Every listing is a real wallet",
    body: "This rail is the board. Each ticker tracks one on-chain trader — not a token they launched, not a fund. The wallet itself, and the trades it actually makes.",
    prefer: "right",
  },
  {
    anchor: "scored",
    kicker: "",
    title: "Their record sets the score",
    body: "An oracle re-reads every listed wallet on a loop and publishes a score from 0 to 100 on chain. This counter is how many have been scored so far. Every listing opens at 50.",
    prefer: "bottom",
  },
  {
    anchor: "index",
    kicker: "",
    title: "Price follows the score and the demand",
    body: "Share price is a bonding curve multiplied by that score. Buying moves you up the curve; a rising score lifts the whole curve. A good week and a busy week are not the same thing.",
    prefer: "top",
  },
  {
    anchor: "how",
    kicker: "",
    title: "Two percent each way, split in code",
    body: "Every trade pays 2%. 1% stays in the listing's reserve, which is what pays out every sell. 0.5% accrues to the trader being tracked. 0.5% funds the platform. All three are constants in the contract — nobody can change them later.",
    prefer: "left",
  },
  {
    anchor: "wallet",
    kicker: "",
    title: "Connect and take a position",
    body: "Trades settle on Robinhood Chain from your own wallet. No account, no deposit — what you buy is held by your address, and Portfolio tracks the rest.",
    prefer: "bottom",
  },
];

const CARD_W = 340;
const PAD = 10; // breathing room inside the spotlight cutout
const GAP = 14; // between cutout and card
const EDGE = 12; // minimum distance from the viewport edge

type Rect = { top: number; left: number; width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

function findAnchor(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
}

/**
 * Guided walkthrough of the app: the page stays on screen and the tour moves
 * around it, dimming everything except the thing being described.
 *
 * A market that prices shares off a bonding curve multiplied by an oracle score
 * has to explain itself before anyone spends money, and the docs page only
 * reaches people who already went looking.
 *
 * ANCHORING, AND WHY IT DEGRADES INSTEAD OF BREAKING
 *
 * Every stop names a data-tour attribute. When the tour opens, each anchor is
 * resolved and measured, and a step whose anchor is missing or has no size —
 * removed in a refactor, hidden at this breakpoint, still loading — is dropped
 * from the run rather than shown pointing at the top-left corner. The step
 * counter is numbered after that filter, so "2 of 4" is always honest about
 * what the visitor will actually be shown. If nothing resolves, the tour closes
 * itself instead of rendering an empty spotlight. That is the standing risk of
 * an element-anchored tour, handled explicitly rather than hoped away.
 *
 * The highlight is re-measured on scroll, on resize, and whenever the element
 * itself changes size, so it tracks its target instead of drifting off it the
 * first time the layout moves.
 */
export function AppTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(210);
  const [steps, setSteps] = useState<Step[]>([]);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Portalled, so the overlay is never clipped by an ancestor's overflow or
  // trapped underneath a stacking context on the page.
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => setHost(document.body), []);

  const close = useCallback(() => {
    markTourSeen();
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const usable = STEPS.filter((s) => {
      const el = findAnchor(s.anchor);
      return el !== null && el.getBoundingClientRect().width > 0;
    });
    if (usable.length === 0) {
      close();
      return;
    }
    setSteps(usable.map((s, n) => ({ ...s, kicker: `${n + 1} of ${usable.length}` })));
    setI(0);
  }, [open, close]);

  const step = steps[i];

  // Measure the current anchor, and keep measuring while anything moves.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = findAnchor(step.anchor);
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    // Bring it into view first. Smooth scrolling fires scroll events the whole
    // way, and the listener below turns those into a highlight that travels
    // with the page rather than snapping into place once the scroll ends.
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    measure();

    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [open, step]);

  // The card's real height decides whether it fits above or below, so it has to
  // be measured rather than assumed.
  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [i, rect, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, steps.length]);

  if (!open || !host || !step || !rect) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };

  // Place the card: honour the preferred side when it fits, otherwise take
  // whichever side has room. Everything is clamped to the viewport, so the card
  // stays fully on screen even when its target sits against an edge.
  const fits = {
    bottom: vh - hole.top - hole.height - GAP >= cardH + EDGE,
    top: hole.top - GAP >= cardH + EDGE,
    right: vw - hole.left - hole.width - GAP >= CARD_W + EDGE,
    left: hole.left - GAP >= CARD_W + EDGE,
  };
  const order: ("bottom" | "top" | "right" | "left")[] = [
    step.prefer ?? "bottom",
    "bottom",
    "top",
    "right",
    "left",
  ];
  const side = order.find((s) => fits[s]) ?? "bottom";

  let top: number;
  let left: number;
  if (side === "bottom" || side === "top") {
    top = side === "bottom" ? hole.top + hole.height + GAP : hole.top - cardH - GAP;
    left = hole.left + hole.width / 2 - CARD_W / 2;
  } else {
    left = side === "right" ? hole.left + hole.width + GAP : hole.left - CARD_W - GAP;
    top = hole.top + hole.height / 2 - cardH / 2;
  }
  top = clamp(top, EDGE, Math.max(EDGE, vh - cardH - EDGE));
  left = clamp(left, EDGE, Math.max(EDGE, vw - CARD_W - EDGE));

  const last = i === steps.length - 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How SHARPS works"
      className="fixed inset-0 z-[100]"
    >
      {/* The dim, with a hole cut in it. One SVG rather than four positioned
          shades, so the cutout can carry rounded corners that match the panels
          underneath. It also swallows clicks: while the tour runs, the only
          controls are the tour's own. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="sharps-tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={hole.left}
              y={hole.top}
              width={hole.width}
              height={hole.height}
              rx="12"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgb(9 6 12 / 0.72)"
          mask="url(#sharps-tour-mask)"
        />
      </svg>

      {/* Ring around the live element. Non-interactive, so it never sits
          between the pointer and the thing it is outlining. */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-xl ring-2 ring-primary/70 transition-all duration-300 ease-out"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
        }}
      />

      <div
        ref={cardRef}
        className="absolute rounded-xl border border-border bg-background p-5 shadow-2xl transition-[top,left] duration-300 ease-out"
        style={{ top, left, width: CARD_W }}
      >
        <button
          onClick={close}
          aria-label="Close the walkthrough"
          className="absolute top-3 right-3 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <p className="num text-[10px] tracking-[0.3em] uppercase text-primary">{step.kicker}</p>
        <h2 className="mt-2 pr-6 text-base leading-snug font-bold tracking-tight">{step.title}</h2>
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>

        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3.5">
          <div className="flex items-center gap-1.5">
            {steps.map((s, n) => (
              <button
                key={s.anchor}
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

          <div className="ml-auto flex items-center gap-1.5">
            {i > 0 && (
              <button
                onClick={() => setI(i - 1)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Back
              </button>
            )}
            <button
              onClick={() => (last ? close() : setI(i + 1))}
              className="group inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 text-[10px] font-bold tracking-[0.16em] uppercase text-primary-foreground transition-colors hover:brightness-110"
            >
              {last ? "Start trading" : "Next"}
              {!last && (
                <ArrowRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    host,
  );
}
