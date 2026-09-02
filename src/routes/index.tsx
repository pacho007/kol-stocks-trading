import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { AvatarMark } from "@/components/avatar-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeroShards } from "@/components/hero-shards";
import { KOLS, fmtCompact, fmtUsd } from "@/lib/kols";
import { useMarket, useKolStats } from "@/lib/market-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SHARPS · Invest in Crypto Traders Like Stocks" },
      {
        name: "description",
        content:
          "SHARPS lists on-chain crypto traders as tradable stocks, priced by their measured trading performance rather than their following.",
      },
      { property: "og:title", content: "SHARPS · Invest in Crypto Traders Like Stocks" },
      {
        property: "og:description",
        content: "Their on-chain performance is their share price.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { prices, lastUpdated } = useMarket();

  // Index-wide figures, derived from the same live prices the app trades on
  // rather than hardcoded marketing numbers — a landing page that disagrees
  // with the product behind it is worse than one with no numbers at all.
  const listed = KOLS.length;
  const indexCap = KOLS.reduce((sum, k) => sum + (prices[k.id] ?? 0) * 10_000_000, 0);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Brand wash. Sits behind everything and never intercepts clicks. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[46rem] bg-[radial-gradient(70rem_28rem_at_50%_-12rem,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_72%)] dark:bg-[radial-gradient(70rem_28rem_at_50%_-12rem,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_72%)]"
      />

      <LandingNav />

      <main className="relative mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <Hero listed={listed} indexCap={indexCap} lastUpdated={lastUpdated} />
        <Thesis />
        <HowItWorks />
        <Differentiators />
        <TopTraders />
        <FinalCta />
      </main>

      <footer className="relative border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            SHARPS · Robinhood Chain
          </p>
          <p className="max-w-xl text-[10px] leading-relaxed text-muted-foreground">
            Nothing here is financial advice. Trading is on-chain and irreversible, the contract is
            unaudited, and listings can lose value. Trader names and avatars are public labels, not
            endorsements or proof of identity.
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * Deliberately not the in-app SiteHeader: this page is pre-app, so it carries
 * no wallet, session clock or oracle status. Just identity and a way in.
 */
function LandingNav() {
  return (
    <header className="relative z-20 px-5 pt-5 sm:px-8">
      <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-border/70 bg-card/60 px-4 py-2.5 backdrop-blur-xl sm:px-5">
        <span className="display text-[13px] font-extrabold tracking-[0.3em] uppercase">
          Sharps
        </span>
        <div className="flex items-center gap-2">
          <Link
            to="/docs"
            className="hidden rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Docs
          </Link>
          <ThemeToggle />
          <Link
            to="/app"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[11px] font-bold tracking-[0.12em] uppercase text-primary-foreground transition-all hover:brightness-110"
          >
            Enter App
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Hero({
  listed,
  indexCap,
  lastUpdated,
}: {
  listed: number;
  indexCap: number;
  lastUpdated: string | null;
}) {
  return (
    <section className="relative pt-20 pb-16 text-center sm:pt-24 sm:pb-20">
      {/* Aurora blooms + drifting glass, layered behind the type. All of it is
          aria-hidden and pointer-events-none: it's atmosphere, and it must
          never intercept a click meant for the CTA underneath. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16 h-[42rem] overflow-hidden">
        {/* Weaker in light mode: the same intensity that reads as a glow on
            black turns the whole hero into a pink haze on near-white. */}
        <div className="hero-aurora absolute left-1/2 top-0 h-[30rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)] blur-3xl dark:bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_38%,transparent),transparent)]" />
        <div className="hero-aurora-slow absolute left-1/2 top-16 h-[24rem] w-[38rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--gold-light)_10%,transparent),transparent)] blur-3xl dark:bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--gold-light)_30%,transparent),transparent)]" />
        <HeroShards className="absolute inset-0 h-full w-full" />
      </div>

      <p className="num relative text-[10px] tracking-[0.32em] uppercase text-gold-light">
        Trader stocks on Robinhood Chain
      </p>

      {/* Two stacked copies: the back one is the extrusion, the front is the
          lit glass face. Sized in vw so it fills the viewport the way the
          reference does, clamped so it never overflows narrow screens or
          turns absurd on ultrawide ones. */}
      <div className="hero-float relative mt-6 select-none">
        <h1
          className="display hero-wordmark-depth font-extrabold tracking-[-0.03em]"
          style={{ fontSize: "clamp(3.75rem, 16vw, 12rem)", lineHeight: 0.9 }}
        >
          SHARPS
        </h1>
        <span
          aria-hidden
          className="display hero-wordmark absolute inset-0 font-extrabold tracking-[-0.03em]"
          style={{ fontSize: "clamp(3.75rem, 16vw, 12rem)", lineHeight: 0.9 }}
        >
          SHARPS
        </span>
      </div>

      <p className="relative mx-auto mt-8 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
        Their on-chain performance <span className="text-foreground">is</span> their share price.
        Buy shares in the traders who actually make money — priced by what their wallet did, not
        by how loud they are.
      </p>

      <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/app"
          className="group inline-flex h-12 items-center gap-2.5 rounded-xl bg-primary px-7 text-[12px] font-bold tracking-[0.14em] uppercase text-primary-foreground transition-all hover:brightness-110"
        >
          Enter App
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          to="/docs"
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-input px-6 text-[12px] font-bold tracking-[0.14em] uppercase text-foreground transition-colors hover:bg-accent"
        >
          How it works
        </Link>
      </div>

      <dl className="relative mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
        <Stat label="Traders listed" value={String(listed)} />
        <Stat label="Index market cap" value={fmtCompact(indexCap)} />
        <Stat label="Round trip cost" value="~4%" />
        <Stat label="Oracle" value={lastUpdated ? "Live" : "Standby"} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-4">
      <p className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground">{label}</p>
      <p className="num mt-1.5 text-xl font-bold">{value}</p>
    </div>
  );
}

function Thesis() {
  return (
    <Section kicker="The idea" title="A trader is an asset. Price them like one.">
      <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
        Every listing is one real wallet on Robinhood Chain. We read what it actually did — realized
        PnL, win rate, size, how often it trades — rank it against every other listed trader, and
        that ranking sets the price of their stock.
      </p>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
        No follower counts. No self-reported screenshots. Nothing that can be bought or edited after
        the fact. If a trader stops performing, the price falls, because the score is a live
        ranking rather than a reputation.
      </p>
    </Section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "We read the wallet",
      body: "Each listed trader's history is pulled straight off Robinhood Chain and reduced to realized PnL, win rate, volume and trade count — then ranked against the whole field.",
    },
    {
      n: "02",
      title: "The ranking sets the price",
      body: "That rank becomes a multiplier on the listing's curve. Score 50 is neutral. It moves at most 25% per update, and a trader with barely any trades is held near neutral until they've built a record.",
    },
    {
      n: "03",
      title: "You trade it on-chain",
      body: "Buy and sell against the listing's own reserve. Each share costs a little more than the last, and the reserve always covers a sell at the curve price — so you can always get out.",
    },
  ];

  return (
    <Section kicker="How it works" title="Three moving parts, all of them public.">
      <div className="mt-2 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="bg-card px-6 py-7">
            <p className="num text-[10px] tracking-[0.24em] text-gold-light">{s.n}</p>
            <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Differentiators() {
  const points = [
    {
      title: "A sell can always be paid",
      body: "The reserve is held equal to the curve's value of every outstanding share, so unwinding is covered by construction — not usually, by design. You're never quoted one price and handed less.",
    },
    {
      title: "Priced on skill, not on being early",
      body: "Holders aren't paid out of later buyers. The price moves because the trader's ranking moved, so the thing you're betting on is judgement rather than timing.",
    },
    {
      title: "~4% round trip, none of it a spread",
      body: "2% each way, itemised before you trade: most stays in the listing backing your exit, a slice goes to the trader themselves, a slice to the protocol.",
    },
    {
      title: "The traders get a cut",
      body: "Every listed wallet earns from its own listing and can claim it by signing a transaction — no application, no verification, nothing to prove.",
    },
  ];

  return (
    <Section kicker="Why it's different" title="Built so the obvious failure can't happen.">
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {points.map((p) => (
          <div key={p.title} className="rounded-2xl border border-border bg-card px-6 py-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <Check className="size-3" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** A live sample of the actual index — real listings, real current prices. */
function TopTraders() {
  const sample = KOLS.slice(0, 6);
  return (
    <Section kicker="The index" title={`${KOLS.length} traders listed and priced right now.`}>
      <div className="mt-2 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {sample.map((k) => (
          <TraderPreview key={k.id} id={k.id} />
        ))}
      </div>
      <div className="mt-5">
        <Link
          to="/market"
          className="group inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase text-gold-light hover:underline"
        >
          Browse every listing
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Section>
  );
}

function TraderPreview({ id }: { id: string }) {
  const kol = KOLS.find((k) => k.id === id)!;
  const { price, score } = useKolStats(id);
  return (
    <Link to="/kol/$id" params={{ id }} className="group flex items-center gap-3 bg-card px-5 py-4">
      <AvatarMark gradient={kol.avatar} label={kol.ticker} src={kol.image} size={38} />
      <div className="min-w-0 flex-1">
        <p className="num text-sm font-bold tracking-wider transition-colors group-hover:text-gold-light">
          ${kol.ticker}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{kol.name}</p>
      </div>
      <div className="text-right">
        <p className="num text-sm font-semibold">{fmtUsd(price)}</p>
        <p className="text-[10px] text-muted-foreground">Score {score}</p>
      </div>
    </Link>
  );
}

function FinalCta() {
  return (
    <section className="mt-24 overflow-hidden rounded-3xl border border-border bg-card px-6 py-14 text-center sm:px-12">
      <h2 className="text-2xl font-bold sm:text-3xl">Find them before the timeline does.</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Every listing opens at the same price. Everything after that is earned.
      </p>
      <Link
        to="/app"
        className="group mt-8 inline-flex h-12 items-center gap-2.5 rounded-xl bg-primary px-8 text-[12px] font-bold tracking-[0.14em] uppercase text-primary-foreground transition-all hover:brightness-110"
      >
        Enter App
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-24">
      <p className="num text-[10px] tracking-[0.28em] uppercase text-primary">{kicker}</p>
      <h2 className="mt-2.5 max-w-3xl text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}
