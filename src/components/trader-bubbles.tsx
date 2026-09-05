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
 * Positions are hand-placed and re-measured whenever the hero changes, because
 * the hero is the constraint. This has now moved twice: a text wordmark sized
 * with clamp(), then a full-width logo image that left no side margin at all,
 * and now a 600px-capped logo that gives the gutters back. Scattered placement
 * suited the first, survived the second only by avoiding the middle entirely,
 * and reads as clutter against the third — hence columns.
 *
 * `wide` marks the chips that only appear at xl and above. xl rather than lg
 * because the chip is a fixed 110px, so it costs 5.7% of a 1920 viewport but
 * 10.7% of a 1024 one — the gutter shrinks while the chip grows into it, and
 * at exactly 1024 the inner column measured as touching the logo. Below xl the
 * set thins to the four under the CTA row, where the full width stays clear.
 */
const ROSTER: { id: string; top: string; left: string; wide?: boolean }[] = [
  // Two columns flanking the hero, alternating side and stepping down in an
  // even rhythm. Measured off the live hero: with the logo capped at 600px the
  // whole centre column — logo, subtitle, CTA — sits inside x 34-66%, so both
  // gutters are free from just under the header to just above the marquee.
  //
  // Even 14% steps with a 5.7% chip leave an 8.3% gap, which is what makes the
  // arrangement read as placed rather than scattered. The two columns are
  // offset by half a step so the eye does not see paired rows.
  { id: "d03353", top: "13%", left: "7%", wide: true }, //     nyhrox
  { id: "f100af", top: "18%", left: "81%", wide: true }, //    Tom
  { id: "963133", top: "27%", left: "11%", wide: true }, //    Seba
  { id: "d41fea", top: "32%", left: "77%", wide: true }, //    milito
  { id: "38e420", top: "41%", left: "6%", wide: true }, //     Loopierr
  { id: "fe277a", top: "46%", left: "82%", wide: true }, //    Vali
  { id: "0f84d2", top: "55%", left: "11%", wide: true }, //    Cupsey
  { id: "bc2255", top: "60%", left: "77%", wide: true }, //    dv

  // The four kept below xl. Everything above the CTA row gets tight on a
  // narrow viewport — at 900px the 600px logo alone is 67% of the width — but
  // below it the full width is clear down to the marquee, so these survive.
  { id: "03ba95", top: "69%", left: "7%" }, //                  Rowdy
  { id: "696d12", top: "74%", left: "81%" }, //                 Frank
  { id: "be38d1", top: "83%", left: "12%" }, //                 pow
  { id: "6078ee", top: "88%", left: "76%" }, //                 Inq
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
    <div className="pointer-events-none absolute inset-0 z-20 hidden sm:block">
      {movers.map((m, i) => {
        const slot = slotFor.get(m.kol.id);
        if (!slot) return null;
        return (
          <div
            key={m.kol.id}
            className={`fade-up absolute ${slot.wide ? "max-xl:hidden" : ""}`}
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
