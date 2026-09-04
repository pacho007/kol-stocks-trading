import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { checkMarketConfig, type ConfigProblem } from "@/lib/evm/preflight";

/**
 * Says out loud when the build is pointed somewhere it shouldn't be.
 *
 * Without this, every configuration mistake looks identical from the outside:
 * a market with no listings. That is the same thing a user sees on a healthy
 * site that simply hasn't finished loading, so nobody can tell a broken
 * mainnet cutover from a slow one — including whoever just did the cutover.
 *
 * Runs once on mount, client-side only. It is a diagnostic, so it fails quiet:
 * if the check itself throws, the app renders normally rather than showing a
 * scary banner about its own bug.
 */
export function ConfigBanner() {
  const [problem, setProblem] = useState<ConfigProblem | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkMarketConfig()
      .then((p) => {
        if (!cancelled) setProblem(p);
      })
      .catch(() => {
        /* diagnostic only — never break the page over it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!problem) return null;

  return (
    <div role="alert" className="border-b border-down/30 bg-down/10 px-4 py-2.5 text-down sm:px-6">
      <div className="mx-auto flex max-w-[80rem] items-start gap-2.5">
        <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
        <p className="text-[12px] leading-relaxed">
          <span className="font-semibold">{problem.headline}.</span>{" "}
          <span className="opacity-90">{problem.detail}</span>
        </p>
      </div>
    </div>
  );
}
