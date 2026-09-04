import { useMarket } from "@/lib/market-store";

/**
 * A score with its meaning attached.
 *
 * The number 63 means nothing on its own, and it was being shown bare all over
 * the product — a first-time visitor has no way to know whether that is good,
 * what the range is, or what moved it. Colour and a one-word band do most of
 * that work at a glance; the tooltip carries the rest for anyone who stops.
 *
 * 50 is the neutral open every listing starts at, so the bands are built
 * around it rather than around 0-100. A 55 is genuinely mid-table, not "half
 * marks".
 */
export function scoreBand(score: number): { label: string; tone: "up" | "down" | "flat" } {
  if (score >= 65) return { label: "Strong", tone: "up" };
  if (score >= 55) return { label: "Above", tone: "up" };
  if (score > 45) return { label: "Neutral", tone: "flat" };
  if (score > 35) return { label: "Below", tone: "down" };
  return { label: "Weak", tone: "down" };
}

/**
 * True when the oracle has measured nothing for this listing, so its 50 is an
 * opening default rather than a verdict.
 *
 * Derived from confidence rather than a hardcoded list of wallets, which
 * matters because the reason a listing is unmeasured varies and changes. Some
 * wallets simply have not traded yet. Others trade constantly but in ways the
 * PnL reconstruction deliberately ignores — staking, minting, token-to-token
 * swaps — because it only recognises a native-ETH round trip and refuses to
 * guess at the rest (see oracle/blockscout-provider.ts). Either way the honest
 * statement to a buyer is the same: there is nothing behind this price yet.
 *
 * Deriving it also means the badge clears itself the moment a wallet makes a
 * measurable trade, and appears on any listing that goes quiet — no list to
 * maintain, and no way for it to drift out of date.
 */
export function isUnmeasured(confidence: number | undefined): boolean {
  // Only an explicit zero. Deliberately NOT `confidence === undefined`, which
  // was the first attempt and was wrong in the worst direction: `breakdowns` is
  // empty whenever the published scores are older than the listing set or the
  // shared feed has not answered yet, so every listing — including 122 traders
  // with hundreds of real trades between them — was being labelled unrated.
  //
  // Absent data means "not known yet", and the honest response to not knowing
  // is to say nothing, not to assert the stronger claim that there is nothing
  // to know. The badge therefore appears only once the oracle has actually
  // published a confidence of 0 for that listing, which is a measurement rather
  // than an absence.
  return confidence === 0;
}

export function ScorePill({
  score,
  id,
  size = "sm",
}: {
  score: number;
  /** When given, the tooltip can say how much of the blend actually landed. */
  id?: string;
  size?: "sm" | "lg";
}) {
  const { breakdowns } = useMarket();
  const band = scoreBand(score);
  const conf = id ? breakdowns[id]?.confidence : undefined;

  // An unmeasured listing must not wear a band label. "Neutral" reads as a
  // finding — that this trader was assessed and landed mid-table — when in
  // fact nothing has been assessed at all.
  if (isUnmeasured(conf)) {
    return (
      <span
        title={
          `No measurable trades yet, so this is the opening score every listing starts at, ` +
          `not a judgement. Scores move on completed round trips priced in ETH; activity like ` +
          `staking, minting or token-to-token swaps is not counted rather than guessed at.`
        }
        className={`num inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 font-bold tabular-nums text-muted-foreground ${
          size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-[11px]"
        }`}
      >
        {score}
        <span className="text-[9px] font-semibold tracking-[0.14em] uppercase opacity-70">
          Unrated
        </span>
      </span>
    );
  }

  const tone =
    band.tone === "up"
      ? "border-up/30 bg-up/10 text-up"
      : band.tone === "down"
        ? "border-down/30 bg-down/10 text-down"
        : "border-border bg-muted/40 text-muted-foreground";

  // Say what the number is, then what would change it. Confidence is the part
  // people most need and least expect: a high score on four trades is not the
  // same claim as the same score on four hundred.
  const title =
    `Score ${score} of 100 — ${band.label.toLowerCase()}. Every listing opens at 50 and moves ` +
    `only on measured on-chain performance.` +
    (conf === undefined
      ? ""
      : conf === 0
        ? " No trades recorded yet, so this is the neutral opening score rather than a judgement."
        : ` About ${Math.round(conf * 100)}% of the full ranking is being applied — the rest is ` +
          `held back until there are enough trades to trust it.`);

  return (
    <span
      title={title}
      className={`num inline-flex shrink-0 items-center gap-1.5 rounded-md border font-bold tabular-nums ${tone} ${
        size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      {score}
      <span className="text-[9px] font-semibold tracking-[0.14em] uppercase opacity-70">
        {band.label}
      </span>
    </span>
  );
}
