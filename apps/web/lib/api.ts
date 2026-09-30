/**
 * API access. Server components call the API directly (API_URL); the browser goes through the
 * /api rewrite so the session cookie stays first-party.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(body.error ?? res.statusText), body);
  return body as T;
}

/** Server-side fetch of public data. Returns null when the API is unreachable or 404s. */
export async function serverGet<T>(path: string, revalidate = 15): Promise<T | null> {
  const base = process.env.API_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}${path}`, { next: { revalidate } });
    if (res.status === 404) return null;
    return await parse<T>(res);
  } catch {
    return null;
  }
}

/** Browser fetch through /api. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  return parse<T>(res);
}
