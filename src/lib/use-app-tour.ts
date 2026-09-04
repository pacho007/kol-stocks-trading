import { useCallback, useEffect, useState } from "react";

/**
 * Bumped when the steps change materially. Someone who has seen v1 should be
 * shown a rewritten v2 rather than silently skipped past it, and the version in
 * the key does that without anyone needing to clear storage.
 */
const SEEN_KEY = "sharps.tour.v1";

/** Remember that the walkthrough has been completed or dismissed. */
export function markTourSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* Private mode or storage disabled. Showing the tour again is a far smaller
       problem than throwing while closing a modal. */
  }
}

/**
 * Owns whether the walkthrough should open on this visit.
 *
 * Kept out of the component so the decision happens in an effect after mount.
 * The server cannot know what this browser has already seen, so rendering an
 * open modal during SSR would either flash for someone who has seen it or
 * produce markup that disagrees with the client's and lose the hydration.
 */
export function useAppTour() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Storage unavailable: treat as seen. Someone in a locked-down browser
      // getting the tour on every single visit would be worse than never.
    }
    if (!seen) setOpen(true);
  }, []);

  const replay = useCallback(() => setOpen(true), []);
  return { open, setOpen, replay };
}
