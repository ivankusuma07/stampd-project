import { createPublicClient, createWalletClient, fallback, http, type Hex, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChain } from "./chains";

/**
 * RPC transport with an optional backup provider (plan R19: at least two RPC providers).
 * Falls back to the chain's public RPC when no URL is given.
 */
export function rpcTransport(chainId: number, urls: (string | undefined)[] = []): Transport {
  const list = urls.filter((u): u is string => !!u);
  if (list.length === 0) return http(getChain(chainId).rpcUrls.default.http[0]);
  if (list.length === 1) return http(list[0]);
  return fallback(list.map((u) => http(u)), { rank: false, retryCount: 2 });
}

export function publicClientFor(chainId: number, urls: (string | undefined)[] = []) {
  return createPublicClient({ chain: getChain(chainId), transport: rpcTransport(chainId, urls) });
}

export function walletClientFor(chainId: number, privateKey: Hex, urls: (string | undefined)[] = []) {
  return createWalletClient({
    chain: getChain(chainId),
    transport: rpcTransport(chainId, urls),
    account: privateKeyToAccount(privateKey),
  });
}
