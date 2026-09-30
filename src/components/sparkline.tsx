import { useId } from "react";

type Props = {
  data: number[];
  up: boolean;
  width?: number;
  height?: number;
  className?: string;
};

/**
 * A price series drawn small.
 *
 * Below two points there is nothing to plot, so it draws a flat green line —
 * a listing that hasn't moved yet, which is exactly the state of a new one.
 */
export function Sparkline({ data, up, width = 160, height = 44, className }: Props) {
  // Gradient ids are document-global. Deriving one from the data (as this used
  // to) collides across cards that happen to share a length and a minimum, and
  // whichever definition paints last wins for all of them.
  const uid = useId();

  if (data.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--up)"
          strokeWidth="1.6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map(
    (v, i) => [i * step, height - ((v - min) / span) * (height - 6) - 3] as const,
  );
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;
  const id = `sp${uid.replace(/:/g, "")}`;
  const stroke = up ? "var(--up)" : "var(--down)";
  // Non-null is sound: the early return above guarantees at least two points.
  const [lastX, lastY] = pts[pts.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The latest reading, marked. With a handful of points the line is short
          and it isn't obvious which end is now. preserveAspectRatio is none, so
          a circle would stretch into an ellipse — a non-scaling stroke on a
          zero-length line gives a round cap at any aspect. */}
      <line
        x1={lastX}
        y1={lastY}
        x2={lastX}
        y2={lastY}
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
