import type { XPost, XUser } from "@stampd/core";

/** HTTP client for apps/scraper (plan B6b). The scraper is the only source of X data. */
export type ScraperHealth = {
  ok: boolean;
  activeAccounts: number;
  lockedAccounts: number;
  lastSuccessAt: string | null;
  version: string;
};

export class ScraperUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScraperUnavailable";
  }
}

export class ScraperClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
    private readonly timeoutMs = 30_000,
  ) {}

  private async get<T>(path: string): Promise<T | null> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ScraperUnavailable(`scraper unreachable: ${(err as Error).message}`);
    }
    if (res.status === 404) return null;
    if (res.status === 503 || res.status === 502) throw new ScraperUnavailable(`scraper ${res.status}: ${await res.text()}`);
    if (!res.ok) throw new Error(`scraper ${res.status} on ${path}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Newest first; only posts with id > afterId. */
  async timeline(userId: string, afterId?: string | null): Promise<XPost[]> {
    const q = afterId ? `?after_id=${encodeURIComponent(afterId)}` : "";
    return (await this.get<{ posts: XPost[] }>(`/timeline/${encodeURIComponent(userId)}${q}`))?.posts ?? [];
  }

  post(id: string): Promise<XPost | null> {
    return this.get<XPost>(`/post/${encodeURIComponent(id)}`);
  }

  user(handle: string): Promise<XUser | null> {
    return this.get<XUser>(`/user/${encodeURIComponent(handle)}`);
  }

  async health(): Promise<ScraperHealth> {
    const h = await this.get<ScraperHealth>("/health");
    if (!h) throw new ScraperUnavailable("no /health");
    return h;
  }
}

/** Compare numeric X ids (they exceed 2^53). */
export function idGreater(a: string, b: string): boolean {
  return BigInt(a) > BigInt(b);
}
