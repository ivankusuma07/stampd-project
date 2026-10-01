// Forbidden-copy check (part of `pnpm verify`). Fails the build on wording that ranks or mocks
// people (plan R3: neutral wording, no "worst predictor" leaderboards) and on UI copy that would
// imply real money (plan R2). Scans user-facing source only.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SCAN = ["apps/web/app", "apps/web/components", "apps/web/lib", "packages/ui/src", "packages/ai/src/prompts.ts"];
const RULES = [
  [/\bworst (predictor|kol|caller)s?\b/i, "ranks people as worst"],
  [/\bbad calls?\b/i, "judges a person's call"],
  [/\b(clown|scammer|liar|fraud)s?\b/i, "insults a person"],
  [/\bhall of shame\b/i, "shaming leaderboard"],
  [/\b(cash ?out|withdraw (your )?winnings|real money|guaranteed (profit|returns?))\b/i, "implies real-money value (plan R2)"],
  [/\bairdrop\b/i, "airdrop promise (plan R2)"],
];
// Lines that state what the product is NOT are allowed.
const ALLOW = [/can(?:'|&apos;|no)t be cashed out/i, /cannot be (sold|cashed)/i, /no (monetary )?value/i];

const files = [];
const walk = (p) => {
  const st = statSync(p);
  if (st.isDirectory()) for (const n of readdirSync(p)) walk(join(p, n));
  else if (/\.(tsx?|mdx?)$/.test(p)) files.push(p);
};
for (const s of SCAN) walk(join(ROOT, s));

// Owner's style rule: no em dashes in anything a user can read. Also covers api/worker messages
// that reach the UI (alerts, submission errors). Comments are exempt.
const DASH_SCAN = ["apps/api/src", "apps/worker/src"];
for (const s of DASH_SCAN) walk(join(ROOT, s));
const EM_DASH = /—/;
const stripComments = (line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? "" : line.replace(/(^|\s)\/\/.*$/, ""));

const problems = [];
for (const f of files) {
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (EM_DASH.test(stripComments(line))) problems.push(`${relative(ROOT, f)}:${i + 1}: em dash in user-facing text: ${line.trim().slice(0, 120)}`);
    });
}
for (const f of files.filter((f) => !DASH_SCAN.some((d) => relative(ROOT, f).replaceAll("\\", "/").startsWith(d)))) {
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (ALLOW.some((a) => a.test(line))) return;
      for (const [re, why] of RULES) if (re.test(line)) problems.push(`${relative(ROOT, f)}:${i + 1}: ${why}: ${line.trim().slice(0, 120)}`);
    });
}
if (problems.length) {
  console.error(`forbidden copy:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`copy check: ${files.length} files clean`);
