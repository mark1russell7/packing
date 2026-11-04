// The subpaths of roadmap item k132: each subpath reaches only the modules of its own strategy. The test reads the value
// imports of the source files. A type import goes away in the build, so it does not count.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = import.meta.dirname;
const root = path.dirname(src);

/** The modules of each strategy: its strategy module and its packers. A subpath must not reach the modules of another strategy. */
const STRATEGY_MODULES: Readonly<Record<string, readonly string[]>> = {
  rows: ["rows-strategy.ts", "rows.ts"],
  skyline: ["skyline-strategy.ts", "skyline.ts"],
  shelf: ["shelf-strategy.ts", "shelf.ts"],
  push: ["push-strategy.ts", "push.ts"],
  maxrects: ["maxrects-strategy.ts", "maxrects.ts"],
  guillotine: ["guillotine-strategy.ts", "guillotine.ts"],
  "hole-degree": ["hole-degree.ts"],
  "circle-quasi-physical": ["circle-quasi-physical.ts"],
};

/**
 * The modules that each subpath can reach, more than its own strategy modules. Some packers share a helper of another
 * packer module: `packRows` uses `packRowsInSpace` of `shelf.ts`, `skyline` and `guillotine` use the walls of `maxrects.ts`.
 * `push` places the rest with `packSkyline`. `default` packs with `select` and its members `rows` and `maxrects`.
 */
const SUBPATHS: Readonly<Record<string, readonly string[]>> = {
  rows: ["shelf.ts"],
  skyline: ["maxrects.ts"],
  shelf: [],
  push: ["skyline.ts", "maxrects.ts"],
  maxrects: [],
  guillotine: ["maxrects.ts"],
  "hole-degree": [],
  "circle-quasi-physical": [],
  default: [...STRATEGY_MODULES["rows"]!, ...STRATEGY_MODULES["maxrects"]!, "shelf.ts"],
};

/** The modules that import each strategy: the registry, the barrel, the dispatcher of `pack` and the index. */
/** This subpath reads the live strategies on purpose, so it has no check of the modules that it reaches. The size gate holds its size. */
const WHOLE_ENGINE = ["strategy-catalog"];

const HUBS = ["index.ts", "registry.ts", "adapters.ts", "pack.ts", "free.ts", "select.ts", "portfolio-sets.ts"];

/** This function gives the relative value imports and re-exports of a source file, as absolute paths. */
function valueImports(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s+"(\.\.?\/[^"]+)"/g)) {
    if (m[1] !== undefined) continue;
    const names = /\{([\s\S]*)\}/.exec(m[2]!)?.[1];
    if (names !== undefined && /^[\s\w*]*$/.test(m[2]!.replace(/\{[\s\S]*\}/, "")) && names.split(",").every((n) => n.trim() === "" || n.trim().startsWith("type "))) continue;
    out.push(path.resolve(path.dirname(file), m[3]!));
  }
  return out;
}

/** This function gives each source file that an entry reaches through value imports, as paths relative to `src/`. */
function reach(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length > 0) {
    const file = todo.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    todo.push(...valueImports(file));
  }
  return new Set([...seen].map((f) => path.relative(src, f).replaceAll("\\", "/")));
}

describe("the subpaths of the strategies (roadmap item k132)", () => {
  it("reads the value imports and skips the type imports", () => {
    const imports = valueImports(path.join(src, "pack-sized.ts")).map((f) => path.basename(f));
    expect(imports).toEqual(["rect.ts", "vector.ts"]);
  });

  it("gives the index each strategy, through the registry", () => {
    const all = reach(path.join(src, "index.ts"));
    for (const modules of Object.values(STRATEGY_MODULES)) for (const m of modules) expect(all.has(m)).toBe(true);
    expect(all.has("registry.ts")).toBe(true);
  });

  for (const [name, more] of Object.entries(SUBPATHS)) {
    it(`gives the subpath ${name} no module of another strategy and no registry`, () => {
      const reached = reach(path.join(src, "entry", `${name}.ts`));
      const own = new Set([...(STRATEGY_MODULES[name] ?? []), ...more]);
      const others = Object.values(STRATEGY_MODULES).flat().filter((m) => !own.has(m));
      expect([...reached].filter((m) => others.includes(m) || HUBS.includes(m))).toEqual([]);
      for (const m of STRATEGY_MODULES[name] ?? []) expect(reached.has(m)).toBe(true);
    });
  }

  it("lists each subpath in the exports of the source and of the build", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
      exports: Record<string, string>;
      publishConfig: { exports: Record<string, unknown> };
    };
    const files = fs.readdirSync(path.join(src, "entry")).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3)).sort();
    expect(files).toEqual([...Object.keys(SUBPATHS), ...WHOLE_ENGINE].sort());
    for (const name of files) {
      expect(pkg.exports[`./${name}`]).toBe(`./src/entry/${name}.ts`);
      expect(pkg.publishConfig.exports[`./${name}`]).toEqual({ types: `./build/entry/${name}.d.ts`, default: `./build/entry/${name}.js` });
    }
  });
});
