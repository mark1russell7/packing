import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The Pages workflow sets SITE_BASE to "/packing". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";
const page = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** This function gives a line of git, or "unknown" outside a repository. */
const git = (...args: string[]): string => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

// The release, the commit and the date of the build. The footer of each page shows them.
const build = {
  release: (JSON.parse(readFileSync(page("../packing/package.json"), "utf8")) as { version: string }).version,
  commit: git("rev-parse", "--short=7", "HEAD"),
  date: git("log", "-1", "--format=%cs"),
};

// The site has six pages: the live demo, the compare page, the strategy cards, the measured results, the response explorer and the news. The deploy adds `status/` and `releases/`.
export default defineConfig({
  base,
  define: { __SITE_BUILD__: JSON.stringify(build) },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        demo: page("./index.html"),
        compare: page("./compare/index.html"),
        strategies: page("./strategies/index.html"),
        results: page("./results/index.html"),
        explorer: page("./explorer/index.html"),
        "whats-new": page("./whats-new/index.html"),
      },
    },
  },
});
