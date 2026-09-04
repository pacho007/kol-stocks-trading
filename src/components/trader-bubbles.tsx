import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { use24hMovers, type Mover } from "@/lib/use-24h-movers";

/**
 * Where each bubble sits, as viewport percentages.
 *
 * Hand-placed rather than generated, because the hero is the constraint: the
 * wordmark occupies the middle band and the CTA row sits under it, so the
 * usable space is the left and right margins plus the gap above the marquee.
 * Random placement puts a chip over the word SHARPS every few reloads.
 *
 * `wide` marks the bubbles that only appear on large viewports. Below that the
 * margins are too narrow to hold a chip clear of the wordmark, so the set
 * thins out rather than scaling down into illegibility.
 */
const SLOTS: { top: string; left: string; wide?: boolean }[] = [
  { top: "17%", left: "5%" },
  { top: "39%", left: "3.5%", wide: true },
  { top: "61%", left: "6%" },
  { top: "79%", left: "15%", wide: true },
  { top: "17%", left: "79%" },
  { top: "39%", left: "83.5%", wide: true },
  { top: "61%", left: "78%" },
  { top: "79%", left: "69%", wide: true },
];

/** Prime-ish and mutually non-harmonic, so the group never drifts in lockstep. */
const DRIFT_SECONDS = [7, 9, 11, 8, 13, 10];

function formatPct(n: number) {
  const s = n.toFixed(1);
  return n > 0 ? `+${s}%` : `${s}%`;
}

function Bubble({ mover, index }: { mover: Mover; index: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const { kol, changePct } = mover;

  // Explicit colours rather than the app's --up/--down tokens: those are tuned
  // for the dark app shell, and this sits on a pale silk video. Darkened so the
  // text keeps contrast over the lightest frames of the loop.
  const tone = changePct === 0 ? "#3d1024" : changePct > 0 ? "#0f7a4a" : "#b3242e";
  // Direction is carried by a glyph as well as by colour. Red/green alone is
  // invisible to the ~8% of men with a red-green deficiency, and this is the
  // only signal on the chip that matters.
  const arrow = changePct === 0 ? "" : changePct > 0 ? "▲ " : "▼ ";

  return (
    <Link
      to="/kol/$id"
      params={{ id: kol.id }}
      aria-label={`${kol.name}, ${formatPct(changePct)} over the last 24 hours`}
      className="bubble-drift pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/70 bg-white/55 py-2 pr-4 pl-2 shadow-[0_8px_28px_-10px_rgba(61,16,36,0.38)] backdrop-blur-md transition-[background-color,box-shadow] duration-300 hover:bg-white/80 hover:shadow-[0_12px_34px_-10px_rgba(61,16,36,0.5)]"
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
          {formatPct(changePct)}
        </span>
      </span>
    </Link>
  );
}

/**
 * Floating listing chips over the splash hero.
 *
 * Renders nothing until the numbers arrive. The alternative — chips with
 * placeholder percentages that settle a moment later — puts a wrong number on
 * screen in confident green or red, which is worse than a bare hero for the
 * half second it takes to load.
 *
 * Two nested elements per bubble, deliberately: the outer one owns position
 * and the entrance, the inner one owns the drift. Both effects are `animation`,
 * so putting them on one element would have them overwrite each other rather
 * than compose.
 *
 * The container is pointer-events-none so it cannot swallow a click meant for
 * OPEN APP; each bubble re-enables pointer events on itself.
 */
export function TraderBubbles() {
  const movers = use24hMovers(SLOTS.length);
  if (!movers || movers.length === 0) return null;

  // z-20 puts this layer above <main>, which is z-10 and spans the full
  // column: at a lower z-index the chips rendered correctly but every click on
  // one landed on the hero instead, so they looked interactive and were not.
  // Safe because the layer is pointer-events-none — only the chips themselves
  // take pointer events, and no slot overlaps the CTA row.
  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden sm:block">
      {movers.map((m, i) => {
        const slot = SLOTS[i];
        if (!slot) return null;
        return (
          <div
            key={m.kol.id}
            className={`fade-up absolute ${slot.wide ? "max-lg:hidden" : ""}`}
            style={{
              top: slot.top,
              left: slot.left,
              animationDelay: `${1.1 + i * 0.09}s`,
            }}
          >
            <Bubble mover={m} index={i} />
          </div>
        );
      })}
    </div>
  );
}
