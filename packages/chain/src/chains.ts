import { defineChain } from "viem";
import { anvil } from "viem/chains";

/** Robinhood Chain (Arbitrum L2). Values from docs.robinhood.com/chain/connecting — plan file B1. */
export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com", apiUrl: "https://robinhoodchain.blockscout.com/api" },
  },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.chain.robinhood.com",
      apiUrl: "https://explorer.testnet.chain.robinhood.com/api",
    },
  },
  testnet: true,
});

export const localChain = anvil;

export const SUPPORTED_CHAINS = [robinhoodMainnet, robinhoodTestnet, localChain] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

export function getChain(chainId: number) {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!chain) throw new Error(`Unsupported chain id ${chainId}`);
  return chain;
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  const url = getChain(chainId).blockExplorers?.default.url;
  return url ? `${url}/tx/${hash}` : null;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const url = getChain(chainId).blockExplorers?.default.url;
  return url ? `${url}/address/${address}` : null;
}
