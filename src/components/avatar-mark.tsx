import { useState } from "react";

export function AvatarMark({
  gradient,
  label,
  src,
  size = 40,
}: {
  gradient: string;
  label: string;
  src?: string;
  size?: number;
}) {
  /**
   * Avatars come from unavatar.io, which is rate limited, and the market page
   * asks it for the whole cohort twice over — once for the grid and once for
   * the ticker tape. Measured: a burst of that size returns 429 for most of
   * them, so a visitor sees a scattering of initials where photos should be,
   * and it gets worse with traffic rather than better.
   *
   * The old handler hid the image on the first error, permanently, which turned
   * every transient 429 into a permanent blank for that session. Retrying once
   * after a short randomised delay recovers most of them, because the limit is
   * on the burst rather than on the request.
   *
   * `attempt` is appended as a cache-busting query param. Without it the
   * browser serves the failed response straight back from cache and the retry
   * changes nothing.
   *
   * The real fix is to stop asking a third party at page load — see
   * scripts/fetch-avatars.mjs, which pulls them into public/avatars/ so they
   * come from our own origin. That is blocked until the quota resets, and this
   * makes the current behaviour materially better in the meantime.
   */
  const [attempt, setAttempt] = useState(0);
  const [dead, setDead] = useState(false);
  const MAX_RETRIES = 2;

  const url = src
    ? attempt === 0
      ? src
      : `${src}${src.includes("?") ? "&" : "?"}r=${attempt}`
    : undefined;

  return (
    <div
      className="shrink-0 rounded-full p-px"
      style={{ background: gradient, width: size, height: size }}
    >
      <div
        className="num relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-background font-bold tracking-tight text-gold-light"
        style={{ fontSize: size * 0.3 }}
      >
        {/* Initials sit underneath rather than instead of, so a slow or failed
            image degrades to something readable instead of an empty circle. */}
        <span aria-hidden={url && !dead ? "true" : undefined}>
          {label.slice(0, 3).toUpperCase()}
        </span>
        {url && !dead ? (
          <img
            key={attempt}
            src={url}
            alt={label}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => {
              if (attempt < MAX_RETRIES) {
                // Randomised so 126 avatars do not all retry in the same
                // instant and recreate the burst that caused the failure.
                const wait = 600 * (attempt + 1) + Math.random() * 900;
                setTimeout(() => setAttempt((a) => a + 1), wait);
              } else {
                setDead(true);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
