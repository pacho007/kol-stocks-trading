export function AvatarMark({
  gradient,
  label,
  size = 40,
}: {
  gradient: string;
  label: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg border border-border/60 text-[0.7em] font-bold tracking-tight text-background"
      style={{ background: gradient, width: size, height: size, fontSize: size * 0.34 }}
    >
      {label.slice(0, 3).toUpperCase()}
    </div>
  );
}
