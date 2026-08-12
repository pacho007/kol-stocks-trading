/** Real-world equity session windows, expressed in UTC minutes from midnight. */
export type Session = {
  id: string;
  label: string;
  short: string;
  /** open time, UTC minutes from midnight */
  open: number;
  /** close time, UTC minutes from midnight */
  close: number;
};

export const SESSIONS: Session[] = [
  { id: "asia", label: "Asia · Tokyo", short: "ASIA", open: 0, close: 6 * 60 },
  { id: "london", label: "London · LSE", short: "LDN", open: 8 * 60, close: 16 * 60 + 30 },
  { id: "newyork", label: "New York · NYSE", short: "NY", open: 13 * 60 + 30, close: 21 * 60 },
];

/** The whole exchange runs from the Asia open to the New York close, weekdays only. */
export const DAY_OPEN = SESSIONS[0]!.open;
export const DAY_CLOSE = SESSIONS[SESSIONS.length - 1]!.close;

export function utcMinutes(d: Date) {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function isWeekday(d: Date) {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

export function sessionState(now: Date = new Date()) {
  const mins = utcMinutes(now);
  const weekday = isWeekday(now);
  const active = weekday ? SESSIONS.filter((s) => mins >= s.open && mins < s.close) : [];
  const marketOpen = weekday && mins >= DAY_OPEN && mins < DAY_CLOSE;
  const next = weekday ? SESSIONS.find((s) => mins < s.open) : SESSIONS[0];
  return { mins, weekday, active, marketOpen, next };
}

/** ms until the New York close (the daily reprice bell), skipping weekends. */
export function msToDailyClose(now: Date = new Date()) {
  const close = new Date(now);
  close.setUTCHours(Math.floor(DAY_CLOSE / 60), DAY_CLOSE % 60, 0, 0);
  while (close.getTime() <= now.getTime() || !isWeekday(close)) {
    close.setUTCDate(close.getUTCDate() + 1);
  }
  return close.getTime() - now.getTime();
}

export function fmtUtc(mins: number) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function fmtDuration(ms: number) {
  const h = Math.floor(ms / 3.6e6);
  const m = Math.floor((ms % 3.6e6) / 6e4);
  const s = Math.floor((ms % 6e4) / 1000);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
