"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, ChevronDown, PenLine, Wallet } from "lucide-react";

const base =
  "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2";
const brand = `${base} bg-brand text-brand-ink shadow-[0_6px_24px_-8px_var(--brand)] hover:brightness-110`;

/**
 * Wallet button for the whole site: RainbowKit's logic (connect, SIWE sign-in, network, account
 * modals) with our own look. Not connected: a lime "Connect wallet" button with a wallet icon.
 * Connected but not signed in: "Sign in". Wrong network: a red "Wrong network" button. Signed in:
 * the short address in a quiet pill that opens the account modal.
 */
export function WalletButton({
  label = "Connect wallet",
  showChain = false,
  compact = false,
}: {
  label?: string;
  showChain?: boolean;
  /** header use: on very narrow phones the label shortens to "Connect" so the button still fits */
  compact?: boolean;
}) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, authenticationStatus, openConnectModal, openAccountModal, openChainModal }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const signedIn = ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");
        if (!ready) return <span aria-hidden className="inline-block h-10 w-36 rounded-full bg-surface-2/60" />;

        if (!signedIn) {
          // A connected wallet that still has to sign the SIWE message: the connect modal shows the sign step.
          const needsSignature = !!account;
          return (
            <button type="button" onClick={openConnectModal} className={brand}>
              {needsSignature ? <PenLine size={16} aria-hidden /> : <Wallet size={16} aria-hidden />}
              {needsSignature ? (
                "Sign in"
              ) : compact ? (
                <>
                  <span className="max-[400px]:hidden">{label}</span>
                  <span className="hidden max-[400px]:inline">Connect</span>
                </>
              ) : (
                label
              )}
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className={`${base} border border-no/50 bg-no-bg text-no hover:brightness-125`}>
              <AlertTriangle size={16} aria-hidden /> Wrong network
            </button>
          );
        }
        return (
          <span className="inline-flex items-center gap-2">
            {showChain ? (
              <button
                type="button"
                onClick={openChainModal}
                aria-label={`Network: ${chain.name ?? "unknown"}`}
                className="grid h-10 w-10 place-items-center rounded-full border border-rule bg-surface/60 hover:border-rule-strong"
              >
                {chain.hasIcon && chain.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- RainbowKit supplies chain icons as data URLs
                  <img src={chain.iconUrl} alt="" width={18} height={18} className="rounded-full" />
                ) : (
                  <span className="text-[10px] font-bold text-ink-2">{(chain.name ?? "?").slice(0, 2)}</span>
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={openAccountModal}
              className={`${base} border border-brand/40 bg-surface/60 font-mono text-ink hover:border-brand`}
            >
              <Wallet size={16} className="text-accent" aria-hidden />
              {account.displayName}
              <ChevronDown size={14} className="text-ink-3" aria-hidden />
            </button>
          </span>
        );
      }}
    </ConnectButton.Custom>
  );
}
