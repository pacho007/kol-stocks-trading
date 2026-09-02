import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
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
  const [ready, setReady] = useState(false);

  // Pointer-reactive light. Written to CSS vars rather than React state so the
  // parallax never triggers a re-render on mousemove.
  useEffect(() => {
    setReady(true);
    const el = rootRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", `${x * 100}%`);
      el.style.setProperty("--my", `${y * 100}%`);
      el.style.setProperty("--tx", `${(x - 0.5) * 14}px`);
      el.style.setProperty("--ty", `${(y - 0.5) * 10}px`);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const tape = KOLS.slice(0, 24);

  return (
    <div
      ref={rootRef}
      className="splash-root relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-background"
      style={{ ["--mx" as string]: "50%", ["--my" as string]: "40%" }}
    >
      {/* light field + grid + grain */}
      <div aria-hidden className="splash-light pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="splash-grid pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="splash-grain pointer-events-none absolute inset-0 -z-10" />

      {/* top bar */}
      <header
        className={`relative z-10 flex items-center justify-between px-5 py-6 sm:px-10 ${ready ? "splash-in" : "opacity-0"}`}
        style={{ animationDelay: "0.1s" }}
      >
        <span className="display text-[11px] font-extrabold tracking-[0.4em] uppercase">
          Sharps
        </span>
        <span className="num hidden text-[10px] tracking-[0.28em] uppercase text-muted-foreground sm:block">
          On-chain talent exchange
        </span>
        <span className="num text-[10px] tracking-[0.28em] uppercase text-muted-foreground">
          Est. 2026
        </span>
      </header>

      {/* hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 text-center">
        <p
          className={`num mb-8 text-[10px] tracking-[0.42em] uppercase text-muted-foreground ${ready ? "splash-in" : "opacity-0"}`}
          style={{ animationDelay: "0.25s" }}
        >
          Traders · Priced · Traded
        </p>

        <h1
          className="splash-word display select-none"
          style={{ transform: "translate3d(var(--tx,0),var(--ty,0),0)" }}
        >
          {WORD.map((c, i) => (
            <span
              key={i}
              className={`splash-letter ${ready ? "" : "opacity-0"}`}
              style={{ animationDelay: `${0.35 + i * 0.075}s` }}
            >
              {c}
            </span>
          ))}
        </h1>

        <p
          className={`mt-8 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base ${ready ? "splash-in" : "opacity-0"}`}
          style={{ animationDelay: "0.9s" }}
        >
          The exchange where on-chain traders are listed like stocks. Every green day gaps them up,
          every blowup gaps them down. Scout the talent before the tape does.
        </p>

        <div
          className={`mt-10 flex flex-col items-center gap-4 sm:flex-row ${ready ? "splash-in" : "opacity-0"}`}
          style={{ animationDelay: "1.05s" }}
        >
          <Link
            to="/app"
            className="enter-cta group relative inline-flex h-12 items-center gap-3 overflow-hidden rounded-full bg-primary px-8 text-[11px] font-extrabold tracking-[0.24em] uppercase text-primary-foreground"
          >
            <span className="relative z-10">Enter App</span>
            <ArrowUpRight className="relative z-10 size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <Link
            to="/docs"
            className="inline-flex h-12 items-center rounded-full border border-border px-7 text-[11px] font-bold tracking-[0.24em] uppercase text-muted-foreground transition-colors duration-300 hover:border-primary/50 hover:text-gold-light"
          >
            How it works
          </Link>
        </div>
      </main>

      {/* marquee tape */}
      <footer
        className={`relative z-10 border-t border-border/70 py-4 ${ready ? "splash-in" : "opacity-0"}`}
        style={{ animationDelay: "1.25s" }}
      >
        <div className="splash-mask overflow-hidden">
          <div className="marquee flex w-max items-center gap-10 pr-10">
            {[...tape, ...tape].map((k, i) => (
              <span
                key={i}
                className="num flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground"
              >
                <span className="text-gold-light">${k.ticker}</span>
                <span className="opacity-60">{k.name}</span>
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
