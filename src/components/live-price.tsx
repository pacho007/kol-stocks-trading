import { useEffect, useRef, useState } from "react";

export function LivePrice({
  value,
  className = "",
  digits = 2,
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
      ${value.toFixed(digits)}
    </span>
  );
}
