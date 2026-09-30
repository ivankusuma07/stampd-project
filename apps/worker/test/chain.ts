import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import {
  demoUSDAbi,
  marketFactoryAbi,
  marketHubAbi,
  outcomeTokensAbi,
  resolverAbi,
  type Deployment,
} from "@stampd/chain";

/** Anvil's well-known dev keys. */
export const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
] as const;
export const K = { admin: KEYS[0], creator: KEYS[1], resolverBot: KEYS[2], alice: KEYS[3], bob: KEYS[4] } as const;
export const admin = privateKeyToAccount(K.admin);
export const creator = privateKeyToAccount(K.creator);
export const resolverBot = privateKeyToAccount(K.resolverBot);
export const alice = privateKeyToAccount(K.alice);
export const bob = privateKeyToAccount(K.bob);

export function anvilPath(): string | null {
  const candidates = [join(homedir(), ".foundry", "bin", process.platform === "win32" ? "anvil.exe" : "anvil"), "anvil"];
  return candidates.find((c) => c === "anvil" || existsSync(c)) ?? null;
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

export async function startAnvil() {
  const port = await freePort();
  const proc: ChildProcess = spawn(anvilPath()!, ["--port", String(port), "--silent"], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  const chain: PublicClient = createPublicClient({ chain: anvil, transport: http(url) });
  for (let i = 0; i < 100; i++) {
    try {
      await chain.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const test = createTestClient({ chain: anvil, mode: "anvil", transport: http(url) });
  const wallet = (key: Hex) => createWalletClient({ chain: anvil, transport: http(url), account: privateKeyToAccount(key) });
  return { url, chain, test, wallet, stop: () => proc.kill() };
}
export type Anvil = Awaited<ReturnType<typeof startAnvil>>;

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const path = join(__dirname, "..", "..", "..", "packages", "contracts", "out", `${name}.sol`, `${name}.json`);
  const j = JSON.parse(readFileSync(path, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

/** Deploy and wire the full contract set, like script/Deploy.s.sol. */
export async function deployStack(a: Anvil): Promise<Deployment> {
  const w = a.wallet(KEYS[0]);
  const deployBlock = Number(await a.chain.getBlockNumber()) + 1;
  const deploy = async (name: string, args: unknown[]) => {
    const { abi, bytecode } = artifact(name);
    const hash = await w.deployContract({ abi, bytecode, args });
    return (await a.chain.waitForTransactionReceipt({ hash })).contractAddress as Address;
  };
  const USD = 1_000_000n;
  const usd = await deploy("DemoUSD", [admin.address, 1_000n * USD, 86_400n]);
  const tokens = await deploy("OutcomeTokens", [admin.address, "uri"]);
  const hub = await deploy("MarketHub", [admin.address, usd, tokens, 1000]);
  const factory = await deploy("MarketFactory", [admin.address, hub, 10n * USD, 10_000n * USD]);
  const resolver = await deploy("Resolver", [admin.address, hub, 50n * USD, 21_600n]);

  const send = async (address: Address, abi: Abi, functionName: string, args: unknown[], key: Hex = KEYS[0]) => {
    const hash = await a.wallet(key).writeContract({ address, abi, functionName, args } as never);
    await a.chain.waitForTransactionReceipt({ hash });
  };
  const role = async (address: Address, abi: Abi, roleFn: string) =>
    (await a.chain.readContract({ address, abi, functionName: roleFn })) as Hex;

  await send(tokens, outcomeTokensAbi, "grantRole", [await role(tokens, outcomeTokensAbi, "MINTER_ROLE"), hub]);
  await send(hub, marketHubAbi, "grantRole", [await role(hub, marketHubAbi, "FACTORY_ROLE"), factory]);
  await send(hub, marketHubAbi, "grantRole", [await role(hub, marketHubAbi, "RESOLVER_ROLE"), resolver]);
  await send(factory, marketFactoryAbi, "grantRole", [await role(factory, marketFactoryAbi, "CREATOR_ROLE"), creator.address]);
  await send(resolver, resolverAbi, "grantRole", [await role(resolver, resolverAbi, "RESOLVER_ROLE"), resolverBot.address]);
  await send(resolver, resolverAbi, "grantRole", [await role(resolver, resolverAbi, "ARBITER_ROLE"), admin.address]);
  await send(usd, demoUSDAbi, "grantRole", [await role(usd, demoUSDAbi, "MINTER_ROLE"), admin.address]);
  for (const p of [hub, factory, resolver]) await send(usd, demoUSDAbi, "setProtocol", [p, true]);
  for (const acct of [creator, resolverBot, alice, bob]) {
    await send(usd, demoUSDAbi, "mint", [acct.address, 100_000n * USD]);
  }
  for (const key of KEYS.slice(1)) {
    for (const spender of [hub, factory, resolver]) {
      await send(usd, demoUSDAbi, "approve", [spender, 2n ** 255n], key);
    }
  }
  return {
    chainId: 31337,
    deployBlock,
    contracts: { DemoUSD: usd, OutcomeTokens: tokens, MarketHub: hub, MarketFactory: factory, Resolver: resolver },
    roles: {
      admin: admin.address,
      creator: creator.address,
      resolver: resolverBot.address,
      arbiter: admin.address,
      faucetSigner: admin.address,
    },
  };
}
