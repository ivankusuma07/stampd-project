import { defineConfig } from "tsup";

// Bundles the workspace packages (@stampd/*, shipped as TypeScript source) into dist; everything
// from npm stays external and is installed normally.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  noExternal: [/^@stampd\//],
  external: ["@prisma/client", "@prisma/adapter-pg"],
});
