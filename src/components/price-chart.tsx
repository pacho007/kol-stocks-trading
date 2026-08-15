import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TIMEFRAMES, useKolHistory, type TimeframeKey } from "@/lib/market-store";

/**
 * Live price chart. Plots the KOL's recorded price history over a selectable
 * timeframe. History is recorded in the store as prices update, so the line
 * genuinely moves as time passes and as the oracle reprices the trader.
 *
 * On a fresh load, longer timeframes (1h/1d) will be sparse until the app has
 * been running that long — a chart can only show elapsed, recorded time.
 */
export function PriceChart({ id, up }: { id: string; up: boolean }) {
  const [tf, setTf] = useState<TimeframeKey>("1m");
  const tfMs = TIMEFRAMES.find((t) => t.key === tf)!.ms;
  const points = useKolHistory(id, tfMs);

  const rows = points.map((pt) => ({ t: pt.t, v: pt.p }));
  const vals = rows.map((r) => r.v);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const pad = (max - min) * 0.1 || max * 0.05 || 0.0001;
  const color = up ? "var(--up)" : "var(--down)";

  return (
    <div className="w-full">
      {/* timeframe selector */}
      <div className="mb-2 flex flex-wrap gap-1">
        {TIMEFRAMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTf(t.key)}
            className={`num rounded-sm px-2 py-1 text-[10px] tracking-widest uppercase transition-colors ${
              tf === t.key
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.key}
          </button>
        ))}
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.38} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis
              domain={[min - pad, max + pad]}
              orientation="right"
              width={72}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              tickFormatter={(v: number) => `$${v.toFixed(4)}`}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
              labelFormatter={(l: number) => new Date(Number(l)).toLocaleTimeString()}
              formatter={(v: number) => [`$${Number(v).toFixed(4)}`, "Price"]}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill="url(#pcFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
