import { createContext, useContext, type ReactNode } from "react";
import type { PublicKey, Transaction } from "@solana/web3.js";

export type DiscoveredWallet = {
  name: string;
  icon: string;
  installed: boolean;
};

export type WalletCtx = {
  wallets: DiscoveredWallet[];
  selected: DiscoveredWallet | null;
  address: string | null;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  connect: (wallet?: DiscoveredWallet) => Promise<void>;
  disconnect: () => void;
  sendAndConfirm: (tx: Transaction) => Promise<string>;
};

export const WalletContext = createContext<WalletCtx | null>(null);

const unavailableWallet: WalletCtx = {
  wallets: [],
  selected: null,
  address: null,
  publicKey: null,
  connected: false,
  connecting: false,
  connect: async () => {
    throw new Error("Wallet support is still loading");
  },
  disconnect: () => undefined,
  sendAndConfirm: async () => {
    throw new Error("Connect a wallet first");
  },
};

export function WalletFallbackProvider({ children }: { children: ReactNode }) {
  return <WalletContext.Provider value={unavailableWallet}>{children}</WalletContext.Provider>;
}

export function useSolanaWallet(): WalletCtx {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useSolanaWallet must be used inside a wallet provider");
  return context;
}