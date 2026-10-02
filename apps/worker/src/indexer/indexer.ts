import type { PublicClient } from "viem";
import type { Deployment } from "@stampd/chain";
import type { Prisma, PrismaClient } from "@stampd/db";
import { contractAbis, decodeLogs, indexedAddresses, type EventArgs } from "./events";
import { applyEvent, linkCreatedMarkets, resetMarkets, type Effect, type StoredEvent } from "./project";

export type IndexerOptions = {
  db: PrismaClient;
  chain: PublicClient;
  deployment: Deployment;
  confirmations: number;
  batchBlocks: number;
  /** called after each committed batch with the side effects it produced */
  onEffects?: (effects: Effect[]) => Promise<void>;
  onBlock?: (block: bigint) => Promise<void>;
};

/** Keep this many recent block hashes for reorg detection. */
const KEEP_BLOCK_HASHES = 5_000n;

/**
 * Event indexer (development plan 2.1): persisted cursor, N confirmations, reorg handling by
 * rewinding to the last block whose hash still matches, idempotent on (txHash, logIndex).
 */
export class Indexer {
  private readonly cursorId: string;
  private readonly abis;
  private readonly addresses;

  constructor(private readonly o: IndexerOptions) {
    this.cursorId = `${o.deployment.chainId}:main`;
    this.abis = contractAbis(o.deployment);
    this.addresses = indexedAddresses(o.deployment);
  }

  private async cursor() {
    return (
      (await this.o.db.indexerCursor.findUnique({ where: { id: this.cursorId } })) ??
      (await this.o.db.indexerCursor.create({
        data: { id: this.cursorId, blockNumber: BigInt(Math.max(0, this.o.deployment.deployBlock - 1)), blockHash: "" },
      }))
    );
  }

  /** Index one batch. Returns the range indexed, or null when already at the safe head. */
  async tick(): Promise<{ from: bigint; to: bigint; events: number; reorg?: true } | null> {
    const { db, chain } = this.o;
    const cursor = await this.cursor();

    if (cursor.blockHash) {
      // An RPC failure is NOT a reorg: let it throw so the job retries next tick. Treating a failed or
      // rate-limited lookup as a mismatch rewound mainnet to the deploy block and wiped the index
      // (7 times on 1 Oct 2026). Only a block that comes back with a different hash is a reorg.
      const current = await chain.getBlock({ blockNumber: cursor.blockNumber });
      if (current.hash !== cursor.blockHash) {
        const fork = await this.rewind(cursor.blockNumber);
        return { from: fork, to: fork, events: 0, reorg: true };
      }
    }

    const head = await chain.getBlockNumber({ cacheTime: 0 });
    const safe = head - BigInt(this.o.confirmations);
    if (safe <= cursor.blockNumber) return null;
    const from = cursor.blockNumber + 1n;
    const to = safe < from + BigInt(this.o.batchBlocks) - 1n ? safe : from + BigInt(this.o.batchBlocks) - 1n;

    const logs = await chain.getLogs({ address: this.addresses, fromBlock: from, toBlock: to });
    const decoded = decodeLogs(logs, this.abis);

    const blockNumbers = [...new Set([...decoded.map((d) => d.blockNumber), to])];
    const blocks = new Map<bigint, { hash: string; time: Date }>();
    for (const bn of blockNumbers) {
      const b = await chain.getBlock({ blockNumber: bn });
      blocks.set(bn, { hash: b.hash, time: new Date(Number(b.timestamp) * 1000) });
    }

    const effects: Effect[] = [];
    await db.$transaction(
      async (tx) => {
        const stored: StoredEvent[] = [];
        for (const d of decoded) {
          const blockTime = blocks.get(d.blockNumber)!.time;
          const inserted = await tx.chainEvent.createMany({
            data: [
              {
                chainId: this.o.deployment.chainId,
                blockNumber: d.blockNumber,
                blockHash: d.blockHash,
                blockTime,
                txHash: d.txHash,
                logIndex: d.logIndex,
                address: d.address,
                name: d.name,
                marketId: d.marketId,
                args: d.args as Prisma.InputJsonValue,
              },
            ],
            skipDuplicates: true,
          });
          // already stored → already projected (idempotent re-run of the same range)
          if (inserted.count === 1) stored.push({ ...d, blockTime });
        }
        await linkCreatedMarkets(tx, this.o.deployment.chainId, stored, effects);
        for (const e of stored) await applyEvent(tx, e, effects);

        for (const bn of blockNumbers) {
          await tx.indexedBlock.upsert({
            where: { chainId_blockNumber: { chainId: this.o.deployment.chainId, blockNumber: bn } },
            update: { blockHash: blocks.get(bn)!.hash },
            create: { chainId: this.o.deployment.chainId, blockNumber: bn, blockHash: blocks.get(bn)!.hash },
          });
        }
        await tx.indexedBlock.deleteMany({
          where: { chainId: this.o.deployment.chainId, blockNumber: { lt: to - KEEP_BLOCK_HASHES } },
        });
        await tx.indexerCursor.update({ where: { id: this.cursorId }, data: { blockNumber: to, blockHash: blocks.get(to)!.hash } });
      },
      { timeout: 120_000, maxWait: 30_000 },
    );

    await this.o.onEffects?.(effects);
    await this.o.onBlock?.(to);
    return { from, to, events: decoded.length };
  }

  /** Tick until the safe head is reached. */
  async runUntilHead(maxBatches = 10_000): Promise<number> {
    let batches = 0;
    while (batches < maxBatches && (await this.tick()) !== null) batches++;
    return batches;
  }

  /**
   * A block we indexed is no longer canonical: find the newest stored block whose hash still
   * matches, drop every event after it and rebuild the markets those events touched.
   */
  private async rewind(fromBlock: bigint): Promise<bigint> {
    const { db, chain, deployment } = this.o;
    const stored = await db.indexedBlock.findMany({
      where: { chainId: deployment.chainId, blockNumber: { lte: fromBlock } },
      orderBy: { blockNumber: "desc" },
      take: 500,
    });
    let fork = BigInt(Math.max(0, deployment.deployBlock - 1));
    let forkHash = "";
    for (const b of stored) {
      // throws on RPC failure, which aborts the rewind before anything is deleted
      const current = await chain.getBlock({ blockNumber: b.blockNumber });
      if (current.hash === b.blockHash) {
        fork = b.blockNumber;
        forkHash = b.blockHash;
        break;
      }
    }

    const effects: Effect[] = [
      { kind: "alert", alert: "indexer.reorg", message: `Reorg detected at block ${fromBlock}; rewound to ${fork}` },
    ];
    await db.$transaction(
      async (tx) => {
        const touched = await tx.chainEvent.findMany({
          where: { chainId: deployment.chainId, blockNumber: { gt: fork } },
          select: { marketId: true, name: true, args: true },
        });
        await tx.chainEvent.deleteMany({ where: { chainId: deployment.chainId, blockNumber: { gt: fork } } });
        await tx.indexedBlock.deleteMany({ where: { chainId: deployment.chainId, blockNumber: { gt: fork } } });
        const ids = new Set<bigint>();
        for (const t of touched) {
          if (t.marketId !== null) ids.add(t.marketId);
          if (t.name === "TransferBatch") for (const id of (t.args as EventArgs).ids as string[]) ids.add(BigInt(id) >> 1n);
        }
        await rebuildMarkets(tx, [...ids]);
        await tx.indexerCursor.update({ where: { id: this.cursorId }, data: { blockNumber: fork, blockHash: forkHash } });
      },
      { timeout: 300_000, maxWait: 30_000 },
    );
    await this.o.onEffects?.(effects);
    return fork;
  }

  /** `indexer:backfill`: drop every indexed row for this chain and re-index from the deploy block. */
  async backfill(): Promise<number> {
    const { db, deployment } = this.o;
    await db.$transaction(
      async (tx) => {
        const markets = await tx.market.findMany({ where: { chainId: deployment.chainId }, select: { id: true } });
        await resetMarkets(
          tx,
          markets.map((m) => m.id),
        );
        await tx.chainEvent.deleteMany({ where: { chainId: deployment.chainId } });
        await tx.indexedBlock.deleteMany({ where: { chainId: deployment.chainId } });
        await tx.indexerCursor.deleteMany({ where: { id: this.cursorId } });
      },
      { timeout: 300_000 },
    );
    const quiet = this.o.onEffects;
    this.o.onEffects = async (effects) => quiet?.(effects.filter((e) => e.kind === "alert")); // no re-notifying users
    try {
      return await this.runUntilHead();
    } finally {
      this.o.onEffects = quiet;
    }
  }
}

/** Replay the stored events of the given onchain markets onto freshly reset projections. */
export async function rebuildMarkets(tx: Prisma.TransactionClient, onchainIds: bigint[]) {
  if (onchainIds.length === 0) return;
  const rows = await tx.market.findMany({ where: { onchainId: { in: onchainIds } }, select: { id: true } });
  await resetMarkets(
    tx,
    rows.map((r) => r.id),
  );
  const events = await tx.chainEvent.findMany({
    where: { OR: [{ marketId: { in: onchainIds } }, { name: "TransferBatch", marketId: null }] },
    orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
  });
  const ignored: Effect[] = []; // a rebuild never re-notifies
  for (const e of events) {
    if (e.name === "MarketCreated") {
      await linkCreatedMarkets(tx, e.chainId, [{ ...e, args: e.args as EventArgs }], ignored);
    }
  }
  const only = new Set(onchainIds);
  for (const e of events) await applyEvent(tx, { ...e, args: e.args as EventArgs }, ignored, only);
}
