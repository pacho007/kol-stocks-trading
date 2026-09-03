/**
 * wallet-provider.tsx — EVM wallet connection for Robinhood Chain.
 *
 * Uses EIP-6963 (multi-injected provider discovery) directly rather than
 * pulling in wagmi/RainbowKit: viem is already a dependency, and 6963 is how
 * modern wallets announce themselves, so every installed browser wallet shows
 * up without shipping each wallet's SDK. This mirrors the old Solana
 * provider's deliberate choice to rely on Wallet Standard auto-discovery
 * instead of bundling `@solana/wallet-adapter-wallets`.
 *
 * Connection is NOT automatic: a wallet prompt on page load is hostile, and
 * `eth_requestAccounts` must be user-initiated to avoid being blocked.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { ACTIVE_CHAIN } from "./chain";

/** Minimal EIP-1193 surface this app needs. */
type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type DiscoveredWallet = {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
};

type WalletCtx = {
  wallets: DiscoveredWallet[];
  selected: DiscoveredWallet | null;
  address: Address | null;
  connected: boolean;
  connecting: boolean;
  walletClient: WalletClient | null;
  /** Wrong network — the connected wallet isn't on Robinhood Chain. */
  wrongChain: boolean;
  connect: (wallet?: DiscoveredWallet) => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
};

const Ctx = createContext<WalletCtx | null>(null);

const STORAGE_KEY = "sharps.wallet.rdns";

export function EvmWalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [selected, setSelected] = useState<DiscoveredWallet | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);

  // EIP-6963 discovery: wallets announce themselves in response to our request.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const found = new Map<string, DiscoveredWallet>();

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail as DiscoveredWallet | undefined;
      if (!detail?.info?.rdns) return;
      found.set(detail.info.rdns, detail);
      setWallets(Array.from(found.values()));
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  const walletClient = useMemo(() => {
    if (!selected || !address) return null;
    return createWalletClient({
      account: address,
      chain: ACTIVE_CHAIN,
      transport: custom(selected.provider),
    });
  }, [selected, address]);

  const readChain = useCallback(async (provider: Eip1193Provider) => {
    try {
      const hex = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(hex, 16));
    } catch {
      setChainId(null);
    }
  }, []);

  const connect = useCallback(
    async (wallet?: DiscoveredWallet) => {
      const target = wallet ?? selected ?? wallets[0];
      if (!target) throw new Error("No EVM wallet detected — install MetaMask or Rabby.");
      setConnecting(true);
      try {
        const accounts = (await target.provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        const acct = accounts?.[0];
        if (!acct) throw new Error("Wallet returned no accounts");
        setSelected(target);
        setAddress(acct as Address);
        await readChain(target.provider);
        try {
          localStorage.setItem(STORAGE_KEY, target.info.rdns);
        } catch {
          /* storage blocked — reconnect is just manual next time */
        }
      } finally {
        setConnecting(false);
      }
    },
    [selected, wallets, readChain],
  );

  // Reconnect a previously-approved wallet WITHOUT prompting: eth_accounts
  // returns already-authorised accounts and never opens the wallet UI.
  useEffect(() => {
    if (address || wallets.length === 0) return;
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (!remembered) return;
    const match = wallets.find((w) => w.info.rdns === remembered);
    if (!match) return;

    let alive = true;
    (async () => {
      try {
        const accounts = (await match.provider.request({ method: "eth_accounts" })) as string[];
        const acct = accounts?.[0];
        if (!alive || !acct) return;
        setSelected(match);
        setAddress(acct as Address);
        await readChain(match.provider);
      } catch {
        /* not authorised any more — user connects manually */
      }
    })();
    return () => {
      alive = false;
    };
  }, [wallets, address, readChain]);

  // Track account/chain changes from the wallet itself.
  useEffect(() => {
    const provider = selected?.provider;
    if (!provider?.on) return;

    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown as string[];
      const acct = accounts?.[0];
      if (!acct) {
        setAddress(null);
        setSelected(null);
      } else {
        setAddress(acct as Address);
      }
    };
    const onChain = (...args: never[]) => {
      const hex = args[0] as unknown as string;
      setChainId(Number.parseInt(hex, 16));
    };

    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [selected]);

  const disconnect = useCallback(() => {
    // EIP-1193 has no "disconnect" — the dapp simply forgets the account.
    //
    // Forgetting on our side is not enough on its own. The wallet keeps its
    // own record that this site is approved, so the next connect re-attaches
    // the same account with no prompt: the app looks disconnected while the
    // wallet still considers the two paired, and there is no way to pick a
    // different account.
    //
    // wallet_revokePermissions drops that pairing, so the next connect asks
    // again. It is a MetaMask extension to EIP-1193 rather than part of the
    // standard, so this is best-effort: wallets without it simply keep the
    // old behaviour, which is why local state is cleared regardless and not
    // conditionally on the call succeeding.
    const provider = selected?.provider;
    if (provider) {
      void provider
        .request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
        .catch(() => {
          /* wallet doesn't implement it — local disconnect still applies */
        });
    }

    setAddress(null);
    setSelected(null);
    setChainId(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [selected]);

  const switchChain = useCallback(async () => {
    const provider = selected?.provider;
    if (!provider) return;
    const hexId = `0x${ACTIVE_CHAIN.id.toString(16)}`;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
    } catch (e) {
      // 4902 = chain unknown to the wallet; offer to add it.
      const code = (e as { code?: number }).code;
      if (code !== 4902) throw e;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: ACTIVE_CHAIN.name,
            nativeCurrency: ACTIVE_CHAIN.nativeCurrency,
            rpcUrls: [ACTIVE_CHAIN.rpcUrls.default.http[0]],
            blockExplorerUrls: ACTIVE_CHAIN.blockExplorers
              ? [ACTIVE_CHAIN.blockExplorers.default.url]
              : undefined,
          },
        ],
      });
    }
    await readChain(provider);
  }, [selected, readChain]);

  const value = useMemo<WalletCtx>(
    () => ({
      wallets,
      selected,
      address,
      connected: address !== null,
      connecting,
      walletClient,
      wrongChain: address !== null && chainId !== null && chainId !== ACTIVE_CHAIN.id,
      connect,
      disconnect,
      switchChain,
    }),
    [
      wallets,
      selected,
      address,
      connecting,
      walletClient,
      chainId,
      connect,
      disconnect,
      switchChain,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEvmWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEvmWallet must be used inside EvmWalletProvider");
  return ctx;
}
