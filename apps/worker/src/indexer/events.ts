import { decodeEventLog, type Abi, type Address, type Log } from "viem";
import { marketFactoryAbi, marketHubAbi, outcomeTokensAbi, resolverAbi, type Deployment } from "@stampd/chain";

/** The events the read model is built from (plan B5 "Events drive the indexer"). */
export const INDEXED_EVENTS = [
  "MarketCreated",
  "MarketOpened",
  "Trade",
  "Redeemed",
  "MarketSettled",
  "MarketPaused",
  "OutcomeProposed",
  "Disputed",
  "Arbitrated",
  "Resolved",
  "TransferSingle",
  "TransferBatch",
] as const;
export type IndexedEventName = (typeof INDEXED_EVENTS)[number];

/** JSON-safe args: bigints become decimal strings. */
export type EventArgs = Record<string, string | number | boolean | string[]>;

export type DecodedEvent = {
  blockNumber: bigint;
  blockHash: string;
  txHash: string;
  logIndex: number;
  address: string;
  name: IndexedEventName;
  marketId: bigint | null;
  args: EventArgs;
};

export function contractAbis(d: Deployment): Map<string, Abi> {
  return new Map<string, Abi>([
    [d.contracts.MarketFactory.toLowerCase(), marketFactoryAbi],
    [d.contracts.MarketHub.toLowerCase(), marketHubAbi],
    [d.contracts.Resolver.toLowerCase(), resolverAbi],
    [d.contracts.OutcomeTokens.toLowerCase(), outcomeTokensAbi],
  ]);
}

export function indexedAddresses(d: Deployment): Address[] {
  return [d.contracts.MarketFactory, d.contracts.MarketHub, d.contracts.Resolver, d.contracts.OutcomeTokens];
}

function jsonArgs(args: Record<string, unknown>): EventArgs {
  const out: EventArgs = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "bigint") out[k] = v.toString();
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === "bigint" ? x.toString() : String(x)));
    else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

/** Market id of an event; ERC-1155 transfers derive it from the token id (id >> 1). */
function marketIdOf(name: IndexedEventName, args: EventArgs): bigint | null {
  if (name === "TransferSingle") return BigInt(args.id as string) >> 1n;
  if (name === "TransferBatch") {
    const ids = (args.ids as string[]).map((i) => BigInt(i) >> 1n);
    return ids.every((i) => i === ids[0]) ? (ids[0] ?? null) : null;
  }
  return "marketId" in args ? BigInt(args.marketId as string) : null;
}

export function decodeLogs(logs: Log[], abis: Map<string, Abi>): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  for (const log of logs) {
    const abi = abis.get(log.address.toLowerCase());
    if (!abi || log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue;
    let decoded: { eventName: string; args: unknown };
    try {
      decoded = decodeEventLog({ abi, data: log.data, topics: log.topics }) as { eventName: string; args: unknown };
    } catch {
      continue; // an event we don't index (role changes etc.)
    }
    if (!(INDEXED_EVENTS as readonly string[]).includes(decoded.eventName)) continue;
    const name = decoded.eventName as IndexedEventName;
    const args = jsonArgs(decoded.args as Record<string, unknown>);
    out.push({
      blockNumber: log.blockNumber,
      blockHash: log.blockHash!,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      address: log.address.toLowerCase(),
      name,
      marketId: marketIdOf(name, args),
      args,
    });
  }
  return out.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
}
