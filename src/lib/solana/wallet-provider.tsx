/**
 * wallet-provider.tsx — Solana wallet connection.
 *
 * No explicit adapter list: modern wallets (Phantom, Solflare, Backpack, …)
 * register themselves through the Wallet Standard, so `wallets={[]}` still
 * discovers anything actually installed, without bundling every wallet's SDK.
 *
 * useSolanaWallet() wraps the adapter's own hook in the small surface the app
 * uses, so components don't each re-implement "select, then connect once the
 * selection lands" or confirmation handling.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import type { PublicKey, Transaction } from "@solana/web3.js";
import { RPC_URL, getConnection } from "./chain";

export type DiscoveredWallet = {
  name: string;
  icon: string;
  installed: boolean;
};

type WalletCtx = {
  wallets: DiscoveredWallet[];
  selected: DiscoveredWallet | null;
  address: string | null;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  connect: (wallet?: DiscoveredWallet) => Promise<void>;
  disconnect: () => void;
  /** Sign, send and wait for confirmation. Resolves to the signature. */
  sendAndConfirm: (tx: Transaction) => Promise<string>;
};

const Ctx = createContext<WalletCtx | null>(null);

function Bridge({ children }: { children: ReactNode }) {
  const {
    wallets: adapters,
    wallet,
    publicKey,
    connected,
    connecting,
    select,
    connect: adapterConnect,
    disconnect: adapterDisconnect,
    sendTransaction,
  } = useWallet();

  const wallets = useMemo<DiscoveredWallet[]>(
    () =>
      adapters
        .filter((w) => w.readyState !== WalletReadyState.Unsupported)
        .map((w) => ({
          name: w.adapter.name,
          icon: w.adapter.icon,
          installed:
            w.readyState === WalletReadyState.Installed ||
            w.readyState === WalletReadyState.Loadable,
        })),
    [adapters],
  );

  const selected = useMemo(
    () => (wallet ? (wallets.find((w) => w.name === wallet.adapter.name) ?? null) : null),
    [wallet, wallets],
  );

  // select() is asynchronous with respect to React state: the adapter it
  // names only becomes `wallet` on the next render, and calling connect()
  // before then connects the PREVIOUS selection (or throws WalletNotSelected).
  // So connect() records the intent and this effect completes it.
  const [pending, setPending] = useState<string | null>(null);
  const resolvers = useRef<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);

  useEffect(() => {
    if (!pending || !wallet || wallet.adapter.name !== pending) return;
    setPending(null);
    adapterConnect().then(
      () => resolvers.current?.resolve(),
      (e) => resolvers.current?.reject(e),
    );
  }, [pending, wallet, adapterConnect]);

  const connect = useCallback(
    (target?: DiscoveredWallet) => {
      const choice = target ?? selected ?? wallets.find((w) => w.installed);
      if (!choice) {
        return Promise.reject(
          new Error("No Solana wallet detected — install Phantom, Solflare or Backpack."),
        );
      }
      if (!choice.installed) {
        // Not installed: send them to the wallet's site rather than failing.
        const adapter = adapters.find((w) => w.adapter.name === choice.name)?.adapter;
        if (adapter?.url && typeof window !== "undefined") window.open(adapter.url, "_blank");
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        resolvers.current = { resolve, reject };
        if (wallet?.adapter.name === choice.name) {
          adapterConnect().then(resolve, reject);
        } else {
          select(choice.name as WalletName);
          setPending(choice.name);
        }
      });
    },
    [selected, wallets, adapters, wallet, select, adapterConnect],
  );

  const disconnect = useCallback(() => {
    void adapterDisconnect().catch(() => {
      /* already disconnected */
    });
  }, [adapterDisconnect]);

  const sendAndConfirm = useCallback(
    async (tx: Transaction) => {
      if (!publicKey) throw new Error("Connect a wallet first");
      const connection = getConnection();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.feePayer = publicKey;
      tx.recentBlockhash = blockhash;
      const signature = await sendTransaction(tx, connection);
      const res = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      if (res.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
      }
      return signature;
    },
    [publicKey, sendTransaction],
  );

  const value = useMemo<WalletCtx>(
    () => ({
      wallets,
      selected,
      address: publicKey?.toBase58() ?? null,
      publicKey,
      connected,
      connecting: connecting || pending !== null,
      connect,
      disconnect,
      sendAndConfirm,
    }),
    [
      wallets,
      selected,
      publicKey,
      connected,
      connecting,
      pending,
      connect,
      disconnect,
      sendAndConfirm,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const adapters = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      {/* autoConnect only re-attaches a wallet the user already approved on
          this site; it never opens a prompt on page load. */}
      <WalletProvider wallets={adapters} autoConnect>
        <Bridge>{children}</Bridge>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function useSolanaWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSolanaWallet must be used inside SolanaWalletProvider");
  return ctx;
}
