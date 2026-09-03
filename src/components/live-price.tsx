import { useEffect, useRef, useState } from "react";

/**
 * Digits chosen from magnitude rather than fixed at 2.
 *
 * Share prices are cents: at two decimals every listing on the board rendered
 * as "$0.01", so a trader at $0.0096 and one at $0.0125 were indistinguishable
 * and the price column carried no information at all. Only the percentage
 * beside it moved, which is a strange way to run a price display.
 */
function digitsFor(v: number): number {
  const abs = Math.abs(v);
  if (abs === 0) return 2;
  if (abs >= 1) return 2;
  if (abs >= 0.001) return 4;
  if (abs >= 0.00001) return 6;
  return 8;
}

export function LivePrice({
  value,
  className = "",
  digits,
}: {
  value: number;
  className?: string;
  digits?: number;
}) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value === prev.current) return;
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span
      className={`num rounded px-1 ${flash === "up" ? "flash-up" : ""} ${flash === "down" ? "flash-down" : ""} ${className}`}
    >
      ${value.toFixed(digits ?? digitsFor(value))}
    </span>
  );
}
