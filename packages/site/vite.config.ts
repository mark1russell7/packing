import { defineConfig } from "vite";

// The Pages workflow sets SITE_BASE to "/packing". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";

// The site has one page: the live demo.
export default defineConfig({
  base,
  build: { target: "es2022" },
});
