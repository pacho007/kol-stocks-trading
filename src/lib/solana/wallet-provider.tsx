import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SOLANA_RPC_URL } from "./connection";

/**
 * No explicit adapter list — modern wallets (Phantom, Solflare, Backpack,
 * etc.) register themselves via the Wallet Standard automatically, so
 * `wallets={[]}` still discovers anything actually installed in the
 * browser. Deliberately skipping `@solana/wallet-adapter-wallets` (the
 * bundle of every wallet's SDK) — it pulls in a large, fragile dependency
 * tree for adapters this app doesn't need.
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
