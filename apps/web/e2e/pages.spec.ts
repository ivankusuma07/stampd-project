import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";

async function firstMarketId(): Promise<string> {
  const r = await fetch(`${API}/markets?status=all`);
  const { markets } = (await r.json()) as { markets: { id: string }[] };
  if (!markets[0]) throw new Error("no markets — run `pnpm dev:local` (it seeds a sample market)");
  return markets[0].id;
}

// Wallet libraries log noisy warnings without a wallet; only real page errors fail a test.
function watchErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("every main page renders", async ({ page }) => {
  const id = await firstMarketId();
  const errors = watchErrors(page);
  const pages: [string, RegExp][] = [
    ["/", /Market board/i],
    ["/markets", /Markets/],
    [`/markets/${id}`, /Rules/],
    ["/kols", /KOLs/],
    ["/kol/example_kol", /Live calls/],
    ["/insights", /Methodology/],
    ["/contracts", /Contracts/],
    ["/faucet", /Get gas/],
    ["/submit", /Submit a call/],
    ["/portfolio", /Portfolio/],
    ["/callouts", /Callouts/],
    ["/notifications", /Notifications/],
    ["/takedown", /Request a review/],
    ["/styleguide", /Styleguide/],
  ];
  for (const [path, text] of pages) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("main")).toContainText(text);
  }
  expect(errors).toEqual([]);
});

test("the contracts page finds bytecode at every address from the browser", async ({ page }) => {
  await page.goto("/contracts");
  await expect(page.getByText("code present")).toHaveCount(5, { timeout: 20_000 });
});

test("market page shows the question, live price and rules hash", async ({ page }) => {
  const id = await firstMarketId();
  await page.goto(`/markets/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("BTC");
  await expect(page.getByRole("radio", { name: /YES/ })).toBeVisible();
  await expect(page.getByText("Rules hash (onchain)")).toBeVisible();
});

test("reduced motion: prices show immediately as plain text", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/markets");
  const cell = page.getByTestId("yes-price").first();
  await expect(cell).toContainText(/\d+¢/);
  await ctx.close();
});
