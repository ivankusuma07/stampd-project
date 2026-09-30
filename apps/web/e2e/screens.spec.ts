import { test } from "@playwright/test";

/** Screenshots for design review (development plan 3.6), not assertions. Written to e2e-screens/. */
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
const OUT = process.env.E2E_SCREENS ?? "e2e-screens";

for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`screens ${name} ${theme}`, async ({ browser }) => {
      const { markets } = (await (await fetch(`${API}/markets`)).json()) as { markets: { id: string }[] };
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      const page = await ctx.newPage();
      for (const [slug, path] of [
        ["home", "/"],
        ["market", `/markets/${markets[0]!.id}`],
        ["kol", "/kol/example_kol"],
        ["styleguide", "/styleguide"],
      ] as const) {
        await page.goto(path);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/${slug}-${name}-${theme}.png`, fullPage: true });
      }
      await ctx.close();
    });
  }
}
