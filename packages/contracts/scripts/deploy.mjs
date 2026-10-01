// One-command contract deploy (docs/runbook.md "Deploy the contracts"). Reads the root .env:
//   RPC_URL, DEPLOYER_PRIVATE_KEY, CREATOR_ADDRESS, RESOLVER_ADDRESS, FAUCET_SIGNER_ADDRESS,
//   ADMIN_ADDRESS / ARBITER_ADDRESS (optional; default to the deployer — use a multisig before mainnet).
//
//   pnpm --filter @stampd/contracts deploy:chain            # simulate only
//   pnpm --filter @stampd/contracts deploy:chain --broadcast [--smoke] [--verify]
//   pnpm --filter @stampd/contracts deploy:chain --broadcast --resume   # finish a broadcast that was cut off
//   add --env ../../.env.mainnet to use the mainnet keys and RPC instead of the root .env
//
// With --broadcast: deploys and wires roles, writes deployments/<chainId>.json, exports ABIs and
// addresses to packages/chain, and sends the creator and resolver keys gas money from the deployer.
// --smoke also opens a throwaway market and buys once (a real trade on the explorer).
// --verify submits the sources to Blockscout afterwards; a verification failure doesn't undo the deploy.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
// --env <file> picks the env file (e.g. ../../.env.mainnet); default is the root .env (testnet).
const argv = process.argv.slice(2);
const envArg = argv.indexOf("--env");
const envFile = envArg >= 0 ? join(process.cwd(), argv[envArg + 1] ?? "") : join(pkg, "..", "..", ".env");
if (envArg >= 0 && !existsSync(envFile)) {
  console.error(`env file not found: ${envFile}`);
  process.exit(1);
}
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = new Set(argv);
const broadcast = args.has("--broadcast");
const env = process.env;
const GAS_TOPUP_ETH = env.GAS_TOPUP_ETH ?? "0.005";
const VERIFIER = {
  46630: "https://explorer.testnet.chain.robinhood.com/api/",
  4663: "https://robinhoodchain.blockscout.com/api/",
};

const need = (k) => {
  if (!env[k]) {
    console.error(`missing ${k} in .env`);
    process.exit(1);
  }
  return env[k];
};
const rpc = need("RPC_URL");
need("DEPLOYER_PRIVATE_KEY");
for (const k of ["CREATOR_ADDRESS", "RESOLVER_ADDRESS", "FAUCET_SIGNER_ADDRESS"]) need(k);

const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { cwd: pkg, stdio: "inherit", env, ...opts });
const out = (cmd, argv) => execFileSync(cmd, argv, { cwd: pkg, env, encoding: "utf8" }).trim();

const chainId = Number(out("cast", ["chain-id", "--rpc-url", rpc]));
const deployer = out("cast", ["wallet", "address", "--private-key", env.DEPLOYER_PRIVATE_KEY]);
const balance = out("cast", ["balance", deployer, "--rpc-url", rpc, "--ether"]);
console.log(`chain ${chainId} · deployer ${deployer} · balance ${balance} ETH`);
if (chainId === 4663 && !env.ADMIN_ADDRESS) {
  console.error("mainnet needs ADMIN_ADDRESS and ARBITER_ADDRESS set to the multisig");
  process.exit(1);
}

const script = ["script", "script/Deploy.s.sol", "--rpc-url", rpc];
if (!broadcast) {
  run("forge", script);
  console.log("\nsimulation only — rerun with --broadcast to deploy");
  process.exit(0);
}
if (Number(balance) === 0) {
  console.error(`deployer has no ETH — fund ${deployer} first`);
  process.exit(1);
}

// --resume continues a cut-off broadcast from broadcast/…/run-latest.json. Forge reuses the gas limits it
// planned, which can be too low hours later on an Arbitrum chain (the L1 data price moves); if a resumed
// transaction runs out of gas, send the remaining ones with `cast send` (fresh estimates) instead.
run("forge", [...script, "--broadcast", "--slow", ...(args.has("--resume") ? ["--resume"] : []), "--private-key", env.DEPLOYER_PRIVATE_KEY]);

// Forge writes deployments/<chainId>.json while simulating, before anything is sent, so check that every
// recorded address really holds code before exporting it to the apps.
const deployment = JSON.parse(readFileSync(join(pkg, "deployments", `${chainId}.json`), "utf8"));
for (const [name, address] of Object.entries(deployment.contracts)) {
  if (out("cast", ["code", address, "--rpc-url", rpc]) === "0x") {
    console.error(`${name} has no code at ${address} — the broadcast did not finish; rerun with --resume`);
    process.exit(1);
  }
}
run("node", ["scripts/export-abis.mjs"]);

for (const k of ["CREATOR_ADDRESS", "RESOLVER_ADDRESS"]) {
  const has = Number(out("cast", ["balance", env[k], "--rpc-url", rpc, "--ether"]));
  if (has >= Number(GAS_TOPUP_ETH) / 2) continue;
  console.log(`sending ${GAS_TOPUP_ETH} ETH gas money to ${k.replace("_ADDRESS", "").toLowerCase()} ${env[k]}`);
  run("cast", ["send", env[k], "--value", `${GAS_TOPUP_ETH}ether`, "--rpc-url", rpc, "--private-key", env.DEPLOYER_PRIVATE_KEY]);
}

if (args.has("--smoke")) {
  need("CREATOR_PRIVATE_KEY");
  run("forge", ["script", "script/Smoke.s.sol", "--rpc-url", rpc, "--broadcast", "--private-key", env.CREATOR_PRIVATE_KEY]);
}

if (args.has("--verify") && VERIFIER[chainId]) {
  try {
    run("forge", [...script, "--resume", "--verify", "--verifier", "blockscout", "--verifier-url", VERIFIER[chainId], "--private-key", env.DEPLOYER_PRIVATE_KEY]);
  } catch {
    console.warn("verification failed — the contracts are deployed; retry with --verify later");
  }
}

console.log(`\ndone. Commit packages/contracts/deployments/${chainId}.json and packages/chain/src/deployments.generated.ts.`);
