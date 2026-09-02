import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { KOLS } from "@/lib/kols";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHARPS · The Exchange for On-Chain Traders" },
      {
        name: "description",
        content:
          "SHARPS lists on-chain crypto traders as tradable stocks. Their performance is their share price. Enter the exchange and scout talent before the market does.",
      },
      { property: "og:title", content: "SHARPS · The Exchange for On-Chain Traders" },
      {
        property: "og:description",
        content: "Their on-chain performance is their share price. Enter the exchange.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Splash,
});

const WORD = "SHARPS".split("");

function Splash() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", `${x * 100}%`);
      el.style.setProperty("--my", `${y * 100}%`);
      el.style.setProperty("--tx", `${(x - 0.5) * 10}px`);
      el.style.setProperty("--ty", `${(y - 0.5) * 7}px`);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const tape = KOLS.slice(0, 22);

  return (
    <div
      ref={rootRef}
      className="splash-root relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-background"
      style={{ ["--mx" as string]: "50%", ["--my" as string]: "35%" }}
    >
      <div aria-hidden className="splash-light pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="splash-grid pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="splash-grain pointer-events-none absolute inset-0 -z-10" />

      {/* top bar */}
      <header className="fade-up relative z-10 flex items-center justify-between px-6 py-7 sm:px-12" style={{ animationDelay: "0.05s" }}>
        <span className="display text-[11px] font-extrabold tracking-[0.42em] uppercase text-foreground">
          Sharps
        </span>
        <span className="num hidden text-[10px] tracking-[0.3em] uppercase text-muted-foreground md:block">
          On-chain talent exchange
        </span>
        <span className="num text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          Est. 2026
        </span>
      </header>

      {/* hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
        <div
          className="fade-up mb-10 inline-flex items-center gap-2.5 rounded-full border border-border bg-card/70 px-4 py-1.5 backdrop-blur"
          style={{ animationDelay: "0.2s" }}
        >
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="num text-[10px] tracking-[0.28em] uppercase text-muted-foreground">
            {KOLS.length} traders listed
          </span>
        </div>

        <h1
          className="splash-word display select-none"
          style={{ transform: "translate3d(var(--tx,0),var(--ty,0),0)" }}
        >
          {WORD.map((c, i) => (
            <span key={i} className="splash-letter" style={{ animationDelay: `${0.25 + i * 0.07}s` }}>
              {c}
            </span>
          ))}
        </h1>

        <p
          className="fade-up mt-9 max-w-lg text-balance text-[15px] leading-relaxed text-muted-foreground"
          style={{ animationDelay: "0.85s" }}
        >
          The exchange where on-chain traders are listed like stocks. Every green day gaps them up,
          every blowup gaps them down. Scout the talent before the tape does.
        </p>

        <div
          className="fade-up mt-11 flex flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: "1s" }}
        >
          <Link
            to="/app"
            className="enter-cta group relative inline-flex h-12 items-center gap-3 overflow-hidden rounded-lg bg-primary px-8 text-[11px] font-extrabold tracking-[0.24em] uppercase text-primary-foreground"
          >
            <span className="relative z-10">Enter Exchange</span>
            <ArrowRight className="relative z-10 size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <Link
            to="/docs"
            className="inline-flex h-12 items-center rounded-lg border border-border bg-card/60 px-7 text-[11px] font-bold tracking-[0.24em] uppercase text-muted-foreground backdrop-blur transition-colors duration-300 hover:border-primary/60 hover:text-primary"
          >
            How it works
          </Link>
        </div>
      </main>

      {/* marquee tape */}
      <footer
        className="fade-up relative z-10 border-t border-border/70 bg-card/40 py-3.5 backdrop-blur"
        style={{ animationDelay: "1.15s" }}
      >
        <div className="splash-mask overflow-hidden">
          <div className="marquee flex w-max items-center gap-9 pr-9">
            {[...tape, ...tape].map((k, i) => (
              <span
                key={i}
                className="num flex items-center gap-2 text-[10px] tracking-[0.2em] whitespace-nowrap uppercase text-muted-foreground"
              >
                <span className="font-bold text-primary">${k.ticker}</span>
                <span className="opacity-60">{k.name}</span>
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
