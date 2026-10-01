// Development plan step 0.3 / 7.6: seed the tracked-KOL launch set. Inserts KOLs only, never
// markets, trades or prices (development plan 1.2: no placeholder statistics). Idempotent.
//
// The list is stampd-kol-roster.md after the checks in its §4 (30 Sep 2026): every handle resolved
// through the scraper, with its numeric X id (handles can change, ids don't). @RaoulGMI replaces the
// mistyped @RaoulGMGMI, @DonAlt replaces @CryptoDonAlt (renamed), @CredibleCrypto replaces the
// protected @Trader_XO. Priority 1 polls every 15 minutes, priority 2 every 30.
import "dotenv/config";
import { getDb } from "../src";

const db = getDb();

const kols: [handle: string, xUserId: string, name: string, priority: 1 | 2][] = [
  ["CryptoKaleo", "906234475604037637", "K A L E O", 1],
  ["AltcoinSherpa", "1068237257977544704", "Altcoin Sherpa", 1],
  ["rektcapital", "918122676195090433", "Rekt Capital", 1],
  ["CryptoMichNL", "146008010", "Michaël van de Poppe", 1],
  ["Pentosh1", "1138993163706753029", "Pentoshi", 1],
  ["DaanCrypto", "918138253617790976", "Daan Crypto Trades", 1],
  ["CryptoHayes", "983993370048630785", "Arthur Hayes", 1],
  ["fundstrat", "2648357839", "Tom Lee", 1],
  ["PeterSchiff", "56562803", "Peter Schiff", 1],
  ["CryptoCapo_", "988796804446769153", "il Capo Of Crypto", 1],
  ["DonAlt", "878219545785372673", "DonAlt", 2],
  ["CredibleCrypto", "944746889194364928", "CrediBULL Crypto", 2],
  ["inmortalcrypto", "571771109", "inmortal", 2],
  ["PeterLBrandt", "247857712", "Peter Brandt", 2],
  ["100trillionUSD", "918804624303382528", "PlanB", 2],
  ["RaoulGMI", "2453385626", "Raoul Pal", 2],
  ["APompliano", "339061487", "Anthony Pompliano", 2],
  ["blknoiz06", "973261472", "Ansem", 2],
  ["MustStopMurad", "844304603336232960", "Murad", 2],
  ["scottmelker", "17351167", "Scott Melker", 2],
];

for (const [xHandle, xUserId, name, priority] of kols) {
  const pollIntervalMin = priority === 1 ? 15 : 30;
  await db.kol.upsert({
    where: { xHandle },
    update: { xUserId, tracked: true, pollIntervalMin },
    create: { xHandle, xUserId, name, tracked: true, pollIntervalMin },
  });
}
console.log(`seeded ${kols.length} KOLs`);
await db.$disconnect();
