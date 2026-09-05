import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { KOLS } from "@/lib/kols";
import { TraderBubbles } from "@/components/trader-bubbles";
import bgVideo from "@/assets/sharps-dunes.mp4.asset.json";
import heroPoster from "@/assets/sharps-dunes-poster.jpg.asset.json";

/**
 * Starts false so the server and the first client render agree — reading
 * matchMedia during render would either crash on the server (no window) or
 * produce markup that disagrees with the server's, which makes React discard
 * the whole tree on hydration.
 */
function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHARPS · The Platform for On-Chain Traders" },
      {
        name: "description",
        content:
          "SHARPS lists on-chain crypto traders as tradable stocks. Their performance is their share price. Enter the platform and scout talent before the tape does.",
      },
      { property: "og:title", content: "SHARPS · The Platform for On-Chain Traders" },
      {
        property: "og:description",
        content: "Their on-chain performance is their share price. Enter the platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Splash,
});

function Splash() {
  const tape = KOLS.slice(0, 22);
  const reduceMotion = usePrefersReducedMotion();

  return (
    <div className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-white">
      {/* 4K video backdrop.
          The file is ~40MB, so how it loads matters more than that it loads:
          - poster paints the hero instantly instead of leaving a black box
            for however long 40MB takes on the visitor's connection;
          - preload="none" keeps that 40MB off the critical path — autoPlay
            still starts the fetch, but it no longer competes with the JS and
            CSS needed to make the page interactive;
          - it is skipped entirely under prefers-reduced-motion, where a
            looping full-bleed video is exactly what that setting is for. */}
      {!reduceMotion && (
        <video
          className="pointer-events-none absolute inset-0 -z-20 size-full object-cover"
          src={bgVideo.url}
          poster={heroPoster.url}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
        />
      )}
      {/* Reduced-motion and pre-roll both fall back to the still, so the hero
          never renders as a bare black rectangle. */}
      <img
        src={heroPoster.url}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-30 size-full object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_45%,rgba(255,255,255,0.35)_0%,transparent_55%,rgba(255,255,255,0.35)_100%)]"
      />

      {/* Live listing chips. Sits above the backdrop and below the hero's own
          z-10 content, so a bubble can never overlap the wordmark or the CTAs
          even if a slot is mispositioned. */}
      <TraderBubbles />

      {/* top bar — true 3-column grid so the centre line is viewport-centred */}
      <header
        className="fade-up relative z-10 grid grid-cols-3 items-center px-6 py-7 sm:px-12"
        style={{ animationDelay: "0.05s" }}
      >
        <span className="display text-left text-[11px] font-extrabold tracking-[0.42em] uppercase text-[#3d1024]">
          Sharps
        </span>
        <span className="num hidden text-center text-[10px] tracking-[0.3em] uppercase text-[#3d1024]/60 md:block">
          ON-CHAIN PERFORMANCE PRICED.
        </span>
        <span className="num text-right text-[10px] tracking-[0.3em] uppercase text-[#3d1024]/60">
          Est. 2026
        </span>
      </header>

      {/* hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <h1
          className="fade-up glass-text w-full select-none text-center"
          data-text="SHARPS."
          style={{
            animationDelay: "0.2s",
            fontFamily: 'Nunito, ui-rounded, "Arial Rounded MT Bold", ui-sans-serif, system-ui, sans-serif',
            fontWeight: 900,
            letterSpacing: "0",
            lineHeight: 0.95,
            fontSize: "clamp(3.25rem, 14vw, 12rem)",
          }}
        >
          SHARPS.
        </h1>

        <p
          className="fade-up mt-8 max-w-lg text-balance text-[15px] leading-relaxed text-[#3d1024]/80"
          style={{ animationDelay: "0.5s" }}
        >
          The platform where on-chain traders are listed like stocks. Every green day gaps them up,
          every blowup gaps them down. Scout the talent before the tape does.
        </p>

        <div
          className="fade-up mt-10 flex flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: "0.7s" }}
        >
          <Link
            to="/app"
            className="group inline-flex h-12 items-center gap-3 rounded-lg bg-[#3d1024] px-8 text-[11px] font-extrabold tracking-[0.24em] uppercase text-white shadow-lg transition-transform duration-300 hover:scale-[1.03]"
          >
            OPEN APP
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <Link
            to="/docs"
            className="inline-flex h-12 items-center rounded-lg border border-[#3d1024]/25 bg-white/50 px-7 text-[11px] font-bold tracking-[0.24em] uppercase text-[#3d1024]/80 backdrop-blur transition-colors duration-300 hover:border-[#3d1024]/60 hover:text-[#3d1024]"
          >
            How it works
          </Link>
        </div>
      </main>

      {/* marquee tape */}
      <footer
        className="fade-up relative z-10 border-t border-white/60 bg-white/45 py-3.5 backdrop-blur"
        style={{ animationDelay: "0.9s" }}
      >
        <div className="splash-mask overflow-hidden">
          <div className="marquee flex w-max items-center gap-9 pr-9">
            {[...tape, ...tape].map((k, i) => (
              <span
                key={i}
                className="num flex items-center gap-2 text-[10px] tracking-[0.2em] whitespace-nowrap uppercase text-[#3d1024]/70"
              >
                <span className="font-bold text-[#3d1024]">${k.ticker}</span>
                <span className="opacity-60">{k.name}</span>
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>

  );
}
