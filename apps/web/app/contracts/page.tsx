"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { explorerAddressUrl } from "@stampd/chain";
import { formatInt } from "@stampd/core";
import { EmptyState } from "@stampd/ui";
import { chain, deployment } from "@/lib/chain";

const ROLES: Record<string, string> = {
  DemoUSD: "Demo collateral (6 decimals). Faucet claims need a signed voucher; transfers only to STAMPD contracts.",
  OutcomeTokens: "ERC-1155 YES/NO shares for every market.",
  MarketHub: "Every market's pool: buy, sell, redeem. Fee capped at 10%.",
  MarketFactory: "Opens markets. Only the creator key can call it; the rules hash is stored here.",
  Resolver: "Propose → 6h dispute window → finalize; disputes go to the arbiter multisig.",
};

type Check = "checking" | "ok" | "missing" | "error";

/**
 * Contracts (plan B8): every address, with a live check from your own browser that code exists
 * at it on the connected RPC — so you don't have to trust this page's server.
 */
export default function ContractsPage() {
  const client = usePublicClient();
  const [checks, setChecks] = useState<Record<string, Check>>({});

  useEffect(() => {
    if (!deployment || !client) return;
    for (const [name, address] of Object.entries(deployment.contracts)) {
      setChecks((c) => ({ ...c, [name]: "checking" }));
      client
        .getCode({ address })
        .then((code) => setChecks((c) => ({ ...c, [name]: code && code !== "0x" ? "ok" : "missing" })))
        .catch(() => setChecks((c) => ({ ...c, [name]: "error" })));
    }
  }, [client]);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-semibold">Contracts</h1>
      <p className="max-w-prose text-ink-2">
        STAMPD runs on {chain.name} (chain id {chain.id}). These are the only official addresses. The check column asks the
        chain from your browser whether contract code exists at each address.
      </p>
      {!deployment ? (
        <EmptyState title={`Not deployed on ${chain.name} yet`} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink text-left text-xs tracking-[0.08em] text-ink-3 uppercase">
                  <th className="py-2 font-medium">Contract</th>
                  <th className="py-2 font-medium">Address</th>
                  <th className="py-2 text-right font-medium">Bytecode check</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(deployment.contracts).map(([name, address]) => {
                  const url = explorerAddressUrl(chain.id, address);
                  const c = checks[name];
                  return (
                    <tr key={name} className="border-b border-rule align-top">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{name}</p>
                        <p className="max-w-sm text-xs text-ink-3">{ROLES[name]}</p>
                      </td>
                      <td className="py-3 pr-4 font-mono break-all">
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="underline">
                            {address}
                          </a>
                        ) : (
                          address
                        )}
                      </td>
                      <td className="py-3 text-right font-mono whitespace-nowrap">
                        {c === "ok" ? (
                          <span className="text-yes">code present</span>
                        ) : c === "missing" ? (
                          <span className="text-no">NO CODE</span>
                        ) : c === "error" ? (
                          <span className="text-ink-3">RPC unreachable</span>
                        ) : (
                          <span className="text-ink-3">checking…</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="font-mono text-sm text-ink-3">Deployed at block {formatInt(deployment.deployBlock)}.</p>
          <h2 className="font-serif text-xl font-semibold">Roles</h2>
          <dl className="grid gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-[10rem_1fr]">
            {Object.entries(deployment.roles).map(([role, address]) => (
              <div key={role} className="contents">
                <dt className="text-ink-3">{role}</dt>
                <dd className="break-all">{address}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
