import { defineConfig } from "tsdown";

// The build of the package for npm: an ES module and its declarations in build/ for each entry of `exports`. The
// subpaths of roadmap item k132 are in build/entry/ and share chunks with the index. The workspace uses the source.
// The build does not keep one file for each module: then the import cycles of `registry.ts` break the load of the index.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "entry/default": "src/entry/default.ts",
    "entry/guillotine": "src/entry/guillotine.ts",
    "entry/hole-degree": "src/entry/hole-degree.ts",
    "entry/maxrects": "src/entry/maxrects.ts",
    "entry/push": "src/entry/push.ts",
    "entry/rows": "src/entry/rows.ts",
    "entry/shelf": "src/entry/shelf.ts",
    "entry/skyline": "src/entry/skyline.ts",
  },
  outDir: "build",
  format: "esm",
  platform: "neutral",
  sourcemap: true,
  publint: true,
  attw: { profile: "esm-only" },
});
