// Development plan step 0.3: "a seed inserts one KOL". Inserts the tracked-KOL list only —
// never markets, trades or prices (development plan 1.2: no placeholder statistics).
import "dotenv/config";
import { getDb } from "../src";

const db = getDb();

// Handles to track are an open decision (plan B11 #5). Replace this list with the launch set.
const kols = [{ xHandle: "example_kol", name: "Example KOL" }];

for (const k of kols) {
  await db.kol.upsert({ where: { xHandle: k.xHandle }, update: {}, create: k });
}
console.log(`seeded ${kols.length} KOL(s)`);
await db.$disconnect();
