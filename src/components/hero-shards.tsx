import { useEffect, useRef } from "react";

type Shard = {
  x: number;
  y: number;
  z: number; // 0.35–1, drives size, speed and opacity for parallax depth
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  pts: { x: number; y: number }[];
};

/**
 * Glass shards drifting outward behind the wordmark.
 *
 * Canvas rather than DOM nodes: this is ~70 independently rotating, parallaxed
 * shapes, and that many animated elements in the DOM costs a layout/paint pass
 * per frame. On canvas it's one composite.
 *
 * Deliberately restrained — it sits BEHIND the headline, so it has to read as
 * atmosphere rather than compete with the text for attention.
 */
export function HeroShards({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Respect the OS setting: this is decoration, and for anyone who gets
    // motion sick it's the kind of thing that makes a page unusable. Draw a
    // single static frame instead of animating.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let shards: Shard[] = [];
    let raf = 0;
    let running = true;

    /** Irregular 4–5 sided sliver, so they read as broken glass not confetti. */
    function makeShardPoints(): { x: number; y: number }[] {
      const n = 3 + Math.floor(Math.random() * 2);
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.7;
        const r = 0.45 + Math.random() * 0.55;
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      return pts;
    }

    function spawn(initial: boolean): Shard {
      const z = 0.35 + Math.random() * 0.65;
      // Bias origin toward the centre so shards appear to burst from behind
      // the wordmark rather than raining uniformly.
      const cx = width / 2;
      const cy = height * 0.42;
      const spread = initial ? 1 : 0.35;
      const angle = Math.random() * Math.PI * 2;
      const dist = (initial ? Math.random() : 0.15 + Math.random() * 0.2) * width * 0.55 * spread;
      const speed = (0.09 + Math.random() * 0.22) * z;
      return {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist * 0.6,
        z,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6 - 0.03,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.006,
        size: (7 + Math.random() * 22) * z,
        pts: makeShardPoints(),
      };
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Fewer shards on small screens — same visual density, less work.
      const count = width < 640 ? 28 : width < 1100 ? 48 : 70;
      shards = Array.from({ length: count }, () => spawn(true));
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);

      for (const s of shards) {
        ctx!.save();
        ctx!.translate(s.x, s.y);
        ctx!.rotate(s.rot);

        const alpha = 0.05 + s.z * 0.22;
        // Glass: a light edge and a barely-there fill, tinted toward the
        // brand pink rather than pure white so it belongs to the palette.
        const grad = ctx!.createLinearGradient(-s.size, -s.size, s.size, s.size);
        grad.addColorStop(0, `rgba(255,255,255,${alpha * 0.9})`);
        grad.addColorStop(0.5, `rgba(255,138,205,${alpha * 0.55})`);
        grad.addColorStop(1, `rgba(255,255,255,${alpha * 0.15})`);

        ctx!.beginPath();
        s.pts.forEach((p, i) => {
          const px = p.x * s.size;
          const py = p.y * s.size;
          if (i === 0) ctx!.moveTo(px, py);
          else ctx!.lineTo(px, py);
        });
        ctx!.closePath();
        ctx!.fillStyle = grad;
        ctx!.fill();
        ctx!.strokeStyle = `rgba(255,255,255,${alpha * 0.7})`;
        ctx!.lineWidth = 0.6;
        ctx!.stroke();
        ctx!.restore();
      }
    }

    function step() {
      if (!running) return;
      for (const s of shards) {
        s.x += s.vx;
        s.y += s.vy;
        s.rot += s.vrot;
        // Recycle once fully outside, so the field never thins out.
        if (s.x < -80 || s.x > width + 80 || s.y < -80 || s.y > height + 80) {
          Object.assign(s, spawn(false));
        }
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    resize();
    if (reduceMotion) {
      draw();
    } else {
      raf = requestAnimationFrame(step);
    }

    const onResize = () => resize();
    // A background tab still fires rAF in some browsers; stop outright.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduceMotion && !running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
