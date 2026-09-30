// src/bits guard (docs/decisions.md D14). Gradients and glows are part of the Neon Receipt look, so
// they are allowed; what stays banned:
//  - heavy or off-brand deps: three.js, gsap, Hugeicons (the bundle ships ogl + motion only);
//  - hardcoded hex colours, so bits follow the theme tokens. A canvas/WebGL bit that must take a
//    raw colour opts out with a `check-bits: raw-colours` comment naming why.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/bits", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const bannedImports = /from\s+["'](three|gsap|@hugeicons\/[^"']*)["']/;
const hex = /#[0-9a-fA-F]{3,8}\b(?![0-9a-fA-F])/;
const problems = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    const src = readFileSync(p, "utf8");
    const rawColoursAllowed = src.includes("check-bits: raw-colours");
    src.split("\n").forEach((line, i) => {
      if (line.trim().startsWith("//")) return;
      const where = `${p}:${i + 1}: ${line.trim().slice(0, 100)}`;
      if (bannedImports.test(line)) problems.push(`banned import  ${where}`);
      const clean = line.replace(/%23[0-9A-Fa-f]*/g, ""); // url-encoded SVG masks
      if (!rawColoursAllowed && hex.test(clean)) problems.push(`hex colour     ${where}`);
    });
  }
};
walk(root);
if (problems.length) {
  console.error(`src/bits problems:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("src/bits: tokens only, no banned imports");
