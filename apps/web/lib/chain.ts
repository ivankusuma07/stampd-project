import { http } from "wagmi";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { coinbaseWallet, injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig } from "wagmi";
import { getChain, getDeployment, hasDeployment } from "@stampd/chain";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 46630);
export const chain = getChain(CHAIN_ID);
export const deployment = hasDeployment(CHAIN_ID) ? getDeployment(CHAIN_ID) : null;

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// Plain injected wallets always; WalletConnect only when a project id is configured.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: [injectedWallet, metaMaskWallet, rabbyWallet, coinbaseWallet, ...(projectId ? [walletConnectWallet] : [])],
    },
  ],
  { appName: "STAMPD", projectId: projectId ?? "unset" },
);

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  // one chain per deployment; the record is keyed by whichever chain that is
  transports: { [chain.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) } as Record<(typeof chain)["id"], ReturnType<typeof http>>,
  ssr: true,
});
