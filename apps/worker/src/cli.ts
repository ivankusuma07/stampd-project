// Operator commands:
//   pnpm --filter @stampd/worker indexer:backfill   drop indexed rows and re-index from the deploy block
//   pnpm --filter @stampd/worker indexer:reconcile  compare chain and database once
import { getDb } from "@stampd/db";
import { getDeployment, publicClientFor } from "@stampd/chain";
import { Indexer } from "./indexer/indexer";
import { reconcile } from "./indexer/maintenance";

const command = process.argv[2];
const chainId = Number(process.env.CHAIN_ID ?? 46630);
const db = getDb();
const chain = publicClientFor(chainId, [process.env.RPC_URL, process.env.RPC_URL_BACKUP]);
const deployment = getDeployment(chainId);
const indexer = new Indexer({
  db,
  chain,
  deployment,
  confirmations: Number(process.env.INDEXER_CONFIRMATIONS ?? 2),
  batchBlocks: Number(process.env.INDEXER_BATCH_BLOCKS ?? 2000),
  onEffects: async (effects) => {
    for (const e of effects) if (e.kind === "alert") console.warn(`[alert] ${e.alert}: ${e.message}`);
  },
});

if (command === "backfill") {
  const batches = await indexer.backfill();
  console.log(`re-indexed from block ${deployment.deployBlock} in ${batches} batches`);
} else if (command === "reconcile") {
  const mismatches = await reconcile(db, chain, deployment, async (kind, message) => console.warn(`[${kind}] ${message}`));
  console.log(mismatches.length === 0 ? "chain and database agree" : JSON.stringify(mismatches, null, 2));
} else {
  console.error("usage: cli.ts backfill | reconcile");
  process.exitCode = 1;
}
await db.$disconnect();
