import { createFileRoute, Link } from "@tanstack/react-router";
import { AvatarMark } from "@/components/avatar-mark";
import { LivePrice } from "@/components/live-price";
import { Sparkline } from "@/components/sparkline";
import { ConnectWalletButton } from "@/components/site-header";
import { getKol, fmtPct, fmtUsd } from "@/lib/kols";
import { useMarket } from "@/lib/market-store";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio · Your Trader Holdings | SHARPS" },
      {
        name: "description",
        content:
          "Track your SHARPS holdings: shares held, average entry, live value and unrealized profit and loss across every trader you back.",
      },
      { property: "og:title", content: "Portfolio · Your Trader Holdings | SHARPS" },
      { property: "og:description", content: "Holdings, entry price, live value and P&L in one book." },
    ],
  }),
  component: Portfolio,
});

function Portfolio() {
  const { connected, cash, positions, trades, prices, reset } = useMarket();

  const rows = positions
    .map((p) => {
      const kol = getKol(p.id);
      if (!kol) return null;
      const price = prices[p.id] ?? kol.price;
      const value = price * p.shares;
      const cost = p.entry * p.shares;
      return { kol, ...p, price, value, cost, pnl: value - cost, pnlPct: ((value - cost) / cost) * 100 };
    })
    .filter(Boolean) as Array<{
    kol: NonNullable<ReturnType<typeof getKol>>;
    id: string;
    shares: number;
    entry: number;
    price: number;
    value: number;
    cost: number;
    pnl: number;
    pnlPct: number;
  }>;

  const holdings = rows.reduce((s, r) => s + r.value, 0);
  const pnl = rows.reduce((s, r) => s + r.pnl, 0);
  const equity = holdings + cash;

  if (!connected) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-32 text-center">
        <h1 className="text-2xl font-bold">Connect to see your book</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your positions live on-chain. Connect a wallet to load holdings, entries and P&L.
        </p>
        <div className="mt-6 w-56">
          <ConnectWalletButton full />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="num text-[10px] tracking-[0.3em] uppercase text-primary">Your book</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Portfolio</h1>
        </div>
        <button
          onClick={reset}
          className="num rounded-lg border border-border px-3 py-2 text-[10px] tracking-widest uppercase text-muted-foreground hover:text-foreground"
        >
          Reset demo book
        </button>
      </div>

      <dl className="mt-8 grid gap-px overflow-hidden panel bg-border sm:grid-cols-4">
        {[
          ["Total equity", fmtUsd(equity), ""],
          ["Holdings value", fmtUsd(holdings), ""],
          ["Cash", fmtUsd(cash), ""],
          ["Unrealized P&L", fmtUsd(pnl), pnl >= 0 ? "text-up" : "text-down"],
        ].map(([label, value, tone]) => (
          <div key={label} className="bg-card px-4 py-5">
            <dt className="text-[10px] tracking-widest uppercase text-muted-foreground">{label}</dt>
            <dd className={`num mt-1 text-2xl font-semibold ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-16 text-center">
          <p className="text-sm text-muted-foreground">No positions yet.</p>
          <Link
            to="/market"
            className="glow mt-5 inline-flex rounded-xl bg-primary px-5 py-2.5 text-[10px] font-bold tracking-widest uppercase text-primary-foreground"
          >
            Browse the market
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto panel">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-border bg-surface/60 text-left">
                {["Trader", "Shares", "Avg entry", "Price", "Value", "P&L", "Return", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-[10px] font-medium tracking-widest uppercase text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/70 bg-card last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link to="/kol/$id" params={{ id: r.id }} className="flex items-center gap-3">
                      <AvatarMark gradient={r.kol.avatar} label={r.kol.ticker} src={r.kol.image} size={30} />
                      <div>
                        <p className="num text-sm font-bold tracking-widest">${r.kol.ticker}</p>
                        <p className="text-xs text-muted-foreground">{r.kol.handle}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="num px-4 py-3 text-sm">{r.shares.toFixed(2)}</td>
                  <td className="num px-4 py-3 text-sm text-muted-foreground">{fmtUsd(r.entry)}</td>
                  <td className="px-4 py-3">
                    <LivePrice value={r.price} className="text-sm" />
                  </td>
                  <td className="num px-4 py-3 text-sm">{fmtUsd(r.value)}</td>
                  <td className={`num px-4 py-3 text-sm ${r.pnl >= 0 ? "text-up" : "text-down"}`}>
                    {fmtUsd(r.pnl)}
                  </td>
                  <td className={`num px-4 py-3 text-sm ${r.pnl >= 0 ? "text-up" : "text-down"}`}>
                    {fmtPct(r.pnlPct)}
                  </td>
                  <td className="px-4 py-3">
                    <Sparkline data={r.kol.series} up={r.pnl >= 0} className="h-8 w-24" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trades.length > 0 && (
        <div className="mt-10">
          <h2 className="num text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            Recent fills
          </h2>
          <div className="mt-3 overflow-hidden panel">
            {trades.slice(0, 8).map((t, i) => (
              <div
                key={`${t.at}-${i}`}
                className="flex items-center gap-4 border-b border-border/70 bg-card px-4 py-2.5 text-xs last:border-0"
              >
                <span
                  className={`num rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    t.side === "buy" ? "bg-up/12 text-up" : "bg-down/12 text-down"
                  }`}
                >
                  {t.side}
                </span>
                <span className="num font-bold tracking-widest">
                  ${getKol(t.id)?.ticker ?? t.id.toUpperCase()}
                </span>
                <span className="num text-muted-foreground">{t.shares} shares</span>
                <span className="num ml-auto text-muted-foreground">{fmtUsd(t.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
