import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { KOLS } from "@/lib/kols";
import bgVideo from "@/assets/sharps-bg-4k.mp4.asset.json";

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

function Splash() {
  const tape = KOLS.slice(0, 22);

  return (
    <div className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#05060c]">
      {/* 4K video backdrop */}
      <video
        className="pointer-events-none absolute inset-0 -z-20 size-full object-cover"
        src={bgVideo.url}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_50%,transparent_0%,rgba(3,4,10,0.55)_75%,rgba(3,4,10,0.9)_100%)]"
      />

      {/* top bar */}
      <header
        className="fade-up relative z-10 flex items-center justify-between px-6 py-7 sm:px-12"
        style={{ animationDelay: "0.05s" }}
      >
        <span className="display text-[11px] font-extrabold tracking-[0.42em] uppercase text-white/90">
          Sharps
        </span>
        <span className="num hidden text-[10px] tracking-[0.3em] uppercase text-white/50 md:block">
          On-chain talent exchange
        </span>
        <span className="num text-[10px] tracking-[0.3em] uppercase text-white/50">Est. 2026</span>
      </header>

      {/* hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <h1
          className="fade-up display select-none text-white"
          style={{
            animationDelay: "0.2s",
            fontWeight: 800,
            letterSpacing: "0.06em",
            lineHeight: 0.9,
            fontSize: "clamp(3.4rem, 15vw, 13rem)",
            textShadow: "0 0 60px rgba(255,255,255,0.35), 0 0 140px rgba(120,180,255,0.35)",
          }}
        >
          SHARPS
        </h1>

        <p
          className="fade-up mt-8 max-w-lg text-balance text-[15px] leading-relaxed text-white/70"
          style={{ animationDelay: "0.5s" }}
        >
          The exchange where on-chain traders are listed like stocks. Every green day gaps them up,
          every blowup gaps them down. Scout the talent before the tape does.
        </p>

        <div
          className="fade-up mt-10 flex flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: "0.7s" }}
        >
          <Link
            to="/app"
            className="group inline-flex h-12 items-center gap-3 rounded-lg bg-white px-8 text-[11px] font-extrabold tracking-[0.24em] uppercase text-[#05060c] transition-transform duration-300 hover:scale-[1.03]"
          >
            Enter Exchange
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <Link
            to="/docs"
            className="inline-flex h-12 items-center rounded-lg border border-white/25 bg-white/5 px-7 text-[11px] font-bold tracking-[0.24em] uppercase text-white/75 backdrop-blur transition-colors duration-300 hover:border-white/60 hover:text-white"
          >
            How it works
          </Link>
        </div>
      </main>

      {/* marquee tape */}
      <footer
        className="fade-up relative z-10 border-t border-white/10 bg-black/30 py-3.5 backdrop-blur"
        style={{ animationDelay: "0.9s" }}
      >
        <div className="splash-mask overflow-hidden">
          <div className="marquee flex w-max items-center gap-9 pr-9">
            {[...tape, ...tape].map((k, i) => (
              <span
                key={i}
                className="num flex items-center gap-2 text-[10px] tracking-[0.2em] whitespace-nowrap uppercase text-white/60"
              >
                <span className="font-bold text-white">${k.ticker}</span>
                <span className="opacity-60">{k.name}</span>
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
