export function AvatarMark({
  gradient,
  label,
  src,
  size = 40,
}: {
  gradient: string;
  label: string;
  src?: string;
  size?: number;
}) {
  return (
    <div
      className="shrink-0 rounded-full p-px"
      style={{ background: gradient, width: size, height: size }}
    >
      <div
        className="num relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-background font-bold tracking-tight text-gold-light"
        style={{ fontSize: size * 0.3 }}
      >
        <span aria-hidden={src ? "true" : undefined}>{label.slice(0, 3).toUpperCase()}</span>
        {src ? (
          <img
            src={src}
            alt={label}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
