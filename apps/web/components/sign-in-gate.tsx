"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSession } from "./providers";

/** Renders children only for a signed-in wallet; otherwise explains what signing in does. */
export function SignInGate({ children, why }: { children: ReactNode; why: string }) {
  const { isConnected } = useAccount();
  const { signedIn, isLoading } = useSession();
  if (isLoading) return <p className="text-sm text-ink-3">Loading…</p>;
  if (signedIn) return <>{children}</>;
  return (
    <div className="rounded-[6px] border border-dashed border-rule-strong px-4 py-10 text-center">
      <p className="font-serif text-xl">{isConnected ? "Sign the message to continue" : "Connect your wallet"}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
        {why} Signing in is a free signature — no transaction, no gas.
      </p>
      <div className="mt-4 flex justify-center">
        <ConnectButton />
      </div>
    </div>
  );
}
