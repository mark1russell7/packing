import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The Pages workflow sets SITE_BASE to "/packing". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";
const page = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// The site has three pages: the live demo, the measured results and the news. The deploy adds `status/` and `releases/`.
export default defineConfig({
  base,
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        demo: page("./index.html"),
        results: page("./results/index.html"),
        "whats-new": page("./whats-new/index.html"),
      },
    },
  },
});
