import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PriceChart({ data, up }: { data: number[]; up: boolean }) {
  const rows = data.map((v, i) => ({ i, v }));
  const color = up ? "var(--up)" : "var(--down)";
  const min = Math.min(...data);
  const max = Math.max(...data);

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.38} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="i" hide />
          <YAxis
            domain={[min * 0.985, max * 1.015]}
            orientation="right"
            width={64}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
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
            labelFormatter={(l: number) => `T-${data.length - Number(l)}h`}
            formatter={(v: number) => [`$${Number(v).toFixed(2)}`, "Price"]}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill="url(#pcFill)"
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
