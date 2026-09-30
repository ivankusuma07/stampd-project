import { canonicalJson } from "@stampd/core";

/**
 * Pin JSON to IPFS via Pinata when IPFS_PIN_TOKEN is set. Without it the document is embedded
 * as a `data:` URI, which is still verifiable against the onchain hash, just not on IPFS.
 */
export async function pinJson(token: string | undefined, name: string, doc: unknown): Promise<string> {
  const body = canonicalJson(doc);
  if (!token) return `data:application/json;base64,${Buffer.from(body).toString("base64")}`;
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pinataContent: JSON.parse(body), pinataMetadata: { name } }),
  });
  if (!res.ok) throw new Error(`IPFS pin failed: ${res.status} ${await res.text()}`);
  const { IpfsHash } = (await res.json()) as { IpfsHash: string };
  return `ipfs://${IpfsHash}`;
}

/** Read back a document from a `data:` URI (used when indexing evidence). */
export function decodeDataUri(uri: string): unknown | null {
  const m = uri.match(/^data:application\/json;base64,(.+)$/);
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m[1]!, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
