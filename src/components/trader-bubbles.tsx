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
 * Positions are hand-placed because the hero is the constraint. The wordmark is
 * an image up to 1000px wide that goes edge-to-edge on a narrow viewport, so
 * there is no horizontal margin to hide in below about 1360px — chips have to
 * avoid its vertical band (18-54% of the viewport) rather than sit beside it.
 * An earlier layout placed four at 17% and 39% and they were clear at 1920 and
 * overlapping the logo at every width below 1536.
 *
 * `wide` marks the chips that only appear at lg and above. Below that only the
 * band above the marquee is provably clear at every width, so the set thins to
 * those four rather than risking a chip landing on the header or the subtitle.
 */
const ROSTER: { id: string; top: string; left: string; wide?: boolean }[] = [
  // Band above the wordmark, between the header and the logo. lg-only: the
  // header wraps to two lines on a narrow viewport and grows down into this
  // band, which measured as a clash at 768 and below.
  { id: "d03353", top: "9%", left: "5%", wide: true }, //       nyhrox
  { id: "0f84d2", top: "11%", left: "26%", wide: true }, //     Cupsey
  { id: "bc2255", top: "8.5%", left: "59%", wide: true }, //    dv
  { id: "f100af", top: "10.5%", left: "79%", wide: true }, //   Tom

  // Margins below the wordmark. The subtitle is max-w-lg and the CTA row is
  // narrow, both centred, so the far left and right stay clear — but only
  // once the viewport is wide enough that centred content does not reach the
  // edges, hence lg-only.
  { id: "963133", top: "58%", left: "3%", wide: true }, //      Seba
  { id: "d41fea", top: "58%", left: "84%", wide: true }, //     milito
  { id: "38e420", top: "70%", left: "4.5%", wide: true }, //    Loopierr
  { id: "fe277a", top: "70%", left: "83%", wide: true }, //     Vali

  // Band between the CTA row (ends 74.6%) and the marquee (starts 95.3%). The
  // only zone that measured clean at every width from 1920 down to 700, so
  // these four are the set that survives on a narrow viewport.
  { id: "03ba95", top: "80%", left: "12%" }, //                 Rowdy
  { id: "be38d1", top: "86%", left: "33%" }, //                 pow
  { id: "6078ee", top: "84%", left: "56%" }, //                 Inq
  { id: "696d12", top: "79%", left: "76%" }, //                 Frank
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
