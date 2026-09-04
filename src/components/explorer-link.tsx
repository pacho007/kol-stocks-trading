import { ExternalLink } from "lucide-react";
import { explorerAddressUrl, explorerTxUrl, EXPLORER_NAME } from "@/lib/evm/chain";

/**
 * A wallet, contract or transaction, linked to the chain.
 *
 * One component rather than ad-hoc anchors, so every claim the product makes
 * is checkable the same way and none of them can quietly stop being links
 * again. Opens in a new tab with the usual rel guard, and carries a title that
 * says where it goes — an unexplained external icon is its own small friction.
 */
export function ExplorerLink({
  address,
  tx,
  label,
  className = "",
  showIcon = true,
}: {
  address?: string;
  tx?: string;
  /** Defaults to a truncated form of whatever is being linked. */
  label?: string;
  className?: string;
  showIcon?: boolean;
}) {
  const value = address ?? tx;
  if (!value) return null;

  const href = address ? explorerAddressUrl(address) : explorerTxUrl(tx!);
  const short = `${value.slice(0, 6)}…${value.slice(-4)}`;
  const what = address ? "address" : "transaction";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={`View this ${what} on ${EXPLORER_NAME}`}
      onClick={(e) => e.stopPropagation()}
      className={`num inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 transition-colors hover:text-primary ${className}`}
    >
      {label ?? short}
      {showIcon && <ExternalLink className="size-3 opacity-60" aria-hidden />}
    </a>
  );
}
