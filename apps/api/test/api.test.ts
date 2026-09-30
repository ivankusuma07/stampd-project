import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { getDeployment } from "@stampd/chain";
import { STATUS_KEYS } from "@stampd/queue";
import { ADMIN, FAUCET_KEY, NOW, createHarness, seedMarket, type Harness } from "./helpers";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => {
  await h?.app.close();
  await h?.stop();
});
beforeEach(async () => {
  await h.reset();
  h.jobs.length = 0;
});

describe("service", () => {
  it("health and openapi", async () => {
    expect((await h.app.inject("/health")).json()).toEqual({ ok: true });
    const spec = (await h.app.inject("/openapi.json")).json();
    expect(spec.openapi).toMatch(/^3/);
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(["/markets", "/submissions", "/admin/queue"]));
  });

  it("status reads worker flags", async () => {
    await h.kv.set("status:ingest:paused", "1");
    const res = (await h.app.inject("/status")).json();
    expect(res.ingest.paused).toBe(true);
    await h.kv.set("status:ingest:paused", "0");
  });
});

describe("auth (SIWE)", () => {
  it("signs in, reads /auth/me and logs out", async () => {
    const { cookie, wallet } = await h.signIn();
    const me = (await h.app.inject({ url: "/auth/me", headers: { cookie } })).json();
    expect(me.wallet).toBe(wallet);
    expect(me.isAdmin).toBe(false);
    expect(await h.db.user.count({ where: { wallet } })).toBe(1);
  });

  it("rejects a reused nonce, a wrong domain and a forged signature", async () => {
    const account = privateKeyToAccount(FAUCET_KEY);
    const nonce = (await h.app.inject("/auth/nonce")).json().nonce;
    const base = { address: account.address, chainId: 31337, nonce, uri: "https://stampd.test", version: "1" as const, issuedAt: NOW };

    const wrongDomain = createSiweMessage({ ...base, domain: "evil.test" });
    let res = await h.app.inject({
      method: "POST",
      url: "/auth/verify",
      payload: { message: wrongDomain, signature: await account.signMessage({ message: wrongDomain }) },
    });
    expect(res.statusCode).toBe(401);

    const good = createSiweMessage({ ...base, domain: "stampd.test" });
    const forged = await ADMIN.signMessage({ message: good });
    res = await h.app.inject({ method: "POST", url: "/auth/verify", payload: { message: good, signature: forged } });
    expect(res.json().error).toBe("bad signature");

    // the nonce was consumed by the failed attempt
    res = await h.app.inject({
      method: "POST",
      url: "/auth/verify",
      payload: { message: good, signature: await account.signMessage({ message: good }) },
    });
    expect(res.json().error).toBe("unknown or used nonce");
  });

  it("protects wallet routes", async () => {
    expect((await h.app.inject("/portfolio")).statusCode).toBe(401);
    expect((await h.app.inject({ url: "/auth/me", headers: { cookie: "stampd_session=forged" } })).json().wallet).toBeNull();
  });
});

describe("markets", () => {
  it("lists open markets with the 24h change", async () => {
    const { market } = await seedMarket(h.db);
    await seedMarket(h.db, { status: "RESOLVED" });
    const res = (await h.app.inject("/markets")).json();
    expect(res.total).toBe(1);
    expect(res.markets[0].id).toBe(market.id);
    expect(res.markets[0].change24hBps).toBe(700); // 55c 24h ago -> 62c now
    expect(res.markets[0].volume).toBe("90000000");
    expect(res.markets[0].kol.handle).toBe("example_kol");

    const resolved = (await h.app.inject("/markets?status=resolved")).json();
    expect(resolved.total).toBe(1);
  });

  it("sorts by moves and trending, and filters the following feed", async () => {
    await seedMarket(h.db);
    expect((await h.app.inject("/markets?sort=moves")).json().markets).toHaveLength(1);
    expect((await h.app.inject("/markets?sort=trending")).json().markets).toHaveLength(1);
    expect((await h.app.inject("/markets?feed=following")).statusCode).toBe(401);
    const { cookie } = await h.signIn();
    expect((await h.app.inject({ url: "/markets?feed=following", headers: { cookie } })).json().markets).toHaveLength(0);
  });

  it("returns biggest moves", async () => {
    await seedMarket(h.db);
    const res = (await h.app.inject("/markets/moves")).json();
    expect(res.markets[0].change24hBps).toBe(700);
  });

  it("detail, trades, prices and holders", async () => {
    const { market } = await seedMarket(h.db);
    await h.db.position.create({ data: { wallet: "0xabc", marketId: market.id, yesShares: "90000000" } });

    const detail = (await h.app.inject(`/markets/${market.id}`)).json();
    expect(detail.market.question).toContain("BTC");
    expect(detail.viewer).toBeNull();
    expect((await h.app.inject(`/markets/${market.id}/trades`)).json().trades).toHaveLength(2);
    expect((await h.app.inject(`/markets/${market.id}/prices?range=1d`)).json().points).toHaveLength(1);
    const holders = (await h.app.inject(`/markets/${market.id}/holders`)).json();
    expect(holders.yes).toEqual([{ wallet: "0xabc", shares: "90000000" }]);
    expect((await h.app.inject("/markets/nope")).statusCode).toBe(404);
  });

  it("watch, flag and viewer state", async () => {
    const { market } = await seedMarket(h.db);
    const { cookie } = await h.signIn();
    expect((await h.app.inject({ method: "PUT", url: `/markets/${market.id}/watch`, headers: { cookie } })).json()).toEqual({ watching: true });
    const detail = (await h.app.inject({ url: `/markets/${market.id}`, headers: { cookie } })).json();
    expect(detail.viewer.watching).toBe(true);
    const flag = await h.app.inject({
      method: "POST",
      url: `/markets/${market.id}/flag`,
      headers: { cookie },
      payload: { reason: "rules are ambiguous" },
    });
    expect(flag.statusCode).toBe(200);
  });
});

describe("kols", () => {
  it("directory, profile and follow", async () => {
    const { kol } = await seedMarket(h.db);
    await h.db.kolStats.create({ data: { kolId: kol.id, live: 1, resolved: 4, correct: 3, hitRate: 0.75, avgEdge: 0.12, edgeN: 3 } });
    const list = (await h.app.inject("/kols")).json();
    expect(list.kols[0].stats).toMatchObject({ hitRate: 0.75, resolved: 4, edgeN: 3 });

    const { cookie } = await h.signIn();
    await h.app.inject({ method: "PUT", url: `/kols/${kol.id}/follow`, headers: { cookie } });
    const profile = (await h.app.inject({ url: "/kols/example_kol", headers: { cookie } })).json();
    expect(profile.following).toBe(true);
    expect(profile.kol.followers).toBe(1);
    expect(profile.markets).toHaveLength(1);

    const feed = (await h.app.inject({ url: "/markets?feed=following", headers: { cookie } })).json();
    expect(feed.markets).toHaveLength(1);
  });

  it("hides excluded KOLs", async () => {
    const { kol } = await seedMarket(h.db);
    await h.db.kol.update({ where: { id: kol.id }, data: { excluded: true } });
    expect((await h.app.inject("/kols/example_kol")).statusCode).toBe(404);
  });
});

describe("faucet voucher", () => {
  it("issues a voucher the contract will accept", async () => {
    const { cookie, wallet } = await h.signIn();
    const res = await h.app.inject({ method: "POST", url: "/faucet/voucher", headers: { cookie }, payload: { captchaToken: "ok" } });
    expect(res.statusCode).toBe(200);
    const v = res.json();
    const valid = await verifyTypedData({
      address: privateKeyToAccount(FAUCET_KEY).address,
      domain: { name: "STAMPD Demo USD", version: "1", chainId: 31337, verifyingContract: getDeployment(31337).contracts.DemoUSD },
      types: {
        Claim: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Claim",
      message: { to: wallet as `0x${string}`, amount: BigInt(v.amount), nonce: 3n, deadline: BigInt(v.deadline) },
      signature: v.signature,
    });
    expect(valid).toBe(true);
    expect((await h.db.user.findUnique({ where: { wallet } }))!.captchaVerifiedAt).not.toBeNull();
  });

  it("rejects a bad captcha and limits claims per network", async () => {
    const { cookie } = await h.signIn();
    expect(
      (await h.app.inject({ method: "POST", url: "/faucet/voucher", headers: { cookie }, payload: { captchaToken: "bad" } })).statusCode,
    ).toBe(400);
    for (let i = 0; i < 3; i++) {
      const s = await h.signIn();
      await h.app.inject({ method: "POST", url: "/faucet/voucher", headers: { cookie: s.cookie }, payload: { captchaToken: "ok" } });
    }
    const res = await h.app.inject({ method: "POST", url: "/faucet/voucher", headers: { cookie }, payload: { captchaToken: "ok" } });
    expect(res.statusCode).toBe(429);
  });
});

describe("submissions (/submit)", () => {
  const url = "https://x.com/example_kol/status/1873000000000000999";

  it("queues a valid link and enqueues the fetch", async () => {
    const { cookie } = await h.signIn();
    const res = await h.app.inject({ method: "POST", url: "/submissions", headers: { cookie }, payload: { url } });
    expect(res.statusCode).toBe(201);
    expect(res.json().submission.status).toBe("QUEUED");
    expect(h.jobs).toEqual([
      { name: "ingest.post", data: { submissionId: res.json().submission.id }, opts: { jobId: `submission:${res.json().submission.id}` } },
    ]);
    const mine = (await h.app.inject({ url: "/submissions", headers: { cookie } })).json();
    expect(mine.submissions).toHaveLength(1);
  });

  it("rejects bad links, duplicates, existing markets and the 6th submission of the day", async () => {
    const { cookie } = await h.signIn();
    const post = (u: string) => h.app.inject({ method: "POST", url: "/submissions", headers: { cookie }, payload: { url: u } });
    expect((await post("https://example.com/a/status/1")).statusCode).toBe(400);
    await post(url);
    expect((await post(url)).statusCode).toBe(409);

    const { market } = await seedMarket(h.db);
    const existing = await post(`https://x.com/example_kol/status/${market.sourcePostId}`);
    expect(existing.statusCode).toBe(409);
    expect(existing.json().marketId).toBe(market.id);

    for (let i = 0; i < 4; i++) expect((await post(`https://x.com/a/status/${100 + i}`)).statusCode).toBe(201);
    expect((await post("https://x.com/a/status/999")).statusCode).toBe(429);
  });
});

describe("notifications", () => {
  it("lists, counts unread and marks read", async () => {
    const { cookie, wallet } = await h.signIn();
    await h.db.notification.createMany({
      data: [
        { userWallet: wallet, type: "NEW_MARKET", refId: "m1", title: "New market", body: "b", href: "/markets/m1" },
        { userWallet: wallet, type: "RESOLVED", refId: "m2", title: "Resolved", body: "b", href: "/markets/m2" },
      ],
    });
    let res = (await h.app.inject({ url: "/notifications", headers: { cookie } })).json();
    expect(res.unread).toBe(2);
    await h.app.inject({ method: "POST", url: "/notifications/read", headers: { cookie }, payload: { all: true } });
    res = (await h.app.inject({ url: "/notifications", headers: { cookie } })).json();
    expect(res.unread).toBe(0);
  });

  it("streams a published notification over SSE", async () => {
    const { cookie, wallet } = await h.signIn();
    const address = await h.app.listen({ port: 0, host: "127.0.0.1" });
    const ac = new AbortController();
    const res = await fetch(`${address}/notifications/stream`, { headers: { cookie }, signal: ac.signal });
    const reader = res.body!.getReader();
    await reader.read(); // retry line
    h.bus.publish(wallet, JSON.stringify({ type: "RESOLVED" }));
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("event: notification");
    ac.abort();
  });
});

describe("callouts, takedown, search, insights", () => {
  it("callouts must link to a market; like toggles; three reports hide", async () => {
    const { market } = await seedMarket(h.db);
    const a = await h.signIn();
    expect(
      (await h.app.inject({ method: "POST", url: "/callouts", headers: { cookie: a.cookie }, payload: { marketId: "nope", side: "YES", text: "hi there" } }))
        .statusCode,
    ).toBe(400);
    const created = await h.app.inject({
      method: "POST",
      url: "/callouts",
      headers: { cookie: a.cookie },
      payload: { marketId: market.id, side: "YES", text: "Funding flipped, this prints." },
    });
    const id = created.json().id;
    expect((await h.app.inject({ method: "POST", url: `/callouts/${id}/like`, headers: { cookie: a.cookie } })).json()).toEqual({ liked: true });
    expect((await h.app.inject({ method: "POST", url: `/callouts/${id}/like`, headers: { cookie: a.cookie } })).json()).toEqual({ liked: false });

    for (let i = 0; i < 3; i++) {
      const r = await h.signIn();
      await h.app.inject({ method: "POST", url: `/callouts/${id}/report`, headers: { cookie: r.cookie }, payload: { reason: "spam spam" } });
    }
    expect((await h.app.inject("/callouts")).json().callouts).toHaveLength(0);
  });

  it("takedown, search and insights", async () => {
    await seedMarket(h.db);
    const t = await h.app.inject({
      method: "POST",
      url: "/takedown",
      payload: { kolHandle: "@example_kol", name: "Example", contact: "me@example.com", reason: "Please remove my posts." },
    });
    expect(t.statusCode).toBe(201);
    const s = (await h.app.inject("/search?q=btc")).json();
    expect(s.markets).toHaveLength(1);
    expect((await h.app.inject("/search?q=@example")).json().kols).toHaveLength(1);
    const i = (await h.app.inject("/insights")).json();
    expect(i).toMatchObject({ markets: 1, trades: 2, traders: 2, trackedKols: 1 });
  });
});

describe("admin", () => {
  async function seedDraft() {
    const kol = await h.db.kol.create({ data: { xHandle: "example_kol", name: "Example" } });
    const post = await h.db.post.create({
      data: {
        xPostId: "1873000000000000001",
        kolId: kol.id,
        authorHandle: "example_kol",
        authorId: "42",
        text: "BTC will close above $90k before end of March.",
        postedAt: new Date("2026-09-29T00:00:00Z"),
        url: "https://x.com/example_kol/status/1873000000000000001",
      },
    });
    const prediction = await h.db.prediction.create({
      data: {
        postId: post.id,
        source: "WEB",
        submittedBy: "0xsub",
        status: "IN_REVIEW",
        route: "REVIEW",
        aiDecision: "AUTO_PUBLISH",
        template: "crypto-major-daily-close",
        extracted: {
          is_prediction: true,
          subject: "BTC",
          metric: "daily close",
          comparator: ">=",
          threshold: "90000",
          deadline_utc: "2027-03-31T23:59:59Z",
          resolution_source: "coinbase-daily-close",
          question: "Will BTC have a Coinbase daily close at or above $90,000 before 31 Mar 2027?",
          rules: "Resolves YES if any Coinbase BTC-USD daily close (UTC) is >= 90000 before the deadline.",
          category: "crypto",
          kol_side: "YES",
          outcome_controlled_by_kol: false,
          confidence: 0.95,
          notes: "",
        },
      },
    });
    const submission = await h.db.submission.create({
      data: { wallet: "0xsub", xPostUrl: post.url, xPostId: post.xPostId, status: "IN_REVIEW", predictionId: prediction.id },
    });
    return { prediction, submission, kol };
  }

  it("is admin-only", async () => {
    const { cookie } = await h.signIn();
    expect((await h.app.inject({ url: "/admin/queue", headers: { cookie } })).statusCode).toBe(403);
    expect((await h.app.inject({ url: "/admin/queue" })).statusCode).toBe(401);
  });

  it("approves a draft: stores the spec, enqueues creation, logs agreement", async () => {
    const { prediction, submission } = await seedDraft();
    const { cookie } = await h.signIn(ADMIN);
    const queue = (await h.app.inject({ url: "/admin/queue", headers: { cookie } })).json();
    expect(queue.items).toHaveLength(1);

    const res = await h.app.inject({
      method: "POST",
      url: `/admin/predictions/${prediction.id}/approve`,
      headers: { cookie },
      payload: { openingPriceBps: 4000, seedUsd: 300 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().questionHash).toMatch(/^0x[0-9a-f]{64}$/);
    const p = await h.db.prediction.findUnique({ where: { id: prediction.id } });
    expect(p).toMatchObject({ status: "APPROVED", humanDecision: "approve", openingPriceBps: 4000, edited: false });
    expect(p!.seedAmount!.toString()).toBe("300000000");
    expect((await h.db.submission.findUnique({ where: { id: submission.id } }))!.status).toBe("APPROVED");
    expect(h.jobs).toContainEqual({ name: "market.create", data: { predictionId: prediction.id }, opts: { jobId: `create:${prediction.id}` } });

    const agreement = (await h.app.inject({ url: "/admin/agreement", headers: { cookie } })).json();
    expect(agreement.templates["crypto-major-daily-close"]).toEqual({ n: 1, agree: 1, rate: 1 });
    expect(await h.db.adminAudit.count()).toBe(1);
  });

  it("refuses to approve a draft whose deadline has passed", async () => {
    const { prediction } = await seedDraft();
    const { cookie } = await h.signIn(ADMIN);
    const res = await h.app.inject({
      method: "POST",
      url: `/admin/predictions/${prediction.id}/approve`,
      headers: { cookie },
      payload: { edits: { deadline_utc: "2026-09-01T00:00:00Z" } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().codes).toEqual(["DEADLINE_PAST"]);
  });

  it("rejects a draft and notifies the submitter", async () => {
    const { prediction, submission } = await seedDraft();
    const { cookie } = await h.signIn(ADMIN);
    await h.app.inject({ method: "POST", url: `/admin/predictions/${prediction.id}/reject`, headers: { cookie }, payload: { reason: "hype, not a call" } });
    const s = await h.db.submission.findUnique({ where: { id: submission.id } });
    expect(s).toMatchObject({ status: "REJECTED", reason: "hype, not a call" });
    expect(h.jobs).toContainEqual({ name: "notify.fanout", data: { kind: "submission.updated", submissionId: submission.id }, opts: undefined });
  });

  it("takedown → exclude flags the KOL", async () => {
    const { cookie } = await h.signIn(ADMIN);
    const t = await h.db.takedownRequest.create({ data: { kolHandle: "someone", name: "S", contact: "s@x.com", urls: "", reason: "remove please" } });
    await h.app.inject({ method: "POST", url: `/admin/takedowns/${t.id}`, headers: { cookie }, payload: { action: "exclude" } });
    expect((await h.db.kol.findUnique({ where: { xHandle: "someone" } }))!.excluded).toBe(true);
  });

  it("switches auto-publish templates", async () => {
    const { cookie } = await h.signIn(ADMIN);
    await h.app.inject({ method: "PUT", url: "/admin/config/templates", headers: { cookie }, payload: { enabled: ["crypto-major-daily-close"] } });
    expect(await h.kv.get(STATUS_KEYS.autoPublishTemplates)).toBe("crypto-major-daily-close");
  });
});
