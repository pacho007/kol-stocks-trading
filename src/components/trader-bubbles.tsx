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
 * Positions are hand-placed because the hero is the constraint: the wordmark
 * occupies the middle band and the CTA row sits under it, so the usable space
 * is the left and right margins, the strip under the header, and the gap above
 * the marquee. Generated placement puts a chip over the word SHARPS every few
 * reloads.
 *
 * `wide` marks the chips that only appear on large viewports. Twelve chips need
 * the full width to stay clear of each other and of the wordmark; below that
 * the set thins to six rather than scaling down into illegibility.
 */
const ROSTER: { id: string; top: string; left: string; wide?: boolean }[] = [
  // left margin, top to bottom
  { id: "d03353", top: "17%", left: "5%" }, //                nyhrox
  { id: "963133", top: "39%", left: "3.5%", wide: true }, //   Seba
  { id: "38e420", top: "61%", left: "6%" }, //                 Loopierr
  { id: "03ba95", top: "79%", left: "15%", wide: true }, //    Rowdy
  // right margin, top to bottom
  { id: "f100af", top: "17%", left: "79%" }, //                Tom
  { id: "d41fea", top: "39%", left: "83.5%", wide: true }, //  milito
  { id: "fe277a", top: "61%", left: "78%" }, //                Vali
  { id: "696d12", top: "79%", left: "69%", wide: true }, //    Frank
  // the band under the header, either side of centre
  { id: "0f84d2", top: "7%", left: "27%" }, //                 Cupsey
  { id: "bc2255", top: "7%", left: "63%" }, //                 dv
  // the band above the marquee, either side of centre
  { id: "be38d1", top: "86%", left: "34%", wide: true }, //    pow
  { id: "6078ee", top: "86%", left: "57%", wide: true }, //    Inq
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
            className={`fade-up absolute ${slot.wide ? "max-lg:hidden" : ""}`}
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
