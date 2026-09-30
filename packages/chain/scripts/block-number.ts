// Development plan step 0.2: print the latest block on both Robinhood Chain networks.
import { publicClientFor, robinhoodMainnet, robinhoodTestnet } from "../src";

for (const chain of [robinhoodMainnet, robinhoodTestnet]) {
  try {
    const block = await publicClientFor(chain.id).getBlockNumber();
    console.log(`${chain.name} (${chain.id}): block ${block}`);
  } catch (err) {
    console.error(`${chain.name} (${chain.id}): ${(err as Error).message.split("\n")[0]}`);
    process.exitCode = 1;
  }
}
