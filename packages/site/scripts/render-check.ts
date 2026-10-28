// The render check of the site (k71). This script serves the built `dist/` at the base of the build, and opens
// each built page in Playwright Chromium at the phone width and at the desktop width, in light and in dark.
// It writes a full-page screenshot of each page and view, and `report.json`, to the output folder.
//
// A page and view fails on: a console error, a page error, a failed request or a 4xx/5xx response from the
// site's own origin, a missing or empty `main`, and a horizontal scroll at the phone width.
// A request to another origin (the fonts) is not a failure. The report shows it as a warning.
//
//   SITE_BASE=/packing pnpm --filter @packing/site build
//   SITE_BASE=/packing pnpm --filter @packing/site render-check [--out <folder>] [--list]
//
// `--list` writes the pages and their URLs, and opens no browser.
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";

interface View {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly colorScheme: "light" | "dark";
  /** The check of the horizontal scroll applies only at the phone width. */
  readonly phone: boolean;
}

interface Page {
  /** The HTML file, relative to `dist/`, with forward slashes. */
  readonly file: string;
  /** The path of the page under the base, for example "results/". */
  readonly path: string;
  /** A name for the screenshot files, for example "results". */
  readonly slug: string;
}

interface Checks {
  mainFound: boolean;
  mainTextLength: number;
  scrollWidth: number;
  innerWidth: number;
  horizontalScroll: boolean;
  consoleErrors: number;
  pageErrors: number;
  ownRequestFailures: number;
  externalRequestWarnings: number;
}

interface Result {
  readonly page: string;
  readonly url: string;
  readonly view: View;
  readonly checks: Checks;
  readonly failures: string[];
  readonly warnings: string[];
  readonly screenshot: string | null;
}

const VIEWS: readonly View[] = [
  { name: "phone-light", width: 390, height: 844, colorScheme: "light", phone: true },
  { name: "phone-dark", width: 390, height: 844, colorScheme: "dark", phone: true },
  { name: "desktop-light", width: 1280, height: 800, colorScheme: "light", phone: false },
  { name: "desktop-dark", width: 1280, height: 800, colorScheme: "dark", phone: false },
];

/** The deploy adds these pages. A local or pull request build does not have them, so the check skips them. */
const DEPLOY_ONLY = ["status/", "releases/"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const siteRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** The base of the build, as vite.config.ts makes it from SITE_BASE: "/" or "/packing/". */
export function siteBase(env: string | undefined): string {
  return env ? `${env.replace(/\/$/, "")}/` : "/";
}

/** The pages of the build: each HTML file under `dist/`, sorted. A new page needs no edit of this script. */
export async function findPages(dist: string): Promise<Page[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".html")) files.push(relative(dist, full).split(sep).join("/"));
    }
  };
  await walk(dist);
  return files.sort().map((file) => {
    const path = file === "index.html" ? "" : file.endsWith("/index.html") ? file.slice(0, -"index.html".length) : file;
    const slug = path === "" ? "index" : path.replace(/\/$/, "").replace(/\.html$/, "").replace(/[^a-zA-Z0-9-]+/g, "_");
    return { file, path, slug };
  });
}

/** A static server of `dist/` under `base`. A path out of `dist/` or a missing file gets 404. */
export function serve(dist: string, base: string): Promise<Server> {
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        res.writeHead(400).end("bad path");
        return;
      }
      if (!pathname.startsWith(base)) {
        res.writeHead(404).end("not under the base");
        return;
      }
      let file = resolve(dist, `.${sep}${pathname.slice(base.length)}`);
      if (file !== dist && !file.startsWith(dist + sep)) {
        res.writeHead(404).end("not in dist");
        return;
      }
      try {
        if ((await stat(file)).isDirectory()) file = join(file, "index.html");
        await stat(file);
      } catch {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    })();
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => done(server));
  });
}

function parseArgs(argv: readonly string[]): { out: string; list: boolean } {
  let out = join(siteRoot, "render-out");
  let list = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--list") list = true;
    else if (arg === "--out") {
      const value = argv[i + 1];
      if (!value) throw new Error("--out needs a folder");
      out = resolve(value);
      i += 1;
    } else throw new Error(`Unknown argument: ${arg ?? ""}`);
  }
  return { out, list };
}

async function checkView(
  browser: Browser,
  origin: string,
  url: string,
  page: Page,
  view: View,
  out: string,
): Promise<Result> {
  const failures: string[] = [];
  const warnings: string[] = [];
  const checks: Checks = {
    mainFound: false,
    mainTextLength: 0,
    scrollWidth: 0,
    innerWidth: 0,
    horizontalScroll: false,
    consoleErrors: 0,
    pageErrors: 0,
    ownRequestFailures: 0,
    externalRequestWarnings: 0,
  };
  const own = (u: string): boolean => u.startsWith(`${origin}/`) || u === origin;
  const deployOnly = (u: string): boolean => DEPLOY_ONLY.some((p) => new URL(u).pathname.includes(`/${p}`));

  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    colorScheme: view.colorScheme,
    deviceScaleFactor: 1,
  });
  const tab = await context.newPage();
  tab.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const where = msg.location().url;
    // Chromium writes a console error for each failed resource. The request checks below judge those.
    if (msg.text().startsWith("Failed to load resource") && where && (!own(where) || deployOnly(where))) {
      warnings.push(`console (external resource): ${msg.text()} [${where}]`);
      return;
    }
    checks.consoleErrors += 1;
    failures.push(`console error: ${msg.text()}${where ? ` [${where}]` : ""}`);
  });
  tab.on("pageerror", (error) => {
    checks.pageErrors += 1;
    failures.push(`page error: ${error.message}`);
  });
  tab.on("requestfailed", (req) => {
    const text = `request failed: ${req.method()} ${req.url()} (${req.failure()?.errorText ?? "unknown"})`;
    if (req.url().startsWith("data:")) return;
    if (own(req.url()) && !deployOnly(req.url())) {
      checks.ownRequestFailures += 1;
      failures.push(text);
    } else {
      checks.externalRequestWarnings += 1;
      warnings.push(text);
    }
  });
  tab.on("response", (res) => {
    if (res.status() < 400) return;
    const text = `HTTP ${res.status()}: ${res.request().method()} ${res.url()}`;
    if (own(res.url()) && !deployOnly(res.url())) {
      checks.ownRequestFailures += 1;
      failures.push(text);
    } else {
      checks.externalRequestWarnings += 1;
      warnings.push(text);
    }
  });

  let screenshot: string | null = null;
  try {
    await tab.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    const measured = await tab.evaluate(() => {
      const main = document.querySelector("main");
      return {
        mainFound: main !== null,
        mainTextLength: main ? main.innerText.trim().length : 0,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    Object.assign(checks, measured);
    checks.horizontalScroll = measured.scrollWidth > measured.innerWidth + 1;
    if (!measured.mainFound) failures.push("no <main> element");
    else if (measured.mainTextLength === 0) failures.push("<main> has no text");
    if (view.phone && checks.horizontalScroll) {
      failures.push(`horizontal scroll at the phone width: scrollWidth ${measured.scrollWidth} > innerWidth ${measured.innerWidth} + 1`);
    }
    screenshot = `${page.slug}-${view.name}.png`;
    await tab.screenshot({ path: join(out, screenshot), fullPage: true });
  } catch (error) {
    failures.push(`load or check failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close();
  }
  return { page: page.file, url, view, checks, failures, warnings, screenshot };
}

function summary(results: readonly Result[]): string {
  const failed = results.filter((r) => r.failures.length > 0);
  const lines = [
    "## Site render check",
    "",
    failed.length === 0
      ? `All ${results.length} page views pass.`
      : `${failed.length} of ${results.length} page views fail.`,
    "",
    "| Page | View | Result | main text | scrollWidth / innerWidth | Warnings |",
    "| --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.page} | ${r.view.name} | ${r.failures.length === 0 ? "pass" : `FAIL (${r.failures.length})`} | ` +
        `${r.checks.mainTextLength} | ${r.checks.scrollWidth} / ${r.checks.innerWidth} | ${r.warnings.length} |`,
    ),
  ];
  for (const r of failed) {
    lines.push("", `### ${r.page} (${r.view.name})`, "", ...r.failures.map((f) => `- ${f.replaceAll("|", "\\|")}`));
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<number> {
  const { out, list } = parseArgs(process.argv.slice(2));
  const dist = join(siteRoot, "dist");
  const base = siteBase(process.env["SITE_BASE"]);
  try {
    await stat(join(dist, "index.html"));
  } catch {
    console.error(`No build in ${dist}. Build the site first, with the same SITE_BASE.`);
    return 1;
  }
  const pages = await findPages(dist);
  if (list) {
    for (const page of pages) console.log(`${page.file}\t${base}${page.path}\t${page.slug}`);
    return 0;
  }

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const server = await serve(dist, base);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const results: Result[] = [];
  try {
    for (const page of pages) {
      const url = `${origin}${base}${page.path}`;
      for (const view of VIEWS) {
        const result = await checkView(browser, origin, url, page, view, out);
        results.push(result);
        const state = result.failures.length === 0 ? "pass" : "FAIL";
        console.log(`${state} ${page.file} ${view.name}`);
        for (const f of result.failures) console.log(`  - ${f}`);
        for (const w of result.warnings) console.log(`  ~ ${w}`);
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.close(() => done()));
  }

  const ok = results.every((r) => r.failures.length === 0);
  const report = { base, pages: pages.map((p) => p.file), views: VIEWS, ok, results };
  await writeFile(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const md = summary(results);
  await writeFile(join(out, "summary.md"), md);
  const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
  if (stepSummary) await writeFile(stepSummary, md, { flag: "a" });
  console.log(ok ? `All ${results.length} page views pass.` : "The render check fails.");
  return ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
