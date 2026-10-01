"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useChainId, useConfig, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { demoUSDAbi, marketHubAbi, outcomeTokensAbi } from "@stampd/chain";
import {
  BPS,
  FpmmError,
  formatCents,
  formatShares,
  formatUsd,
  maxInWithSlippage,
  maxSellForShares,
  minOutWithSlippage,
  parseUsd,
  quoteBuy,
  quoteSell,
  type Pool,
  type TradeQuote,
} from "@stampd/core";
import { Button, ClickSpark, Input } from "@stampd/ui";
import { CHAIN_ID, chain, deployment } from "@/lib/chain";
import type { Market } from "@/lib/types";
import { useToasts } from "./toasts";
import { ArrowRight } from "lucide-react";

type Mode = "buy" | "sell";
type Side = "YES" | "NO";
const SLIPPAGES = [50n, 100n, 200n];
const DEADLINE_SEC = 10 * 60;

/** Friendly text for a failed transaction. */
function reason(err: unknown): string {
  const msg = (err as { shortMessage?: string; message?: string }).shortMessage ?? (err as Error).message ?? "failed";
  if (/User rejected|denied/i.test(msg)) return "Cancelled in wallet";
  if (/Slippage/.test(msg)) return "Price moved past your slippage limit. Try again.";
  if (/TradingClosed/.test(msg)) return "Trading has closed";
  if (/MarketIsPaused|EnforcedPause/.test(msg)) return "Trading is paused";
  if (/TransferRestricted/.test(msg)) return "Demo USD can only move to STAMPD contracts";
  return msg.split("\n")[0]!.slice(0, 140);
}

/**
 * Trade panel (development plan 1.6 #3, B2a Core 2). Quotes are computed locally with the exact
 * port of the contract's FPMM math against live onchain reserves, so they equal `quoteBuy` /
 * `quoteSell` to the unit (development plan 1.7, 3.5).
 */
export function TradePanel({ market }: { market: Market }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const config = useConfig();
  const qc = useQueryClient();
  const toasts = useToasts();
  const { writeContractAsync } = useWriteContract();

  const [mode, setMode] = useState<Mode>("buy");
  const [side, setSide] = useState<Side>(market.kolSide);
  const [input, setInput] = useState("");
  const [slippage, setSlippage] = useState(100n);
  const [busy, setBusy] = useState(false);
  // Which wallet confirmation a buy is waiting on, so the button can say "Step 1 of 2" / "Step 2 of 2".
  const [step, setStep] = useState<null | "approve" | "trade">(null);
  const [twoStep, setTwoStep] = useState(false);

  const onchainId = market.onchainId ? BigInt(market.onchainId) : null;
  const hub = deployment?.contracts.MarketHub;
  const usd = deployment?.contracts.DemoUSD;
  const tokens = deployment?.contracts.OutcomeTokens;
  const enabled = !!deployment && onchainId !== null;

  const live = useReadContract({
    address: hub,
    abi: marketHubAbi,
    functionName: "getMarket",
    args: onchainId !== null ? [onchainId] : undefined,
    query: { enabled, refetchInterval: 4_000 },
  });
  const balance = useReadContract({
    address: usd,
    abi: demoUSDAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: enabled && !!address, refetchInterval: 8_000 },
  });
  const allowance = useReadContract({
    address: usd,
    abi: demoUSDAbi,
    functionName: "allowance",
    args: address && hub ? [address, hub] : undefined,
    query: { enabled: enabled && !!address },
  });
  const holdings = useReadContract({
    address: tokens,
    abi: outcomeTokensAbi,
    functionName: "balanceOfBatch",
    args: address && onchainId !== null ? [[address, address], [(onchainId << 1n) | 1n, onchainId << 1n]] : undefined,
    query: { enabled: enabled && !!address, refetchInterval: 8_000 },
  });

  const pool: Pool | null = useMemo(() => {
    const m = live.data;
    if (m) return { yesReserve: m.yesReserve, noReserve: m.noReserve, feeBps: BigInt(m.feeBps) };
    if (market.pool.yesReserve && market.pool.noReserve) {
      return { yesReserve: BigInt(market.pool.yesReserve), noReserve: BigInt(market.pool.noReserve), feeBps: BigInt(market.feeBps) };
    }
    return null;
  }, [live.data, market]);

  const owned = { YES: holdings.data?.[0] ?? 0n, NO: holdings.data?.[1] ?? 0n };
  const outcome = side === "YES" ? 1 : 0;
  const amount = parseUsd(input);

  const quote = useMemo((): { q: TradeQuote; collateral: bigint } | { error: string } | null => {
    if (!pool || !amount || amount === 0n) return null;
    try {
      if (mode === "buy") return { q: quoteBuy(pool, outcome, amount), collateral: amount };
      if (amount > owned[side]) return { error: `You hold ${formatShares(owned[side])} ${side}` };
      const out = maxSellForShares(pool, outcome, amount);
      if (out === 0n) return { error: "Too small to sell" };
      return { q: quoteSell(pool, outcome, out), collateral: out };
    } catch (err) {
      if (err instanceof FpmmError) return { error: "Not enough liquidity for that size" };
      throw err;
    }
  }, [pool, amount, mode, outcome, owned, side]);

  const open = market.status === "OPEN" && new Date(market.closeTime) > new Date() && !market.paused && !live.data?.paused;
  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const insufficient = mode === "buy" && amount !== null && balance.data !== undefined && amount > balance.data;
  // A buy first needs an allowance for exactly this amount (never unlimited: wallets rightly warn
  // about unlimited spending), so the wallet asks twice whenever the current allowance is short.
  const needsApproval = mode === "buy" && amount !== null && amount > 0n && (allowance.data ?? 0n) < amount;

  async function run(label: string, send: () => Promise<`0x${string}`>) {
    const id = toasts.push({ title: `${label}…`, description: "Confirm in your wallet", tone: "info" });
    try {
      const hash = await send();
      toasts.update(id, { title: `${label} submitted`, description: "Waiting for confirmation", hash });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      toasts.update(id, { title: `${label} confirmed`, description: undefined, tone: "ok", hash });
      return true;
    } catch (err) {
      toasts.update(id, { title: `${label} failed`, description: reason(err), tone: "error" });
      return false;
    }
  }

  async function submit() {
    if (!quote || "error" in quote || !hub || !usd || onchainId === null || !amount) return;
    setBusy(true);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);
    try {
      if (mode === "buy") {
        const approving = (allowance.data ?? 0n) < amount;
        setTwoStep(approving);
        if (approving) {
          setStep("approve");
          const ok = await run(`Step 1 of 2: allow ${formatUsd(amount)} demo USD`, () =>
            writeContractAsync({ address: usd, abi: demoUSDAbi, functionName: "approve", args: [hub, amount] }),
          );
          if (!ok) return;
          await allowance.refetch();
        }
        setStep("trade");
        const minOut = minOutWithSlippage(quote.q.shares, slippage);
        await run(approving ? `Step 2 of 2: buy ${side}` : `Buy ${side}`, () =>
          writeContractAsync({ address: hub, abi: marketHubAbi, functionName: "buy", args: [onchainId, outcome, amount, minOut, deadline] }),
        );
      } else {
        const maxIn = maxInWithSlippage(quote.q.shares, slippage);
        await run(`Sell ${side}`, () =>
          writeContractAsync({
            address: hub,
            abi: marketHubAbi,
            functionName: "sell",
            args: [onchainId, outcome, quote.collateral, maxIn > owned[side] ? owned[side] : maxIn, deadline],
          }),
        );
      }
      setInput("");
      await Promise.all([live.refetch(), balance.refetch(), holdings.refetch()]);
      await qc.invalidateQueries({ queryKey: ["market", market.id] });
    } finally {
      setBusy(false);
      setStep(null);
      setTwoStep(false);
    }
  }

  if (!deployment || onchainId === null) {
    return <PanelNote>Trading opens once this market is live on {chain.name}.</PanelNote>;
  }

  const yesBps = pool ? Number((pool.noReserve * BPS) / (pool.yesReserve + pool.noReserve)) : market.yesPriceBps;
  const sideBps = side === "YES" ? yesBps : 10_000 - yesBps;

  return (
    <section aria-label="Trade" className="glow overflow-hidden rounded-3xl border border-brand/25 bg-surface/90 backdrop-blur">
      <div role="tablist" aria-label="Buy or sell" className="m-3 grid grid-cols-2 rounded-full bg-surface-2 p-1 text-sm">
        {(["buy", "sell"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full py-2 capitalize transition ${mode === m ? "bg-brand font-semibold text-brand-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="space-y-4 px-5 pt-2 pb-5">
        <div role="radiogroup" aria-label="Outcome" className="grid grid-cols-2 gap-2">
          {(["YES", "NO"] as const).map((s) => {
            const bps = s === "YES" ? yesBps : 10_000 - yesBps;
            const active = side === s;
            return (
              <button
                key={s}
                role="radio"
                aria-checked={active}
                onClick={() => setSide(s)}
                className={`flex h-14 items-center justify-between rounded-2xl border px-4 font-mono transition ${
                  active
                    ? s === "YES"
                      ? "glow-yes border-yes bg-yes-bg text-yes"
                      : "glow-no border-no bg-no-bg text-no"
                    : "border-rule-strong text-ink-2 hover:border-ink-3"
                }`}
              >
                <span className="text-xs font-bold tracking-[0.2em]">{s}</span>
                <span className="text-xl">{formatCents(bps)}</span>
              </button>
            );
          })}
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs text-ink-3">
            <label htmlFor="trade-amount">{mode === "buy" ? "Amount (demo USD)" : `Shares of ${side} to sell`}</label>
            {address ? (
              <button
                type="button"
                className="font-mono underline"
                onClick={() => {
                  const max = mode === "buy" ? (balance.data ?? 0n) : owned[side];
                  setInput(formatShares(max, 6).replace(/,/g, ""));
                }}
              >
                {mode === "buy" ? `Balance ${formatUsd(balance.data ?? 0n)}` : `You hold ${formatShares(owned[side])}`}
              </button>
            ) : null}
          </div>
          <Input
            id="trade-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^\d.,]/g, ""))}
            className="h-14 rounded-2xl font-mono text-xl"
            aria-invalid={input !== "" && amount === null}
          />
        </div>

        <dl className="space-y-1.5 rounded-2xl border border-rule bg-surface-2/60 p-4 font-mono text-sm" aria-live="polite">
          {quote && "q" in quote ? (
            <>
              <Row label={mode === "buy" ? "Shares" : "You receive"} raw={(mode === "buy" ? quote.q.shares : quote.collateral).toString()}>
                {mode === "buy" ? formatShares(quote.q.shares) : formatUsd(quote.collateral)}
              </Row>
              <Row label="Avg price">{formatCents(quote.q.avgPriceBps)}</Row>
              <Row label="Price impact">
                <span className="inline-flex items-center gap-1">
                  {formatCents(sideBps)} <ArrowRight size={12} aria-label="to" /> {formatCents(quote.q.sidePriceAfterBps)}
                </span>
              </Row>
              <Row label="Fee" raw={quote.q.fee.toString()}>
                {formatUsd(quote.q.fee)}
              </Row>
              {mode === "buy" ? <Row label="Pays if right">{formatUsd(quote.q.shares)}</Row> : null}
            </>
          ) : quote && "error" in quote ? (
            <p className="text-no">{quote.error}</p>
          ) : (
            <p className="text-ink-3">Enter an amount to see shares, average price, impact and fee.</p>
          )}
        </dl>

        <div className="flex items-center justify-between text-xs text-ink-3">
          <span>Slippage</span>
          <div className="flex gap-1">
            {SLIPPAGES.map((s) => (
              <button
                key={String(s)}
                onClick={() => setSlippage(s)}
                aria-pressed={slippage === s}
                className={`rounded-full border px-2.5 py-0.5 font-mono ${slippage === s ? "border-brand/60 text-accent" : "border-rule text-ink-3"}`}
              >
                {Number(s) / 100}%
              </button>
            ))}
          </div>
        </div>

        {!isConnected ? (
          <div className="flex justify-center">
            <ConnectButton label="Connect wallet to trade" />
          </div>
        ) : wrongChain ? (
          <Button className="w-full" onClick={() => switchChain({ chainId: CHAIN_ID })}>
            Switch to {chain.name}
          </Button>
        ) : !open ? (
          <PanelNote>{market.paused || live.data?.paused ? "Trading is paused on this market." : "Trading has closed."}</PanelNote>
        ) : (
          <ClickSpark sparkColor={side === "YES" ? "#2be59a" : "#ff5a7a"} sparkCount={10} sparkRadius={22}>
            <Button
              className="h-13 w-full text-base"
              variant={side === "YES" ? "yes" : "no"}
              disabled={busy || !quote || "error" in quote || insufficient}
              onClick={submit}
            >
              {busy
                ? step === "approve"
                  ? "Step 1 of 2: allow in your wallet…"
                  : twoStep
                    ? "Step 2 of 2: confirm the buy…"
                    : "Waiting for wallet…"
                : insufficient
                  ? "Not enough demo USD"
                  : `${mode === "buy" ? "Buy" : "Sell"} ${side}${needsApproval ? " · 2 steps" : ""}`}
            </Button>
          </ClickSpark>
        )}
        {isConnected && !wrongChain && open && needsApproval && !insufficient && amount ? (
          <p className="text-center text-xs text-ink-2">
            Your wallet asks twice: first to allow exactly {formatUsd(amount)} demo USD for this trade, then to buy.
          </p>
        ) : null}
        {isConnected && !wrongChain && (balance.data ?? 0n) === 0n && mode === "buy" ? (
          <p className="text-center text-xs text-ink-2">
            No demo USD yet? <a href="/faucet" className="text-accent hover:underline">Get some from the faucet</a>.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** `raw` carries the exact 6-decimal value, so tests can compare the quote with the contract to the unit. */
function Row({ label, raw, children }: { label: string; raw?: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right text-ink" data-raw={raw}>
        {children}
      </dd>
    </div>
  );
}

function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-rule-strong px-4 py-4 text-center text-sm text-ink-2">{children}</p>;
}
