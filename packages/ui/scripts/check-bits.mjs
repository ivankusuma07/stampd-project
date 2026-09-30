// Development plan 3.2b: no hardcoded colours or banned effects left in src/bits (tokens only).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/bits", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const banned = [/#[0-9a-fA-F]{3,8}\b(?![0-9a-fA-F])/, /rgba?\(/, /linear-gradient|radial-gradient/, /box-shadow:\s*0/, /@hugeicons/];
const problems = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else {
      readFileSync(p, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (line.trim().startsWith("//")) return;
          const clean = line.replace(/%23[0-9A-Fa-f]*/g, ""); // url-encoded SVG masks
          for (const re of banned) if (re.test(clean)) problems.push(`${p}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
  }
};
walk(root);
if (problems.length) {
  console.error(`hardcoded colours / banned effects in src/bits:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("src/bits: tokens only");
