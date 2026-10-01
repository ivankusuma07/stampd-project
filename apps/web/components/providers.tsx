"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { WagmiProvider, useAccount } from "wagmi";
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  createAuthenticationAdapter,
  darkTheme,
  type AuthenticationStatus,
} from "@rainbow-me/rainbowkit";
import { createSiweMessage } from "viem/siwe";
import { wagmiConfig, CHAIN_ID } from "@/lib/chain";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import { ToastProvider } from "./toasts";

/** The signed-in session (SIWE cookie), shared across the app. */
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), staleTime: 60_000 });
}

/** Signed in AND the connected wallet is the one the session belongs to. */
export function useSession() {
  const { address } = useAccount();
  const me = useMe();
  const wallet = me.data?.wallet ?? null;
  const signedIn = !!wallet && !!address && wallet === address.toLowerCase();
  return { ...me, wallet: signedIn ? wallet : null, isAdmin: signedIn && !!me.data?.isAdmin, signedIn };
}

function Auth({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useMe();
  const { address } = useAccount();

  const status: AuthenticationStatus = isLoading
    ? "loading"
    : data?.wallet && address && data.wallet === address.toLowerCase()
      ? "authenticated"
      : "unauthenticated";

  const adapter = useMemo(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => (await api<{ nonce: string }>("/auth/nonce")).nonce,
        // chainId is always STAMPD's chain, not the wallet's current network: MetaMask keeps a network per
        // site, and a wallet still on Ethereum produced a chain-1 message the API rejects. Signing is
        // chain-agnostic; trading still asks the wallet to switch.
        createMessage: ({ nonce, address: addr }) =>
          createSiweMessage({
            domain: window.location.host,
            address: addr as `0x${string}`,
            statement: "Sign in to STAMPD. This costs nothing and sends no transaction.",
            uri: window.location.origin,
            version: "1",
            chainId: CHAIN_ID,
            nonce,
          }),
        verify: async ({ message, signature }) => {
          try {
            await api("/auth/verify", { method: "POST", json: { message, signature } });
            await qc.invalidateQueries();
            return true;
          } catch {
            return false;
          }
        },
        signOut: async () => {
          await api("/auth/logout", { method: "POST" });
          await qc.invalidateQueries();
        },
      }),
    [qc],
  );

  // The wallet modal is always dark with the brand lime accent (tokens.css --brand / --brand-ink): STAMPD is
  // dark-first, and RainbowKit's light/dark pair follows the OS setting, which put lime text on white.
  const theme = darkTheme({ accentColor: "#c8ff2e", accentColorForeground: "#0a0c07", borderRadius: "large", fontStack: "system" });

  return (
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      <RainbowKitProvider initialChain={CHAIN_ID} theme={theme} modalSize="compact">
        {children}
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <Auth>
          <ToastProvider>{children}</ToastProvider>
        </Auth>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
