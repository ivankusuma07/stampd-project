import { expect, test } from "@playwright/test";
import { createPublicClient, http } from "viem";
import { anvil } from "viem/chains";
import { getDeployment, marketHubAbi } from "@stampd/chain";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8545";

/**
 * Development plan 3.5: the trade panel's quote equals MarketHub.quoteBuy for 5 random amounts,
 * to the unit. The panel quotes locally from live reserves; the contract is asked directly.
 */
test("trade panel quote equals the contract's quoteBuy", async ({ page }) => {
  const { markets } = (await (await fetch(`${API}/markets`)).json()) as { markets: { id: string; onchainId: string }[] };
  const m = markets[0]!;
  const chain = createPublicClient({ chain: anvil, transport: http(RPC) });
  const hub = getDeployment(31337).contracts.MarketHub;

  await page.goto(`/markets/${m.id}`);
  await page.getByRole("radio", { name: /YES/ }).click();
  const amounts = Array.from({ length: 5 }, () => (Math.floor(Math.random() * 500_00) / 100 + 0.01).toFixed(2));
  for (const amount of amounts) {
    await page.getByLabel("Amount (demo USD)").fill(amount);
    const shares = page.locator("dd[data-raw]").first();
    await expect(shares).toBeVisible();
    const [expected, fee] = await chain.readContract({
      address: hub,
      abi: marketHubAbi,
      functionName: "quoteBuy",
      args: [BigInt(m.onchainId), 1, BigInt(Math.round(Number(amount) * 1e6))],
    });
    await expect(shares, `amount ${amount}`).toHaveAttribute("data-raw", expected.toString());
    await expect(page.locator("dd[data-raw]").nth(1)).toHaveAttribute("data-raw", fee.toString());
  }
});
