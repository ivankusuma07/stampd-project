"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConfig, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { demoUSDAbi } from "@stampd/chain";
import { formatDateTimeUtc, formatUsd } from "@stampd/core";
import { Button, EmptyState } from "@stampd/ui";
import { api, ApiError } from "@/lib/api";
import { CHAIN_ID, chain, deployment } from "@/lib/chain";
import { SignInGate } from "@/components/sign-in-gate";
import { useToasts } from "@/components/toasts";
import { PageHeader } from "@/components/page-header";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; theme?: string }) => string; reset: (id?: string) => void };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Faucet (development plan 3.4): captcha → the API signs a voucher bound to this wallet and its
 * nonce → the wallet claims onchain. The contract allows one claim per address per 24 hours.
 */
function Claim() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const config = useConfig();
  const toasts = useToasts();
  const { writeContractAsync } = useWriteContract();
  const [token, setToken] = useState<string | null>(SITE_KEY ? null : "dev");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widget = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  const usd = deployment?.contracts.DemoUSD;
  const balance = useReadContract({ address: usd, abi: demoUSDAbi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!usd && !!address } });
  const next = useReadContract({ address: usd, abi: demoUSDAbi, functionName: "nextClaimAt", args: address ? [address] : undefined, query: { enabled: !!usd && !!address } });
  const max = useReadContract({ address: usd, abi: demoUSDAbi, functionName: "maxClaimAmount", query: { enabled: !!usd } });

  const renderWidget = () => {
    if (!SITE_KEY || rendered.current || !widget.current || !window.turnstile) return;
    rendered.current = true;
    window.turnstile.render(widget.current, { sitekey: SITE_KEY, callback: setToken });
  };
  useEffect(renderWidget);

  if (!deployment || !usd) return <EmptyState title={`The faucet isn't deployed on ${chain.name} yet`} />;
  const availableAt = next.data && next.data > 0n ? new Date(Number(next.data) * 1000) : null;
  const waiting = availableAt !== null && availableAt > new Date();

  const claim = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const v = await api<{ amount: string; deadline: string; signature: `0x${string}` }>("/faucet/voucher", {
        method: "POST",
        json: { captchaToken: token },
      });
      const id = toasts.push({ title: "Claim demo USD…", description: "Confirm in your wallet", tone: "info" });
      const hash = await writeContractAsync({ address: usd, abi: demoUSDAbi, functionName: "claim", args: [BigInt(v.amount), BigInt(v.deadline), v.signature] });
      toasts.update(id, { title: "Claim submitted", hash });
      await waitForTransactionReceipt(config, { hash });
      toasts.update(id, { title: `Claimed ${formatUsd(BigInt(v.amount))}`, tone: "ok", hash });
      await Promise.all([balance.refetch(), next.refetch()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : ((err as { shortMessage?: string }).shortMessage ?? "Claim failed"));
    } finally {
      setBusy(false);
      if (SITE_KEY) {
        setToken(null);
        window.turnstile?.reset();
      }
    }
  };

  return (
    <div className="max-w-md space-y-5">
      {SITE_KEY ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={renderWidget} /> : null}
      <dl className="grid grid-cols-2 gap-4 font-mono">
        <div className="border-t border-rule-strong pt-2">
          <dt className="text-xs text-ink-3 uppercase">Your balance</dt>
          <dd className="text-2xl">{formatUsd(balance.data ?? 0n)}</dd>
        </div>
        <div className="border-t border-rule-strong pt-2">
          <dt className="text-xs text-ink-3 uppercase">Per claim, max</dt>
          <dd className="text-2xl">{max.data !== undefined ? formatUsd(max.data, { decimals: 0 }) : "—"}</dd>
        </div>
      </dl>
      {chainId !== CHAIN_ID ? (
        <Button onClick={() => switchChain({ chainId: CHAIN_ID })}>Switch to {chain.name}</Button>
      ) : waiting ? (
        <p className="rounded-xl border border-rule p-3 text-sm">Next claim available {formatDateTimeUtc(availableAt!)}.</p>
      ) : (
        <>
          {SITE_KEY ? <div ref={widget} /> : <p className="text-xs text-ink-3">Development mode: captcha is skipped.</p>}
          <Button className="w-full" disabled={!token || busy} onClick={claim}>
            {busy ? "Claiming…" : "Claim demo USD"}
          </Button>
        </>
      )}
      {error ? <p className="text-sm text-no">{error}</p> : null}
      <p className="text-xs text-ink-3">
        Demo USD has no value, can only move to STAMPD contracts, and can&apos;t be cashed out. You also need a little {chain.nativeCurrency.symbol} on{" "}
        {chain.name} for gas.
      </p>
    </div>
  );
}

export default function FaucetPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Demo USD" title={<>Faucet <span className="text-gradient">drip</span></>} tone="cyan">
        Free play money for trading on testnet. It has no value and can&apos;t leave STAMPD.
      </PageHeader>
      <SignInGate why="Claims are tied to your wallet, once per 24 hours.">
        <Claim />
      </SignInGate>
    </div>
  );
}
