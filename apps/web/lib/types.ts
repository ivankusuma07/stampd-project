/** Response shapes of apps/api. Money and shares are decimal strings of 6-decimal units. */

export type Outcome = "YES" | "NO";
export type Result = "YES" | "NO" | "INVALID";
export type MarketStatus = "PENDING" | "OPEN" | "CLOSED" | "PROPOSED" | "DISPUTED" | "RESOLVED";

export type KolRef = { id: string; handle: string; name: string; avatarUrl: string | null };

export type KolStats = {
  live: number;
  resolved: number;
  correct: number;
  invalid: number;
  hitRate: number | null;
  avgEdge: number | null;
  edgeN: number;
};

export type Resolution = {
  proposedOutcome: Result;
  proposer: string;
  evidenceUri: string;
  evidence: unknown;
  disputeEnds: string;
  disputed: boolean;
  disputer: string | null;
  finalOutcome: Result | null;
  proposedTxHash: string;
  finalizedAt: string | null;
  finalizedTxHash: string | null;
};

export type Market = {
  id: string;
  onchainId: string | null;
  chainId: number;
  question: string;
  rules: string;
  category: string;
  kol: KolRef;
  kolSide: Outcome;
  status: MarketStatus;
  result: Result | null;
  paused: boolean;
  yesPriceBps: number;
  openingYesPriceBps: number;
  change24hBps: number | null;
  feeBps: number;
  pool: { yesReserve: string | null; noReserve: string | null };
  volume: string | null;
  tradeCount: number;
  closeTime: string;
  resolveBy: string;
  sourcePostId: string;
  sourcePostUrl: string;
  questionHash: string;
  specUri: string | null;
  spec: {
    resolution?: { source: string; subject: string; metric: string; comparator: string; threshold: string; mode: string; url: string };
  } | null;
  submittedBy: string | null;
  createTxHash: string | null;
  openedAt: string | null;
  openedBlock: string | null;
  settledAt: string | null;
  settledTxHash: string | null;
  kolSideTwap24hBps: number | null;
  resolution: Resolution | null;
};

export type Trade = {
  txHash: string;
  logIndex: number;
  wallet: string;
  outcome: Outcome;
  isBuy: boolean;
  collateral: string;
  shares: string;
  fee: string;
  priceAfterBps: number;
  blockNumber: string;
  blockTime: string;
};

export type MarketDetail = {
  market: Market;
  post: { text: string; postedAt: string; url: string; authorHandle: string } | null;
  submitter: { wallet: string; displayName: string | null } | null;
  viewer: {
    watching: boolean;
    position: { yesShares: string; noShares: string; costBasis: string; redeemedAt: string | null; payout: string | null } | null;
  } | null;
};

export type KolListItem = KolRef & { stats: KolStats | null; markets: number };

export type PortfolioPosition = {
  market: Market;
  yesShares: string;
  noShares: string;
  costBasis: string;
  realizedPnl: string;
  value: string;
  redeemable: string;
  redeemedAt: string | null;
  payout: string | null;
};

export type Notification = {
  id: string;
  type: "NEW_MARKET" | "RESOLVED" | "REDEEMABLE" | "SUBMISSION";
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

export type Submission = {
  id: string;
  xPostUrl: string;
  xPostId: string;
  status: "QUEUED" | "DRAFTED" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  market: { id: string; question: string; status: string } | null;
  question: string | null;
};

export type Callout = {
  id: string;
  side: Outcome;
  text: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
  user: { wallet: string; displayName: string | null };
  market: Market;
  replies: { id: string; text: string; side: Outcome; user: { wallet: string; displayName: string | null }; createdAt: string }[];
};

export type Me = {
  wallet: string | null;
  isAdmin: boolean;
  user: { displayName: string | null; points: number; captchaVerified: boolean } | null;
};

export type Insights = {
  markets: number;
  byStatus: Record<string, number>;
  resolved: number;
  results: { YES: number; NO: number; INVALID: number };
  byCategory: { category: string; markets: number }[];
  trades: number;
  traders: number;
  trackedKols: number;
};

export type Status = {
  chainId: number;
  ingest: { paused: boolean; reason: string | null; lastSuccessAt: string | null };
  indexer: { block: string | null };
  /** absent on an API older than the faucet step layout */
  faucet?: { claimUsd: number };
};
