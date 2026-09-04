import { useEffect, useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ExplorerLink } from "@/components/explorer-link";

type Launch = {
  contract_address: string | null;
  pons_url: string | null;
  launched_at: string | null;
};

/**
 * The $SHARPS contract address, or an honest "not live yet".
 *
 * Read from public.token_launch at runtime rather than baked in at build time.
 * The reason is timing: the gap between a token going live and the first fake
 * address being posted is minutes, and a VITE_ variable cannot be changed in
 * minutes — it needs a rebuild and a republish. One UPDATE on that row puts the
 * real address on every open page at once.
 *
 * Until it is set this deliberately shows the warning rather than an empty box.
 * A blank space where an address should be is what sends someone to look for it
 * somewhere less trustworthy.
 */
export function TokenAddress() {
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) return;
    let alive = true;
    supabase
      .from("token_launch")
      .select("contract_address, pons_url, launched_at")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) setLaunch(data as Launch);
      });
    return () => {
      alive = false;
    };
  }, []);

  const address = launch?.contract_address?.trim() || null;

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the address is selectable on screen regardless */
    }
  }

  if (!address) {
    return (
      <div className="panel border-l-2 border-l-down/60 p-5">
        <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] uppercase text-down">
          <ShieldAlert className="size-3.5" aria-hidden />
          No contract address yet
        </p>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          $SHARPS has not launched. There is no contract address, so any $SHARPS token you can buy
          right now is not ours.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          The real address will appear in this box the moment it exists. Check here before you buy —
          not a reply, not a DM, not a screenshot.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-primary">
        $SHARPS contract address
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="num min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs whitespace-nowrap">
          {address}
        </code>
        <button
          onClick={copy}
          className="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3.5 text-[10px] font-bold tracking-[0.16em] uppercase text-primary transition-colors hover:bg-primary/20"
          aria-label="Copy the $SHARPS contract address"
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <ExplorerLink address={address} label="View on the explorer" />
        {launch?.pons_url && (
          <a
            href={launch.pons_url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
          >
            Trade on Pons
          </a>
        )}
      </p>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        This page is the source of truth for the address. Compare any address you are given against
        this one before you send anything.
      </p>
    </div>
  );
}
