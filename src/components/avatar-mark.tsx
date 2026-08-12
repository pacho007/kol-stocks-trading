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
      className="shrink-0 rounded-full p-px"
      style={{ background: gradient, width: size, height: size }}
    >
      <div
        className="num flex h-full w-full items-center justify-center rounded-full bg-background font-bold tracking-tight text-gold-light"
        style={{ fontSize: size * 0.3 }}
      >
        {label.slice(0, 3).toUpperCase()}
      </div>
    </div>
  );
}
