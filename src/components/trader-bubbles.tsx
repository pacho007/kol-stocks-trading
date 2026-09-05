import { useState } from "react";
import { use24hChange, type Mover } from "@/lib/use-24h-change";

/**
 * The listings on the splash, and where each one sits.
 *
 * A named roster rather than "whatever moved most today". The splash is the
 * first thing anyone sees, so who appears on it is an editorial decision, not
 * an output of the sort order — a top-movers feed would put a different twelve
 * up every day and could surface a listing nobody recognises.
 *
 * Positions are re-measured whenever the hero changes, because the hero is the
 * constraint. It has moved three times now: a text wordmark sized with clamp(),
 * a full-width logo image with no side margin at all, and a 600px-capped logo
 * that gives the gutters back. A ring only works against the third — with a
 * full-width wordmark there was nothing to encircle.
 *
 * `wide` marks the chips that only appear at xl and above. xl rather than lg
 * because the chip is a fixed 110px, so it costs 5.7% of a 1920 viewport but
 * 10.7% of a 1024 one — the gutter shrinks while the chip grows into it, and
 * at exactly 1024 the inner column measured as touching the logo. Below xl the
 * set thins to the four under the CTA row, where the full width stays clear.
 */
const ROSTER: { id: string; top: string; left: string; wide?: boolean }[] = [
  // Twelve points evenly spaced around an ellipse enclosing the hero, at 30
  // degree intervals starting from the top. Centre (50, 48) is the midpoint of
  // the hero block — logo top at 27.2% to CTA bottom at 69.1% — and the radii
  // clear it: 34% horizontally against a centre column that ends at 66%, 30%
  // vertically against a block that ends at 69%.
  //
  // Each chip is centred ON its point by a -50%/-50% transform rather than
  // positioned by its left edge. The chip is a fixed 110px, so a left-edge
  // percentage puts it somewhere different relative to the ring at every
  // viewport width; centring makes the ring geometrically exact at all of them.
  { id: "d03353", top: "18%", left: "50%", wide: true }, //     0deg  nyhrox
  { id: "f100af", top: "22%", left: "67%", wide: true }, //    30deg  Tom
  { id: "d41fea", top: "33%", left: "79.4%", wide: true }, //  60deg  milito
  { id: "fe277a", top: "48%", left: "84%", wide: true }, //    90deg  Vali

  // The bottom arc, the only three kept below xl. The pair at 63% went with
  // the rest: the CTA row wraps to two lines on a narrow viewport and grows
  // down into them, which measured as a clash at 768 and 700. These three sit
  // below the CTA at every width.
  { id: "bc2255", top: "63%", left: "79.4%", wide: true }, //  120deg  dv
  { id: "696d12", top: "74%", left: "67%" }, //               150deg  Frank
  { id: "6078ee", top: "78%", left: "50%" }, //               180deg  Inq
  { id: "be38d1", top: "74%", left: "33%" }, //               210deg  pow
  { id: "03ba95", top: "63%", left: "20.6%", wide: true }, //  240deg  Rowdy

  { id: "0f84d2", top: "48%", left: "16%", wide: true }, //   270deg  Cupsey
  { id: "38e420", top: "33%", left: "20.6%", wide: true }, // 300deg  Loopierr
  { id: "963133", top: "22%", left: "33%", wide: true }, //   330deg  Seba
];

const IDS = ROSTER.map((r) => r.id);

/** Prime-ish and mutually non-harmonic, so the group never drifts in lockstep. */
const DRIFT_SECONDS = [7, 9, 11, 8, 13, 10];

function formatPct(n: number) {
  const s = n.toFixed(1);
  return n > 0 ? `+${s}%` : `${s}%`;
}

function Bubble({ mover, index }: { mover: Mover; index: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const { kol, changePct } = mover;

  // null means nothing has been measured for this listing yet — rendered as a
  // dash in the neutral tone, never as 0.0%, which would claim a result.
  const unmeasured = changePct === null;
  // Explicit colours rather than the app's --up/--down tokens: those are tuned
  // for the dark app shell, and this sits on a pale silk video. Darkened so the
  // text keeps contrast over the lightest frames of the loop.
  const tone = unmeasured || changePct === 0 ? "#3d1024" : changePct > 0 ? "#0f7a4a" : "#b3242e";
  // Direction is carried by a glyph as well as by colour. Red/green alone is
  // invisible to the ~8% of men with a red-green deficiency, and this is the
  // only signal on the chip that matters.
  const arrow = unmeasured || changePct === 0 ? "" : changePct > 0 ? "▲ " : "▼ ";
  const readout = unmeasured ? "—" : formatPct(changePct);

  return (
    <div
      className="bubble-drift flex items-center gap-2.5 rounded-full border border-white/70 bg-white/55 py-2 pr-4 pl-2 shadow-[0_8px_28px_-10px_rgba(61,16,36,0.38)] backdrop-blur-md"
      style={
        {
          "--drift-dur": `${DRIFT_SECONDS[index % DRIFT_SECONDS.length]}s`,
          "--drift-delay": `${(index * 0.47).toFixed(2)}s`,
        } as React.CSSProperties
      }
    >
      <span
        className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full text-[10px] font-bold text-white"
        style={{ background: kol.avatar }}
      >
        {/* Initials underneath, not instead of — unavatar.io rate-limits at
            this cohort size, and an empty circle reads as a broken page. */}
        <span aria-hidden>{kol.ticker.slice(0, 2)}</span>
        {!imgFailed && (
          <img
            src={kol.image}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
      </span>

      <span className="flex flex-col leading-tight">
        <span className="num text-[10px] font-bold tracking-[0.14em] text-[#3d1024]">
          ${kol.ticker}
        </span>
        <span className="num text-[11px] font-bold tabular-nums" style={{ color: tone }}>
          {arrow}
          {readout}
        </span>
      </span>
    </div>
  );
}

/**
 * Floating listing chips over the splash hero.
 *
 * Decorative, deliberately. They were links to each listing at first, which
 * made the splash compete with itself: the page exists to move one visitor
 * through one door, and eleven other doors around the headline is not
 * atmosphere, it is a fork. They show that the board is real and moving, and
 * OPEN APP remains the only thing to click.
 *
 * Nothing here takes pointer events — not the layer, not the chips — so the
 * hero underneath keeps its full hit area and a chip cannot swallow a click
 * meant for a CTA. They stay in the accessibility tree as text, because a
 * measured price move is content rather than ornament.
 *
 * Renders nothing until the numbers arrive. The alternative — chips with
 * placeholder percentages that settle a moment later — puts a wrong number on
 * screen in confident green or red, which is worse than a bare hero for the
 * half second it takes to load.
 *
 * Two nested elements per chip, deliberately: the outer one owns position and
 * the entrance, the inner one owns the drift. Both effects are `animation`, so
 * putting them on one element would have them overwrite rather than compose.
 */
export function TraderBubbles() {
  const movers = use24hChange(IDS);
  if (!movers || movers.length === 0) return null;
  const slotFor = new Map(ROSTER.map((r) => [r.id, r]));

  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden md:block">
      {movers.map((m, i) => {
        const slot = slotFor.get(m.kol.id);
        if (!slot) return null;
        return (
          <div
            key={m.kol.id}
            className={`fade-up absolute -translate-x-1/2 -translate-y-1/2 ${slot.wide ? "max-xl:hidden" : ""}`}
            style={{
              top: slot.top,
              left: slot.left,
              animationDelay: `${1.1 + i * 0.07}s`,
            }}
          >
            <Bubble mover={m} index={i} />
          </div>
        );
      })}
    </div>
  );
}
