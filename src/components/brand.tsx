/**
 * The SHARPS mark.
 *
 * Drawn rather than set in type, because the product had no mark at all —
 * only the word in letterspaced caps, which reads as a placeholder and
 * survives nothing: not a favicon, not an avatar, not a 16px tab.
 *
 * The form is a rising bar sequence cut by a diagonal. It is the two ideas the
 * product actually rests on, in one shape: the bars are a price series, and
 * the cut is the edge a sharp has over the field. It stays legible at 16px
 * because it is four strokes and a slash, with no detail that disappears.
 *
 * currentColor throughout, so it inherits whatever it sits on and needs no
 * per-theme variant. The accent is applied by the caller, not baked in.
 */
export function SharpsMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Rising series. Weights increase with height so the eye reads it as
          momentum rather than a bar chart. */}
      <rect x="2" y="15" width="3" height="7" rx="1.2" fill="currentColor" opacity="0.45" />
      <rect x="7" y="11" width="3" height="11" rx="1.2" fill="currentColor" opacity="0.65" />
      <rect x="12" y="7" width="3" height="15" rx="1.2" fill="currentColor" opacity="0.85" />
      <rect x="17" y="2" width="3" height="20" rx="1.2" fill="currentColor" />
      {/* The cut. Slightly steeper than the series so it reads as crossing it,
          not tracing it. */}
      <path
        d="M1 20.5 L23 3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark, the standard lockup.
 *
 * The wordmark keeps its wide tracking — that part was already right, and it
 * is what makes a five-letter word hold its own beside a mark.
 */
export function SharpsLogo({
  size = 20,
  className = "",
  showWord = true,
}: {
  size?: number;
  className?: string;
  showWord?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <SharpsMark size={size} className="text-primary" />
      {showWord && (
        <span className="display text-[13px] font-extrabold tracking-[0.3em] uppercase">
          Sharps
        </span>
      )}
    </span>
  );
}

/** The official SHARPS account — the one place announcements and the $SHARPS address come from. */
export const SHARPS_X_HANDLE = "TradeSharps";
export const SHARPS_X_URL = `https://x.com/${SHARPS_X_HANDLE}`;

export function XIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`fill-current ${className}`}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * "Follow @TradeSharps" link. `variant="icon"` is the compact square used in
 * the app header; `variant="pill"` carries the handle for places with room.
 */
export function FollowOnX({
  variant = "pill",
  className = "",
}: {
  variant?: "icon" | "pill";
  className?: string;
}) {
  return (
    <a
      href={SHARPS_X_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Follow @${SHARPS_X_HANDLE} on X (opens in a new tab)`}
      title={`@${SHARPS_X_HANDLE} — the official SHARPS account`}
      className={className}
    >
      <XIcon className={variant === "icon" ? "size-3.5" : "size-3"} />
      {variant === "pill" && <span>@{SHARPS_X_HANDLE}</span>}
    </a>
  );
}
