import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PublicKey, type Transaction } from "@solana/web3.js";
import { getConnection } from "./chain";
import { WalletContext, type DiscoveredWallet, type WalletCtx } from "./wallet-context";

type InjectedProvider = {
  publicKey?: PublicKey | { toBase58(): string } | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey?: PublicKey }>;
  disconnect(): Promise<void>;
  signAndSendTransaction?(transaction: Transaction): Promise<string | { signature: string }>;
  signTransaction?(transaction: Transaction): Promise<Transaction>;
  on?(event: "connect" | "disconnect" | "accountChanged", handler: (...args: unknown[]) => void): void;
  off?(event: "connect" | "disconnect" | "accountChanged", handler: (...args: unknown[]) => void): void;
};

type WalletWindow = Window & {
  phantom?: { solana?: InjectedProvider };
  solflare?: InjectedProvider;
  backpack?: InjectedProvider;
};

type BrowserWallet = DiscoveredWallet & { provider: InjectedProvider };

const WALLET_STORAGE_KEY = "sharps-solana-wallet";

function discoverWallets(): BrowserWallet[] {
  if (typeof window === "undefined") return [];
  const walletWindow = window as WalletWindow;
  const candidates = [
    { name: "Phantom", provider: walletWindow.phantom?.solana },
    { name: "Solflare", provider: walletWindow.solflare },
    { name: "Backpack", provider: walletWindow.backpack },
  ];

  return candidates.map(({ name, provider }) => ({
    name,
    icon: "",
    installed: Boolean(provider),
    provider: provider as InjectedProvider,
  }));
}

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<BrowserWallet[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const discovered = discoverWallets();
    setWallets(discovered);
    // Extensions can inject after page load — re-check a few times.
    const timers = [300, 1000, 2500].map((ms) =>
      window.setTimeout(() => setWallets(discoverWallets()), ms),
    );
    const storedName = window.localStorage.getItem(WALLET_STORAGE_KEY);
    const stored = discovered.find((wallet) => wallet.name === storedName && wallet.installed);
    if (!stored) return () => timers.forEach(clearTimeout);

    stored.provider
      .connect({ onlyIfTrusted: true })
      .then((result) => {
        const key = result.publicKey ?? stored.provider.publicKey;
        if (!key) return;
        setSelectedName(stored.name);
        setPublicKey(new PublicKey(key.toBase58()));
      })
      .catch(() => window.localStorage.removeItem(WALLET_STORAGE_KEY));
    return () => timers.forEach(clearTimeout);
  }, []);

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.name === selectedName) ?? null,
    [selectedName, wallets],
  );

  useEffect(() => {
    const provider = selectedWallet?.provider;
    if (!provider?.on) return;
    const syncAccount = () => {
      const key = provider.publicKey;
      setPublicKey(key ? new PublicKey(key.toBase58()) : null);
    };
    const clearAccount = () => setPublicKey(null);
    provider.on("connect", syncAccount);
    provider.on("accountChanged", syncAccount);
    provider.on("disconnect", clearAccount);
    return () => {
      provider.off?.("connect", syncAccount);
      provider.off?.("accountChanged", syncAccount);
      provider.off?.("disconnect", clearAccount);
    };
  }, [selectedWallet]);

  const connect = useCallback(
    async (target?: DiscoveredWallet) => {
      const fresh = discoverWallets();
      setWallets(fresh);
      const installed = fresh.filter((w) => w.installed);
      const wallet =
        target ? installed.find((candidate) => candidate.name === target.name) : installed[0];
      if (!wallet) {
        const urls: Record<string, string> = {
          Phantom: "https://phantom.app/download",
          Solflare: "https://solflare.com/download",
          Backpack: "https://backpack.app/download",
        };
        if (target && !target.installed && urls[target.name]) {
          window.open(urls[target.name], "_blank", "noopener");
        }
        throw new Error("No Solana wallet detected — install Phantom, Solflare or Backpack.");
      }
      setConnecting(true);
      try {
        const result = await wallet.provider.connect();
        const key = result.publicKey ?? wallet.provider.publicKey;
        if (!key) throw new Error("The wallet did not return an account");
        setSelectedName(wallet.name);
        setPublicKey(new PublicKey(key.toBase58()));
        window.localStorage.setItem(WALLET_STORAGE_KEY, wallet.name);
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const disconnect = useCallback(() => {
    const provider = selectedWallet?.provider;
    setSelectedName(null);
    setPublicKey(null);
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
    void provider?.disconnect().catch(() => undefined);
  }, [selectedWallet]);

  const sendAndConfirm = useCallback(
    async (transaction: Transaction) => {
      const provider = selectedWallet?.provider;
      if (!provider || !publicKey) throw new Error("Connect a wallet first");
      const connection = getConnection();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = publicKey;
      transaction.recentBlockhash = blockhash;

      let signature: string;
      if (provider.signAndSendTransaction) {
        const result = await provider.signAndSendTransaction(transaction);
        signature = typeof result === "string" ? result : result.signature;
      } else if (provider.signTransaction) {
        const signed = await provider.signTransaction(transaction);
        signature = await connection.sendRawTransaction(signed.serialize());
      } else {
        throw new Error("This wallet cannot send Solana transactions");
      }

      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      if (confirmation.value.err) throw new Error("Transaction failed");
      return signature;
    },
    [publicKey, selectedWallet],
  );

  const value = useMemo<WalletCtx>(
    () => ({
      wallets,
      selected: selectedWallet,
      address: publicKey?.toBase58() ?? null,
      publicKey,
      connected: publicKey !== null,
      connecting,
      connect,
      disconnect,
      sendAndConfirm,
    }),
    [wallets, selectedWallet, publicKey, connecting, connect, disconnect, sendAndConfirm],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}