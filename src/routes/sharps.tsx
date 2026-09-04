import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Coins, Flame, Users, Wallet } from "lucide-react";
import { SharpsMark } from "@/components/brand";
import { ExplorerLink } from "@/components/explorer-link";
import { TokenAddress } from "@/components/token-address";
import { MARKET_ADDRESS } from "@/lib/evm/chain";

export const Route = createFileRoute("/sharps")({
  head: () => ({
    meta: [
      { title: "$SHARPS · The Platform Token | SHARPS" },
      {
        name: "description",
        content:
          "$SHARPS is the token behind the platform. Every trade on SHARPS already pays a protocol fee on-chain, and $SHARPS is what that fee is for.",
      },
      { property: "og:title", content: "$SHARPS · The Platform Token | SHARPS" },
      {
        property: "og:description",
        content: "The token behind the platform. Launching on Pons.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SharpsToken,
});

/**
 * The $SHARPS page.
 *
 * Written deliberately close to what the contract actually does, because the
 * numbers here are checkable and will be checked. SharpsMarket.sol fixes the
 * fee split at 1% reserve / 0.5% listed trader / 0.5% protocol, and those are
 * `constant` — no admin can change them. So this page says 0.5%, names the
 * treasury as where it accrues, and links the contract.
 *
 * What it does NOT do is state a distribution rate, a supply, a date or a
 * ratio. None of that is enforced anywhere yet, and a page promising "1% to
 * holders" while the contract routes 0.5% to a treasury is precisely the
 * screenshot that follows a project around. Everything discretionary is
 * labelled discretionary.
 */
function SharpsToken() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      {/* masthead */}
      <div className="rise">
        <p className="num text-[10px] tracking-[0.3em] uppercase text-primary">
          The platform token
        </p>
        <h1 className="mt-3 flex items-center gap-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          <SharpsMark size={36} className="text-primary" />
          $SHARPS
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          SHARPS is a platform where on-chain traders are listed like stocks and priced by their
          measured performance. Every trade on it already pays a protocol fee, on-chain, today.
          $SHARPS is what that fee is for.
        </p>
      </div>

      {/* the fee, as it actually exists */}
      <section className="rise mt-12" style={{ animationDelay: "60ms" }}>
        <h2 className="num text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          Where the value comes from
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A trade on SHARPS costs 2% each way. That fee is not a single pot — the contract splits it
          three ways and the split is fixed in code, so nobody can move it later.
        </p>

        <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          {[
            {
              icon: Coins,
              pct: "1%",
              title: "Reserve",
              body: "Stays with the listing and backs its sells. This is why a sell can always be paid at the curve price.",
            },
            {
              icon: Users,
              pct: "0.5%",
              title: "Listed trader",
              body: "Accrues to the wallet being tracked, claimable only by signing from it. They keep it whether or not they ever turn up.",
            },
            {
              icon: Flame,
              pct: "0.5%",
              title: "Protocol",
              body: "Accrues to the treasury. This is the slice that funds $SHARPS.",
              accent: true,
            },
          ].map((c) => (
            <div
              key={c.title}
              className={`bg-card p-5 ${c.accent ? "ring-1 ring-primary/30" : ""}`}
            >
              <c.icon
                className={`size-4 ${c.accent ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden
              />
              <p className={`num mt-3 text-2xl font-bold ${c.accent ? "text-primary" : ""}`}>
                {c.pct}
              </p>
              <p className="mt-1 text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                {c.title}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          These are <span className="num text-foreground">constant</span> in the contract — not
          settings. Verify them yourself
          {MARKET_ADDRESS ? (
            <>
              {" "}
              on <ExplorerLink address={MARKET_ADDRESS} label="the market contract" />.
            </>
          ) : (
            " on the market contract once it is deployed."
          )}
        </p>
      </section>

      {/* holders */}
      <section className="rise mt-12" style={{ animationDelay: "120ms" }}>
        <h2 className="num text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          What holders get
        </h2>
        <div className="mt-3 panel p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            A share of protocol revenue is returned to $SHARPS holders. The platform earns whenever
            anyone trades a listing, so the token is tied to activity on the board rather than to a
            promise about the token itself.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Distributions are made by the team from the treasury, by airdrop. They are not enforced
            by the market contract, which only accrues the fee — so treat the share and the schedule
            as discretionary rather than guaranteed, and judge them on what actually arrives.
          </p>
        </div>
      </section>

      {/* pons */}
      <section className="rise mt-12" style={{ animationDelay: "180ms" }}>
        <h2 className="num text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          Launching on Pons
        </h2>
        <div className="mt-3 panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="num rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] uppercase text-primary">
              Date TBA
            </span>
            <span className="num text-[11px] tracking-widest uppercase text-muted-foreground">
              Robinhood Chain
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            $SHARPS launches on Pons, on the same chain the platform settles on. That keeps the
            token, the market contract and every listed wallet on one network — no bridge between
            the thing you hold and the thing that earns.
          </p>
        </div>
      </section>

      {/* what it's for */}
      <section className="rise mt-12" style={{ animationDelay: "240ms" }}>
        <h2 className="num text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          What it is for
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            {
              title: "A claim on platform activity",
              body: "Every buy and every sell on all listings pays the protocol fee. Holding $SHARPS is a way to be on the volume rather than on any one trader.",
            },
            {
              title: "One network, one stack",
              body: "The token, the market and the traders being priced all live on Robinhood Chain. Nothing is bridged or wrapped.",
            },
            {
              title: "Independent of any listing",
              body: "A listing can be marked down to a third of its open. The platform still earns on the trades that took it there.",
            },
            {
              title: "Not equity, not a share of the reserve",
              body: "$SHARPS gives no claim on any listing's reserve, no rights over a listed trader, and no dividend. It is a token.",
            },
          ].map((c) => (
            <div key={c.title} className="panel p-4">
              <p className="text-sm font-semibold">{c.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* honest footer */}
      <section className="rise mt-12" style={{ animationDelay: "300ms" }}>
        <div className="panel border-l-2 border-l-down/60 p-5">
          <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-down">
            Before you buy
          </p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <li>
              $SHARPS is not live yet. Nothing on this page is a commitment on supply, price,
              allocation or timing, and none of it is financial advice.
            </li>
            <li>
              Holder distributions are discretionary and sent manually. The market contract accrues
              the protocol fee; it does not pay anybody out automatically.
            </li>
            <li>
              The platform earns on volume, and volume is not guaranteed. A quiet board earns
              nothing.
            </li>
          </ul>
        </div>
      </section>

      <section className="rise mt-12" style={{ animationDelay: "330ms" }}>
        <h2 className="num text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          Contract address
        </h2>
        <div className="mt-3">
          <TokenAddress />
        </div>
      </section>

      <div className="rise mt-10 flex flex-wrap gap-3" style={{ animationDelay: "360ms" }}>
        <Link
          to="/market"
          className="group inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-[11px] font-bold tracking-[0.2em] uppercase text-primary-foreground transition-transform duration-300 hover:scale-[1.02]"
        >
          <Wallet className="size-3.5" aria-hidden />
          Trade the board
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          to="/docs"
          className="inline-flex h-11 items-center rounded-lg border border-border px-6 text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground transition-colors hover:text-foreground"
        >
          How pricing works
        </Link>
      </div>
    </div>
  );
}
