import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs · How SHARPS Works | SHARPS" },
      {
        name: "description",
        content:
          "How SHARPS lists on-chain traders as tradable stocks: pricing, buying and selling, market sessions, wallets, and risk.",
      },
      { property: "og:title", content: "Docs · How SHARPS Works | SHARPS" },
      {
        property: "og:description",
        content: "Pricing, trading mechanics, sessions, and risk — in plain terms.",
      },
    ],
  }),
  component: Docs,
});

type Section = { id: string; label: string };

const SECTIONS: Section[] = [
  { id: "overview", label: "Overview" },
  { id: "listings", label: "Listings & tickers" },
  { id: "pricing", label: "How pricing works" },
  { id: "buying", label: "Buying shares" },
  { id: "selling", label: "Selling shares" },
  { id: "sessions", label: "Market sessions" },
  { id: "wallet", label: "Wallet & network" },
  { id: "risk", label: "Risk & disclosures" },
  { id: "faq", label: "FAQ" },
];

function Docs() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <p className="num text-[10px] tracking-[0.3em] uppercase text-primary">Documentation</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">How SHARPS works</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        SHARPS lists on-chain crypto traders as tradable stocks. This page explains, in plain
        terms, how a listing gets priced, what actually happens on-chain when you buy or sell, and
        what risk you're taking on when you do.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="order-2 h-fit self-start lg:sticky lg:top-24 lg:order-1">
          <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
            On this page
          </p>
          <ul className="mt-3 space-y-1 border-l border-border pl-3">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block py-1 text-xs text-muted-foreground transition-colors hover:text-gold-light"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="order-1 space-y-4 lg:order-2">
          <DocSection id="overview" kicker="01 · Overview" title="Traders, priced like stocks">
            <p>
              Every listing on SHARPS is tied to a single, real Solana wallet — a trader whose
              on-chain activity is public. Instead of buying the coins they trade, you buy shares
              in the trader themselves. As their tracked performance moves, so does the price of
              their stock.
            </p>
            <p>
              Trading is genuinely on-chain: buying and selling call a Solana program directly,
              your shares are real SPL tokens held in your own wallet, and the SOL behind every
              listing sits in that listing's own on-chain vault — not in a company account.
            </p>
          </DocSection>

          <DocSection id="listings" kicker="02 · Listings" title="What a ticker actually is">
            <p>
              Each listing has a ticker (like <span className="num text-foreground">$CENT</span>),
              a name, and a linked wallet address you can verify yourself on any Solana explorer.
              A listing exists on-chain once it's been created by the program admin — until then
              it shows an estimated price only, and can't be traded.
            </p>
            <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
              {[
                ["Share cap", "10,000,000 shares max per listing — a comparability constant, not a solvency limit."],
                ["Open price", "Every listing opens at a neutral baseline (score 50) the moment it's created."],
                ["Verification", "The linked wallet is public — check it against the trader's real on-chain history."],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-4 py-3.5">
                  <p className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">{k}</p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground">{v}</p>
                </div>
              ))}
            </dl>
          </DocSection>

          <DocSection id="pricing" kicker="03 · Pricing" title="How a trader's stock gets priced">
            <p>
              A limited-privilege <em className="not-italic text-foreground">oracle</em> key
              periodically scores each trader from 0–100 based on their tracked on-chain
              performance, and pushes that score to the program. The program converts the score
              into a price and rate-limits how far it can move on any single update, so a price
              can't gap wildly from one push to the next.
            </p>
            <p>
              That oracle key is deliberately narrow: it can only call the price-update
              instruction, which never touches a vault or a mint. Even a fully compromised oracle
              key can nudge a quoted price within the existing limits — it can never move a single
              lamport of anyone's funds.
            </p>
            <InfoCard tone="neutral" title="Quoted price vs. backing">
              The price you see everywhere in the app is the <b>quoted price</b> — what a buy will
              cost you. It is not automatically what a sell will pay out. See{" "}
              <a href="#selling" className="text-gold-light hover:underline">
                Selling shares
              </a>{" "}
              below.
            </InfoCard>
          </DocSection>

          <DocSection id="buying" kicker="04 · Buying" title="What happens when you buy">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Connect a Solana wallet and pick how much SOL you want to spend.</li>
              <li>
                The app quotes you a share count at the listing's current on-chain price, and
                submits a real transaction for your wallet to approve.
              </li>
              <li>
                The program moves your SOL into that listing's vault and mints you the matching
                number of shares as SPL tokens, sent straight to your wallet.
              </li>
              <li>
                A minimum-shares guard protects you if the price moves between the quote and your
                approval — the transaction simply fails rather than filling at a worse price.
              </li>
            </ol>
            <p>
              Shares are always whole numbers — SHARPS doesn't do fractional shares. Any leftover
              SOL that doesn't divide evenly into a whole share stays in your wallet.
            </p>
          </DocSection>

          <DocSection id="selling" kicker="05 · Selling" title="What happens when you sell — and the one risk worth understanding">
            <p>
              Selling burns your shares and pays you SOL out of that specific listing's vault.
              Here's the part that matters: <b className="text-foreground">you're paid the lower
              of two numbers</b> — the quoted price, or that vault's actual spendable balance
              divided across all outstanding shares (its "backing per share").
            </p>
            <p>
              In practice, this only bites when a listing is{" "}
              <em className="not-italic text-foreground">undercollateralized</em> — when its vault
              holds less SOL than its outstanding shares are quoted to be worth. Every trader page
              shows both numbers side by side, and calls this out explicitly whenever backing is
              below the quote, so it's never a surprise at the moment you sell.
            </p>
            <InfoCard tone="warning" title="Why this exists">
              Solvency comes entirely from this rule, not from the share cap. A listing can never
              pay out more SOL than actually sits in its vault, no matter how the quoted price has
              moved — that's what keeps the system honest.
            </InfoCard>
          </DocSection>

          <DocSection id="sessions" kicker="06 · Sessions" title="Market hours">
            <p>
              SHARPS runs on real-world session windows — Asia, London, and New York — rolling
              through the day from 00:00 UTC to 21:00 UTC on weekdays. Prices keep updating
              whenever the overall market is open, and trading is closed outside those hours and
              on weekends.
            </p>
            <p>
              The oracle score refreshes on its own cadence (roughly every 20 minutes) independent
              of session state, so a listing's tracked performance stays current even between
              trades.
            </p>
          </DocSection>

          <DocSection id="wallet" kicker="07 · Wallet & network" title="Connecting and networks">
            <p>
              SHARPS works with any standard Solana wallet extension (Phantom, Solflare, Backpack,
              and others) — click <span className="text-foreground">Connect Wallet</span> in the
              header and approve the connection. No account, email, or signup required.
            </p>
            <p>
              The app defaults to Solana <b>devnet</b> unless explicitly configured for mainnet —
              the network is always shown in your wallet button's tooltip and in the site footer,
              so it's never ambiguous which one you're on. Devnet SOL has no real-world value and
              is only for testing.
            </p>
          </DocSection>

          <DocSection id="risk" kicker="08 · Risk" title="Risk & disclosures">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <b className="text-foreground">Not financial advice.</b> Nothing on this site is a
                recommendation to buy or sell anything. Trader performance is not indicative of
                future results.
              </li>
              <li>
                <b className="text-foreground">Sell payouts can be capped.</b> See{" "}
                <a href="#selling" className="text-gold-light hover:underline">
                  Selling shares
                </a>{" "}
                — an undercollateralized listing pays out less than its quoted price.
              </li>
              <li>
                <b className="text-foreground">Admin controls exist.</b> A program admin key can
                pause trading market-wide or on an individual listing, and can create new
                listings. It cannot access, redirect, or withdraw funds from any vault.
              </li>
              <li>
                <b className="text-foreground">On-chain, irreversible.</b> Every buy and sell is a
                real Solana transaction. Once confirmed, it cannot be undone.
              </li>
            </ul>
          </DocSection>

          <DocSection id="faq" kicker="09 · FAQ" title="Common questions">
            <Accordion type="single" collapsible className="w-full">
              {FAQ.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="text-sm">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </DocSection>

          <div className="rise panel flex flex-wrap items-center justify-between gap-4 px-6 py-6">
            <div>
              <p className="text-sm font-semibold">Ready to look around?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Browse listed traders and see live pricing on the market page.
              </p>
            </div>
            <Link
              to="/market"
              className="group inline-flex h-11 items-center gap-2.5 rounded-lg bg-primary px-5 text-[11px] font-bold tracking-[0.12em] uppercase text-primary-foreground transition-colors duration-200 hover:brightness-[1.06]"
            >
              Open the market
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I need to sign up for an account?",
    a: "No. SHARPS has no accounts, emails, or passwords — connecting a Solana wallet is the only login there is.",
  },
  {
    q: "What am I actually buying — the trader's coin, or something else?",
    a: "Neither the trader's coin nor a share in a company. You're buying an SPL token minted by the SHARPS program that represents a claim on that specific listing's on-chain vault, priced against the trader's tracked performance.",
  },
  {
    q: "Why did my sell pay out less than the quoted price?",
    a: "That listing's vault held less SOL than its outstanding shares were quoted to be worth. Sells always pay the lower of the quote and the vault's actual per-share backing — see \"Selling shares\" above.",
  },
  {
    q: "Can the team move funds out of a listing's vault?",
    a: "No instruction in the program allows the admin, the oracle authority, or anyone else to withdraw or redirect vault funds outside of a normal sell. The admin can only pause trading or create new listings.",
  },
  {
    q: "Is this real money?",
    a: "Depends on the network. The app defaults to devnet (test SOL, no real value) unless explicitly pointed at mainnet, in which case every trade uses real SOL. The current network is always shown in the wallet button and site footer.",
  },
];

function DocSection({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rise panel scroll-mt-24 px-6 py-7 sm:px-8">
      <p className="num text-[10px] tracking-[0.28em] uppercase text-primary">{kicker}</p>
      <h2 className="mt-2 text-xl font-semibold sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground [&_b]:font-semibold">
        {children}
      </div>
    </section>
  );
}

function InfoCard({
  tone,
  title,
  children,
}: {
  tone: "neutral" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3.5 text-xs leading-relaxed ${
        tone === "warning"
          ? "border-down/30 bg-down/8 text-foreground"
          : "border-border bg-surface/60 text-foreground"
      }`}
    >
      <p
        className={`text-[10px] tracking-[0.18em] uppercase ${
          tone === "warning" ? "text-down" : "text-muted-foreground"
        }`}
      >
        {title}
      </p>
      <p className="mt-1.5">{children}</p>
    </div>
  );
}
