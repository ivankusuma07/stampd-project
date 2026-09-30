import type { Address } from "viem";
import { DEPLOYMENTS } from "./deployments.generated";

export type ContractName = "DemoUSD" | "OutcomeTokens" | "MarketHub" | "MarketFactory" | "Resolver";

export type Deployment = {
  chainId: number;
  deployBlock: number;
  contracts: Record<ContractName, Address>;
  roles: { admin: Address; creator: Address; resolver: Address; arbiter: Address; faucetSigner: Address };
};

export function getDeployment(chainId: number): Deployment {
  const d = DEPLOYMENTS[chainId];
  if (!d) {
    throw new Error(
      `No deployment for chain ${chainId}. Deploy with packages/contracts/script/Deploy.s.sol, then run \`pnpm --filter @stampd/contracts abis\`.`,
    );
  }
  return d;
}

export function hasDeployment(chainId: number): boolean {
  return chainId in DEPLOYMENTS;
}
