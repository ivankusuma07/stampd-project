"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { WagmiProvider, useAccount } from "wagmi";
import {
  RainbowKitAuthenticationProvider,
  RainbowKitProvider,
  createAuthenticationAdapter,
  lightTheme,
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
        createMessage: ({ nonce, address: addr, chainId }) =>
          createSiweMessage({
            domain: window.location.host,
            address: addr as `0x${string}`,
            statement: "Sign in to STAMPD. This costs nothing and sends no transaction.",
            uri: window.location.origin,
            version: "1",
            chainId,
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

  const theme = {
    lightMode: lightTheme({ accentColor: "#16140F", accentColorForeground: "#F6F4EE", borderRadius: "small", fontStack: "system" }),
    darkMode: darkTheme({ accentColor: "#F2EFE6", accentColorForeground: "#12110F", borderRadius: "small", fontStack: "system" }),
  };

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
