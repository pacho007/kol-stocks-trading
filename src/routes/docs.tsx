import { createFileRoute, Link } from "@tanstack/react-router";
import { KOLS } from "@/lib/kols";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowRight } from "lucide-react";

/** Listings carrying a real handle, counted rather than asserted in prose. */
const TAGGED = KOLS.filter((k) => k.handle && k.handle.length > 1).length;

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
  { id: "identity", label: "Trader identity" },
  { id: "scoring", label: "The scoring model" },
  { id: "pricing", label: "Score → price" },
  { id: "buying", label: "Buying shares" },
  { id: "selling", label: "Selling shares" },
  { id: "feed", label: "The shared feed" },
  { id: "architecture", label: "Architecture" },
  { id: "security", label: "Security model" },
  { id: "sessions", label: "Market sessions" },
  { id: "wallet", label: "Wallet & network" },
  { id: "risk", label: "Risk & disclosures" },
  { id: "glossary", label: "Glossary" },
  { id: "faq", label: "FAQ" },
];

function Docs() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <p className="num text-[10px] tracking-[0.3em] uppercase text-primary">Documentation</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">How SHARPS works</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        SHARPS lists on-chain crypto traders as tradable stocks. This page explains, in plain terms,
        how a listing gets priced, what actually happens on-chain when you buy or sell, and what
        risk you're taking on when you do.
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
              Every listing on SHARPS is tied to a single, real wallet on{" "}
              <b className="text-foreground">Robinhood Chain</b> — a trader whose on-chain activity
              is public. Instead of buying the coins they trade, you buy shares in the trader
              themselves. As their tracked performance moves, so does the price of their stock.
            </p>
            <p>
              Trading is genuinely on-chain: buying and selling call the SHARPS contract directly,
              your shares are recorded in that contract's own ledger against your address, and the
              ETH behind every listing sits in that listing's own on-chain vault — not in a company
              account.
            </p>
            <p>
              Price, chart, and market cap are served from one shared feed rebuilt from the
              contract's own on-chain events — so every trader looking at a listing sees the same
              numbers at the same moment, rather than whatever their own browser happened to poll.
            </p>
          </DocSection>

          <DocSection id="listings" kicker="02 · Listings" title="What a ticker actually is">
            <p>
              Each listing has a ticker (like <span className="num text-foreground">$COOK</span>), a
              name, and a linked wallet address you can verify yourself on any Robinhood Chain
              explorer. A listing exists on-chain once it's been created by the contract admin —
              until then it shows an estimated price only, and can't be traded.
            </p>
            <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
              {[
                [
                  "Share cap",
                  "10,000,000 shares max per listing — a comparability constant, not a solvency limit.",
                ],
                [
                  "Open price",
                  "Every listing opens at a neutral baseline (score 50) the moment it's created.",
                ],
                [
                  "Verification",
                  "The linked wallet is public — check it against the trader's real on-chain history.",
                ],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-4 py-3.5">
                  <p className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                    {k}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground">{v}</p>
                </div>
              ))}
            </dl>
          </DocSection>

          <DocSection id="identity" kicker="03 · Identity" title="Who a listing actually is">
            <p>
              A listing is a <b className="text-foreground">wallet address</b> first and a person
              second. The address is the part that's verifiable; the name, avatar, and X link
              attached to it are best-effort labels from public wallet-tagging data.
            </p>
            <p>
              {TAGGED} of the {KOLS.length} listed traders have a name, avatar, and linked X
              account. {KOLS.length - TAGGED === 1 ? "One is" : `${KOLS.length - TAGGED} are`}{" "}
              genuinely untagged and show a shortened address instead. Those are left blank rather
              than guessed — attributing the wrong X account to a real trader is worse than showing
              none at all.
            </p>
            <InfoCard tone="warning" title="Verify before you trade on a name">
              A label is not proof of ownership. If it matters that a listing really is who it says
              it is, check the wallet address yourself on a Robinhood Chain explorer first. Some
              traders also run more than one tracked wallet, so the same person can appear as two
              listings with distinct tickers.
            </InfoCard>
          </DocSection>

          <DocSection id="scoring" kicker="04 · Scoring" title="How the score is calculated">
            <p>
              Each listed wallet is read directly from the chain and reduced to four measurements
              over a trailing window: <b className="text-foreground">realized PnL</b>,{" "}
              <b className="text-foreground">win rate</b>, <b className="text-foreground">volume</b>
              , and <b className="text-foreground">trade count</b>.
            </p>
            <p>
              Each is converted to a{" "}
              <em className="not-italic text-foreground">
                percentile rank against every other listed trader
              </em>{" "}
              — so a score answers "how does this trader compare to the field", not "how big are
              their numbers". Someone doing $10M of volume and someone doing $10k are directly
              comparable. The four percentiles are then blended by weight:
            </p>
            <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              {[
                ["50%", "Realized PnL — the strongest single signal of skill."],
                ["20%", "Win rate — consistency."],
                ["15%", "Volume — conviction, log-compressed so whales don't flatten everyone."],
                ["15%", "Trade count — activity and sample size."],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-4 py-3.5">
                  <p className="num text-sm font-bold text-foreground">{k}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{v}</p>
                </div>
              ))}
            </dl>
            <p className="mt-4">
              Because it's a ranking,{" "}
              <b className="text-foreground">a score falls as well as rises</b>. A trader can have a
              decent month and still slide if the rest of the field did better.
            </p>
            <InfoCard tone="neutral" title="Small samples are pulled toward neutral">
              A wallet with very few recorded trades is shrunk toward the neutral midpoint of 50, in
              proportion to how little data there is. One lucky trade nudges a score; it can't swing
              it. Only a sustained record earns the full percentile — which is the entire point of
              pricing on skill rather than noise.
            </InfoCard>
            <p>
              Two more brakes: a trader with no post-launch trades sits at exactly 50 (everyone
              starts equal), and the score moves at most 25% of the way toward its new target per
              update cycle.
            </p>
          </DocSection>

          <DocSection id="pricing" kicker="05 · Pricing" title="How a trader's stock gets priced">
            <p>
              Price comes from two things multiplied together: a{" "}
              <b className="text-foreground">bonding curve</b> that responds to supply, and a{" "}
              <b className="text-foreground">score multiplier</b> that responds to performance.
            </p>
            <p>
              <b className="text-foreground">The curve.</b> Each share costs slightly more than the
              one before it. Buying walks the price up; selling walks it back down. Crucially, every
              wei paid in stays in that listing's own reserve, and the reserve is kept exactly equal
              to the curve's value of all outstanding shares. That equality is what guarantees a
              sell can always be paid in full.
            </p>
            <p>
              <b className="text-foreground">The multiplier.</b> A limited-privilege{" "}
              <em className="not-italic text-foreground">oracle</em> key pushes each trader's score
              (see{" "}
              <a href="#scoring" className="text-gold-light hover:underline">
                the scoring model
              </a>
              ) to the contract, and the contract turns that score into a multiplier on the whole
              curve. Score 50 is neutral (1×); higher lifts the curve, lower drops it.
            </p>
            <InfoCard tone="neutral" title="Why a rising score doesn't always move the price">
              A higher multiplier means every outstanding share is redeemable for more — that's a
              claim on the reserve. So the contract only raises the multiplier as far as the reserve
              can actually cover. Trading fees build that headroom over time.
              <br />
              <br />
              The consequence, stated plainly: a trader who's performing well but has barely been
              traded will show a <b>high score and a price still catching up</b>. The listing page
              shows that gap rather than hiding it. The alternative — quoting a price the reserve
              can't honour — is exactly the failure this design exists to remove.
            </InfoCard>
            <p>
              A falling score applies immediately and in full, since it shrinks what the reserve has
              to cover and can never threaten solvency.
            </p>
            <p>
              The oracle key is deliberately narrow: it can only push scores. It cannot touch a
              reserve or a share balance. Even fully compromised, it can nudge a multiplier within
              the solvency bound and the 25%-per-update rate cap — it can never move a single wei of
              anyone's funds.
            </p>
          </DocSection>

          <DocSection id="buying" kicker="06 · Buying" title="What happens when you buy">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Connect an EVM wallet on Robinhood Chain and pick how much ETH you want to spend.
              </li>
              <li>
                The app quotes you a share count at the listing's current on-chain price, and
                submits a real transaction for your wallet to approve.
              </li>
              <li>
                The contract moves your ETH into that listing's vault and credits you the matching
                number of shares in its ledger, against your address.
              </li>
              <li>
                A minimum-shares guard protects you if the price moves between the quote and your
                approval — the transaction simply fails rather than filling at a worse price.
              </li>
            </ol>
            <p>
              Shares are always whole numbers — SHARPS doesn't do fractional shares. Any leftover
              ETH that doesn't divide evenly into a whole share is refunded to you in the same
              transaction, not absorbed.
            </p>
            <InfoCard tone="neutral" title="How shares are held">
              Shares live in the SHARPS contract's own ledger keyed to your address — they are not
              ERC-20 tokens, so they won't appear in your wallet's token list and can't be traded on
              an outside DEX. You can send them to another address directly through the contract,
              and only you can move your own balance.
            </InfoCard>
          </DocSection>

          <DocSection id="selling" kicker="07 · Selling" title="What happens when you sell">
            <p>
              Selling burns your shares and pays you ETH out of that listing's reserve, at the full
              curve price, minus the 2% sell fee. You walk back down the same curve you bought on,
              so each share you sell fetches slightly less than the one before it.
            </p>
            <InfoCard tone="neutral" title="A sell can always be paid">
              The reserve is held equal to the curve's value of every outstanding share. Unwinding
              your shares along that same curve is therefore always covered — not usually, not
              probably, but by construction. There is no code path that can pay you less than the
              quote you were shown.
            </InfoCard>
            <p>
              This is the main thing that changed from the earlier design, and it's worth being
              explicit about: the old model quoted one price and paid{" "}
              <em className="not-italic text-foreground">min(quote, pro-rata backing)</em>, meaning
              a thin listing could hand you less than the screen said at the moment you sold. That
              cannot happen now. The cost of that guarantee is the fee, and the fact that a rising
              score lifts price only as fast as the reserve can back it.
            </p>
            <p>
              Selling reduces supply, so the price steps down for remaining holders — exactly the
              mirror of your buy stepping it up.
            </p>
          </DocSection>

          <DocSection id="feed" kicker="08 · The feed" title="Why everyone sees the same numbers">
            <p>
              Price, chart, and market cap are served from a single shared feed, rebuilt from the
              contract's own on-chain events by an indexer, and pushed to every connected browser in
              real time.
            </p>
            <p>
              That matters because people trade against each other here. An earlier version had each
              browser poll the chain on its own timer and record its own price history locally —
              which meant two people looking at the same listing could genuinely see different
              charts, and a new visitor saw a flat line until their own session had been open long
              enough. That's replaced.
            </p>
            <p>
              The chain remains the source of truth. The feed is a queryable mirror of it, and can
              be rebuilt from scratch by replaying events, so it can't drift into being its own
              separate version of reality.
            </p>
          </DocSection>

          <DocSection id="architecture" kicker="09 · Architecture" title="What runs where">
            <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border">
              {[
                [
                  "The contract (on Robinhood Chain)",
                  "Holds every listing, every reserve, and every share balance. Buys, sells, and score updates are all real transactions against it. It is the only thing that can move funds.",
                ],
                [
                  "The scoring pipeline (off-chain)",
                  "Reads each tracked wallet's history from the chain via a public explorer API, reconstructs realized PnL and win rate, ranks the field, and pushes the resulting scores on-chain with a narrow oracle key.",
                ],
                [
                  "The indexer (off-chain)",
                  "Watches the contract's PriceUpdated events and writes them to a shared database, which every client reads. Idempotent: replaying the same events can't duplicate history.",
                ],
                [
                  "This app",
                  "Reads the shared feed for display and talks to the contract directly for trades. It never custodies anything.",
                ],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-4 py-3.5">
                  <p className="text-xs font-semibold text-foreground">{k}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{v}</p>
                </div>
              ))}
            </dl>
          </DocSection>

          <DocSection id="security" kicker="10 · Security" title="What each key can and cannot do">
            <p>
              There are two privileged keys, deliberately separated so that neither is a single
              point of total failure.
            </p>
            <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
              {[
                [
                  "Admin key",
                  "Can create listings, pause the market or an individual listing, and rotate the oracle key. Cannot withdraw, redirect, or otherwise touch funds in any reserve.",
                ],
                [
                  "Oracle key",
                  "Can only push scores. Cannot touch a reserve or a share balance. Its effect is bounded by both the solvency cap and the 25%-per-update rate limit.",
                ],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-4 py-3.5">
                  <p className="text-xs font-semibold text-foreground">{k}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{v}</p>
                </div>
              ))}
            </dl>
            <p className="mt-4">
              No function in the contract lets anyone — admin, oracle, or otherwise — withdraw from
              a listing's reserve outside of a normal sell by the shareholder.
            </p>
            <InfoCard tone="warning" title="Not audited">
              The contract has not been through a third-party security audit, and it holds user
              funds. The reserve invariant is covered by an automated test suite, but tests are not
              an audit. Size your exposure accordingly.
            </InfoCard>
          </DocSection>

          <DocSection id="sessions" kicker="11 · Sessions" title="Market hours">
            <p>
              SHARPS runs on real-world session windows — Asia, London, and New York — rolling
              through the day from 00:00 UTC to 21:00 UTC on weekdays. Prices keep updating whenever
              the overall market is open, and trading is closed outside those hours and on weekends.
            </p>
            <p>
              The oracle score refreshes on its own cadence (roughly every 20 minutes) independent
              of session state, so a listing's tracked performance stays current even between
              trades.
            </p>
          </DocSection>

          <DocSection id="wallet" kicker="12 · Wallet & network" title="Connecting and networks">
            <p>
              SHARPS works with any standard EVM browser wallet (MetaMask, Rabby, Coinbase Wallet,
              and others) — click <span className="text-foreground">Connect Wallet</span> in the
              header and approve the connection. No account, email, or signup required.
            </p>
            <p>
              The app defaults to Robinhood Chain <b>testnet</b> (chain ID 46630) unless explicitly
              configured for mainnet (chain ID 4663), so a missing setting can never quietly point
              you at real funds. The network is always shown in the header and site footer. Testnet
              ETH has no real-world value and is only for testing.
            </p>
            <p>
              If your wallet is connected to a different network, the connect button says so and
              offers to switch — rather than letting a trade fail with an unexplained error.
            </p>
          </DocSection>

          <DocSection id="risk" kicker="13 · Risk" title="Risk & disclosures">
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
                <b className="text-foreground">Admin controls exist.</b> A contract admin key can
                pause trading market-wide or on an individual listing, and can create new listings.
                It cannot access, redirect, or withdraw funds from any vault.
              </li>
              <li>
                <b className="text-foreground">On-chain, irreversible.</b> Every buy and sell is a
                real Robinhood Chain transaction. Once confirmed, it cannot be undone.
              </li>
              <li>
                <b className="text-foreground">Unaudited contract.</b> The SHARPS contract has not
                been through a third-party security audit. It holds user funds. Treat it accordingly
                and don't commit more than you're willing to lose.
              </li>
              <li>
                <b className="text-foreground">Identity is best-effort.</b> Trader names, avatars,
                and X links are sourced from public wallet-tagging data and are not proof that a
                wallet belongs to a given person. Verify the address yourself before trading on a
                name.
              </li>
            </ul>
          </DocSection>

          <DocSection id="glossary" kicker="14 · Glossary" title="Terms used on this site">
            <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
              {[
                ["Listing", "One tracked trader wallet, tradable as a stock with its own ticker."],
                [
                  "Share",
                  "A unit of a listing, held in the contract's ledger against your address. Whole numbers only.",
                ],
                [
                  "Perf score",
                  "0–100, that trader's rank against the whole field. Relative, so it moves when standing moves.",
                ],
                [
                  "Multiplier",
                  "What the score does to the price. 1× at score 50; higher lifts the curve, lower drops it.",
                ],
                [
                  "Curve",
                  "Each successive share costs more than the last. Buying walks price up, selling walks it down.",
                ],
                [
                  "Reserve",
                  "The ETH backing one listing, held by the contract. Kept equal to the curve value of all outstanding shares.",
                ],
                [
                  "Backing / share",
                  "Reserve divided by outstanding shares — the money actually behind each share.",
                ],
                [
                  "Market cap",
                  "Price × the 10,000,000 share cap. A comparability figure, NOT money in the listing.",
                ],
                [
                  "Price lags score",
                  "The score wants a higher price than the reserve can back yet. Shown, not hidden.",
                ],
                ["Oracle", "The narrow key that pushes scores on-chain. It cannot move funds."],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-4 py-3.5">
                  <p className="text-xs font-semibold text-foreground">{k}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{v}</p>
                </div>
              ))}
            </dl>
          </DocSection>

          <DocSection id="faq" kicker="15 · FAQ" title="Common questions">
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
    a: "No. SHARPS has no accounts, emails, or passwords — connecting a wallet is the only login there is.",
  },
  {
    q: "What am I actually buying — the trader's coin, or something else?",
    a: "Neither the trader's coin nor a share in a company. You're buying a share recorded in the SHARPS contract's ledger, representing a claim on that specific listing's on-chain vault, priced against the trader's tracked performance.",
  },
  {
    q: "Will my shares show up in my wallet like a normal token?",
    a: "No. Shares are held in the SHARPS contract's own ledger against your address, not as ERC-20 tokens, so they won't appear in your wallet's token list and can't be traded on an outside DEX. You can still send them to another address through the contract, and only you can move your balance.",
  },
  {
    q: "Can a sell ever pay out less than I was quoted?",
    a: "No. The reserve is held equal to the curve value of every outstanding share, so unwinding along that curve is always covered by construction. The quote you see is what lands, minus the 2% sell fee that's already shown. An earlier version of SHARPS could pay less than quoted on a thin listing; that design is gone.",
  },
  {
    q: "What does a trade cost?",
    a: "2% to buy and 2% to sell — about 4% for a round trip before the price moves at all. Those fees stay in that listing's own reserve rather than going to the protocol, and they're what allows a rising score to lift the price without breaking the sell guarantee.",
  },
  {
    q: "Why is the price not moving even though the score went up?",
    a: "A higher price means every outstanding share is redeemable for more, which is a claim on the reserve. The contract only raises the price as far as the reserve can actually back, and fees build that headroom over time. So a strong trader with little trading volume shows a high score and a price still catching up. The listing page says so explicitly rather than hiding the gap.",
  },
  {
    q: "Why did buying push the price up?",
    a: "Shares sit on a bonding curve: each one costs slightly more than the last. Your buy moves along it, and a later sell walks back down it. It also means a large buy fills at a higher average price than the figure shown for a single share.",
  },
  {
    q: "Can the team move funds out of a listing's vault?",
    a: "No function in the contract allows the admin, the oracle authority, or anyone else to withdraw or redirect vault funds outside of a normal sell. The admin can only pause trading or create new listings.",
  },
  {
    q: "Why did a trader's score go down?",
    a: "Scores are relative to every other listed trader, not absolute, and they're recalculated each cycle — so a score falls when that trader's standing against the field falls, even if their raw numbers didn't get worse.",
  },
  {
    q: "A trader made one huge winning trade — why barely any movement?",
    a: "Traders with few recorded trades are pulled toward the neutral midpoint until they've built a real sample, so a single trade can nudge a score but not swing it. Sustained performance is what moves a price.",
  },
  {
    q: "Do other people see the same prices and charts I do?",
    a: "Yes. Price, chart, and market cap all come from one shared feed rebuilt from the contract's on-chain events, so everyone sees the same data at the same time rather than a per-browser view.",
  },
  {
    q: "Is this real money?",
    a: "Depends on the network. The app defaults to Robinhood Chain testnet (test ETH, no real value) unless explicitly pointed at mainnet, in which case every trade uses real ETH. The current network is always shown in the header and site footer.",
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
