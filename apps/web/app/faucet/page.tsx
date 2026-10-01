"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useBalance, useConfig, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { formatEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, Plus } from "lucide-react";
import { demoUSDAbi } from "@stampd/chain";
import { formatDateTimeUtc, formatUsd } from "@stampd/core";
import { Button, EmptyState } from "@stampd/ui";
import { api, ApiError } from "@/lib/api";
import type { Status } from "@/lib/types";
import { CHAIN_ID, chain, deployment } from "@/lib/chain";
import { SignInGate } from "@/components/sign-in-gate";
import { useToasts } from "@/components/toasts";
import { PageHeader } from "@/components/page-header";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void; theme?: string; action?: string },
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TESTNET = CHAIN_ID !== 4663; // testnet and local dev: faucets; mainnet: bridges
/** Enough gas for dozens of trades at today's prices; below this the gas step isn't "done". */
const GAS_ENOUGH_WEI = 10n ** 14n; // 0.0001 ETH

/** Where to get gas. Testnet faucets pay ETH straight onto Robinhood Chain Testnet; mainnet needs a bridge. */
const GAS_LINKS: { label: string; href: string }[] = TESTNET
  ? [
      { label: "Robinhood testnet faucet", href: "https://faucet.testnet.chain.robinhood.com" },
      { label: "Alchemy faucet", href: "https://www.alchemy.com/faucets/robinhood-testnet" },
    ]
  : [
      { label: "relay.link", href: "https://relay.link/bridge/robinhood" },
      { label: "across.to", href: "https://across.to/?to=robinhood" },
      { label: "Official bridge", href: "https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum" },
    ];

function formatGas(wei: bigint) {
  if (wei === 0n) return `0 ${chain.nativeCurrency.symbol}`;
  if (wei < 10n ** 15n) return `<0.001 ${chain.nativeCurrency.symbol}`;
  return `${Number(formatEther(wei)).toFixed(4)} ${chain.nativeCurrency.symbol}`;
}

/** Faucet (development plan 3.4) as three steps: gas, demo USD, trade. */
export default function FaucetPage() {
  const { address, isConnected } = useAccount();
  const usd = deployment?.contracts.DemoUSD;
  const gas = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address, refetchInterval: 15_000 } });
  const balance = useReadContract({
    address: usd,
    abi: demoUSDAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!usd && !!address, refetchInterval: 15_000 },
  });
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/status") });

  const hasGas = (gas.data?.value ?? 0n) >= GAS_ENOUGH_WEI;
  const hasUsd = (balance.data ?? 0n) > 0n;

  if (!deployment || !usd) return <EmptyState title={`The faucet isn't deployed on ${chain.name} yet`} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Get started" title={<>Get gas &amp; <span className="text-gradient">demo USD</span></>} tone="cyan">
        Get a little {chain.nativeCurrency.symbol} for gas, claim free demo USD, then start trading. Demo USD is play money with no
        value.
      </PageHeader>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Tile label={`Gas balance (${chain.nativeCurrency.symbol})`} value={isConnected ? (gas.data ? formatGas(gas.data.value) : "…") : "-"} ok={hasGas} />
        <Tile label="Demo USD balance" value={isConnected ? (balance.data !== undefined ? formatUsd(balance.data) : "…") : "-"} ok={hasUsd} />
      </dl>

      {!isConnected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-surface/70 px-5 py-4 backdrop-blur">
          <p className="text-sm text-ink-2">Connect your wallet to see your balances.</p>
          <ConnectButton />
        </div>
      ) : null}

      <Step n={1} done={hasGas} title={`${chain.nativeCurrency.symbol} for gas (${chain.name})`}>
        <p>
          {TESTNET
            ? `Every transaction needs a little test ${chain.nativeCurrency.symbol} on ${chain.name}. These faucets send it straight to your wallet on that network, for free:`
            : `Every transaction needs a little ${chain.nativeCurrency.symbol} on ${chain.name} (a dollar goes a long way; a trade costs well under a cent). Bridge some from any chain:`}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {GAS_LINKS.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              {l.label} <ArrowUpRight size={14} aria-hidden />
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-3">
          {TESTNET ? "Usually arrives within a minute or two." : "Arrives in minutes."} You need gas before anything else works,
          including claiming demo USD.
        </p>
        <NetworkHelp gasWei={isConnected ? gas.data?.value : undefined} />
      </Step>

      <Step n={2} done={hasUsd} title="Demo USD to trade with">
        <SignInGate why="Claims are tied to your wallet, once per 24 hours.">
          <Claim claimUsd={status.data?.faucet?.claimUsd} hasGas={hasGas} onClaimed={() => balance.refetch()} />
        </SignInGate>
      </Step>

      <Step n={3} done={false} title="Trade">
        <p>With gas and demo USD you can trade any open market. Buy YES or NO on the calls you believe.</p>
        <Link
          href="/markets"
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full border border-rule-strong bg-surface-2 px-5 text-sm font-semibold text-ink hover:border-brand/50"
        >
          Explore markets <ArrowRight size={16} aria-hidden />
        </Link>
      </Step>

      <p className="text-xs text-ink-3">
        Demo USD has no value, can only move to STAMPD contracts, and can&apos;t be cashed out.
      </p>
    </div>
  );
}

/** Same address on every chain, but only ETH on this chain pays gas here: say so, and add the network in one click. */
function NetworkHelp({ gasWei }: { gasWei: bigint | undefined }) {
  // useAccount().chainId is the wallet's real network; wagmi's useChainId() falls back to the
  // app's chain when the wallet is on one we don't configure (e.g. Ethereum), hiding the mismatch.
  const { isConnected, chainId: walletChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [manual, setManual] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rpc = chain.rpcUrls.default.http[0]!; // public RPC only: never hand wallets a keyed provider URL
  const explorer = chain.blockExplorers?.default.url;
  const onChain = isConnected && walletChain === CHAIN_ID;

  const add = async () => {
    setNote(null);
    try {
      if (isConnected) {
        await switchChainAsync({ chainId: CHAIN_ID }); // wagmi adds the network first when the wallet doesn't know it
      } else {
        const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params: unknown[] }) => Promise<unknown> } }).ethereum;
        if (!eth) {
          setManual(true);
          return;
        }
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${CHAIN_ID.toString(16)}`,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: [rpc],
              blockExplorerUrls: explorer ? [explorer] : [],
            },
          ],
        });
      }
      setNote(`${chain.name} is in your wallet.`);
    } catch {
      setNote("Your wallet didn't add it. You can enter the settings by hand below.");
      setManual(true);
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t border-dashed border-rule-strong pt-4">
      <p className="font-medium text-ink">
        Your {chain.nativeCurrency.symbol} must be on {chain.name}. The same wallet address on Ethereum, Arbitrum or Base doesn&apos;t
        count until you bridge it.
      </p>

      {isConnected && !onChain ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-no/40 bg-no-bg px-4 py-3 text-no">
          <AlertTriangle size={16} aria-hidden />
          <span className="flex-1">Your wallet is on another network.</span>
          <Button variant="secondary" onClick={add}>
            Switch to {chain.name}
          </Button>
        </div>
      ) : null}

      {onChain && gasWei === 0n ? (
        <div className="flex items-start gap-3 rounded-xl border border-no/40 bg-no-bg px-4 py-3 text-no">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            No {chain.nativeCurrency.symbol} on {chain.name} yet. If you have ETH elsewhere, it&apos;s on a different network: bridge it
            here with one of the links above.
          </span>
        </div>
      ) : null}

      {onChain && gasWei !== undefined && gasWei > 0n ? (
        <p className="flex items-center gap-2 text-yes">
          <Check size={14} aria-hidden /> Your wallet is on {chain.name}.
        </p>
      ) : null}

      {!onChain ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={add}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-rule-strong bg-surface-2 px-4 text-sm font-semibold text-ink hover:border-brand/50"
          >
            <Plus size={16} aria-hidden /> Add {chain.name} to my wallet
          </button>
          <button type="button" onClick={() => setManual((m) => !m)} className="text-xs text-ink-3 underline hover:text-ink">
            {manual ? "Hide" : "Show"} network settings
          </button>
        </div>
      ) : null}
      {note ? <p className="text-xs text-ink-2">{note}</p> : null}

      {manual ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border border-rule bg-surface-2/60 px-4 py-3 font-mono text-xs">
          <dt className="text-ink-3">Network name</dt>
          <dd className="text-ink">{chain.name}</dd>
          <dt className="text-ink-3">Chain ID</dt>
          <dd className="text-ink">{CHAIN_ID}</dd>
          <dt className="text-ink-3">RPC URL</dt>
          <dd className="break-all text-ink">{rpc}</dd>
          <dt className="text-ink-3">Currency</dt>
          <dd className="text-ink">{chain.nativeCurrency.symbol}</dd>
          {explorer ? (
            <>
              <dt className="text-ink-3">Explorer</dt>
              <dd className="break-all text-ink">{explorer}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

function Tile({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-2xl border border-rule bg-surface/70 px-5 py-4 backdrop-blur">
      <dt className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-ink-3 uppercase">
        {label}
        {ok ? <Check size={12} className="text-yes" aria-label="enough" /> : null}
      </dt>
      <dd className="mt-1 font-mono text-2xl text-ink">{value}</dd>
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section className={`rounded-3xl border bg-surface/80 p-6 backdrop-blur ${done ? "border-yes/30" : "border-rule"}`} aria-label={`Step ${n}: ${title}`}>
      <div className="flex items-center gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold ${done ? "bg-yes text-paper" : "bg-brand text-brand-ink"}`}
          aria-hidden
        >
          {done ? <Check size={16} strokeWidth={3} /> : n}
        </span>
        <h2 className="font-display text-lg font-bold text-ink">
          {title}
          {done ? <span className="sr-only"> (done)</span> : null}
        </h2>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

/** Captcha, then the API signs a voucher bound to this wallet and its nonce, then the wallet claims onchain. */
function Claim({ claimUsd, hasGas, onClaimed }: { claimUsd?: number; hasGas: boolean; onClaimed: () => void }) {
  const { address, chainId } = useAccount(); // the wallet's real network (see NetworkHelp)
  const { switchChain } = useSwitchChain();
  const config = useConfig();
  const toasts = useToasts();
  const { writeContractAsync } = useWriteContract();
  const [token, setToken] = useState<string | null>(SITE_KEY ? null : "dev");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widget = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  const usd = deployment!.contracts.DemoUSD;
  const next = useReadContract({ address: usd, abi: demoUSDAbi, functionName: "nextClaimAt", args: address ? [address] : undefined, query: { enabled: !!address } });

  const renderWidget = () => {
    if (!SITE_KEY || rendered.current || !widget.current || !window.turnstile) return;
    rendered.current = true;
    window.turnstile.render(widget.current, {
      sitekey: SITE_KEY,
      action: "faucet", // the API checks this (and the hostname) on Siteverify
      theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
      callback: setToken,
      // tokens expire after 5 minutes: drop it so the button waits for a fresh one
      "expired-callback": () => setToken(null),
    });
  };
  useEffect(renderWidget);

  const availableAt = next.data && next.data > 0n ? new Date(Number(next.data) * 1000) : null;
  const waiting = availableAt !== null && availableAt > new Date();
  const amountLabel = claimUsd ? ` $${claimUsd.toLocaleString("en-US")}` : "";

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
      await next.refetch();
      onClaimed();
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
    <div className="space-y-3">
      {SITE_KEY ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={renderWidget} /> : null}
      {chainId !== CHAIN_ID ? (
        <Button onClick={() => switchChain({ chainId: CHAIN_ID })}>Switch to {chain.name}</Button>
      ) : waiting ? (
        <p className="rounded-xl border border-rule p-3 text-sm">You&apos;ve claimed today. Next claim available {formatDateTimeUtc(availableAt!)}.</p>
      ) : (
        <>
          {SITE_KEY ? <div ref={widget} /> : <p className="text-xs text-ink-3">Development mode: captcha is skipped.</p>}
          <Button className="w-full sm:w-auto sm:px-8" disabled={!token || busy || !hasGas} onClick={claim}>
            {busy ? "Claiming…" : `Claim${amountLabel} demo USD`}
          </Button>
          {!hasGas ? <p className="text-xs text-no">Get gas first (step 1): the claim is a transaction.</p> : null}
        </>
      )}
      {error ? <p className="text-sm text-no">{error}</p> : null}
      <p className="text-xs text-ink-3">One claim per wallet every 24 hours, limited onchain.</p>
    </div>
  );
}
