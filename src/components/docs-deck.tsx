import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Card = {
  kicker: string;
  title: string;
  body: string;
  points: [string, string][];
};

const CARDS: Card[] = [
  {
    kicker: "01 · The listing",
    title: "What a trader stock actually is",
    body: "Every listing on SHARPS is a single verified on-chain wallet. When a trader is listed, their book becomes public: entries, exits, size, hold time and realized PnL are all read straight from the chain.",
    points: [
      ["Ticker", "A short symbol tied to one wallet, never to a coin"],
      ["Float", "Fractional shares, so a listing stays tradable at any size"],
      ["Verification", "Wallet signature at listing, nothing self-reported"],
    ],
  },
  {
    kicker: "02 · Pricing",
    title: "How performance becomes a price",
    body: "A trader's session is scored on realized PnL first, then adjusted for win rate, average size and hold time. A clean, repeatable book prices higher than one lucky moonshot, and the score maps to the next session's open.",
    points: [
      ["Realized PnL", "The dominant input, closed trades only"],
      ["Consistency", "Win rate and drawdown smooth out single-trade noise"],
      ["Risk", "Oversized, short-hold gambles are discounted"],
    ],
  },
  {
    kicker: "03 · Sessions",
    title: "Market hours and the daily close",
    body: "SHARPS runs on real market hours. Asia, London and New York sessions roll through the day, the tape stays live while any session is open, and the book is marked once at the New York close.",
    points: [
      ["Open", "Asia session opens the trading day"],
      ["Close", "21:00 UTC, one mark per day"],
      ["After hours", "Orders queue and fill at the next open"],
    ],
  },
  {
    kicker: "04 · Trading",
    title: "Buying and selling a trader",
    body: "You buy shares in the operator, not the coin they are farming. Positions are held in your portfolio, marked to the daily close, and can be exited any time the market is open.",
    points: [
      ["Buy", "Take a position while a session is open"],
      ["Hold", "Your shares reprice at each daily close"],
      ["Sell", "Exit at the live price, settlement at the close"],
    ],
  },
  {
    kicker: "05 · Scouting",
    title: "Finding the operator early",
    body: "New listings start small and unnoticed. The leaderboard ranks by performance score rather than size, so a disciplined wallet with no timeline presence can surface long before the crowd finds it.",
    points: [
      ["Leaderboard", "Ranked on score, not on follower count"],
      ["Season", "Season 1 runs on daily close settlement"],
      ["Edge", "Read the book, not the posts"],
    ],
  },
];

export function DocsDeck() {
  const [i, setI] = useState(0);
  const card = CARDS[i]!;
  const go = (n: number) => setI((n + CARDS.length) % CARDS.length);

  return (
    <section className="rise panel overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="text-[10px] tracking-[0.22em] uppercase text-foreground">The briefing</span>
        <span className="num text-[10px] tracking-widest text-muted-foreground">
          {String(i + 1).padStart(2, "0")} / {String(CARDS.length).padStart(2, "0")}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous card"
            onClick={() => go(i - 1)}
            className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next card"
            onClick={() => go(i + 1)}
            className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-px bg-border md:grid-cols-[minmax(0,1fr)_16rem]">
        <div key={i} className="rise bg-card px-6 py-7">
          <p className="num text-[10px] tracking-[0.28em] uppercase text-primary">{card.kicker}</p>
          <h3 className="mt-3 text-xl font-semibold sm:text-2xl">{card.title}</h3>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{card.body}</p>
        </div>
        <div className="bg-card">
          {card.points.map(([k, v]) => (
            <div key={k} className="border-b border-border/60 px-5 py-3.5 last:border-0">
              <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">{k}</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        {CARDS.map((c, n) => (
          <button
            key={c.kicker}
            type="button"
            aria-label={`Go to ${c.title}`}
            onClick={() => setI(n)}
            className={`h-1 flex-1 rounded-full transition-colors ${
              n === i ? "bg-primary" : "bg-border hover:bg-muted-foreground/50"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
