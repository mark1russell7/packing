// The page of the response explorer (roadmap item k143). The record is a file of its own, so only this page loads it.

import { parseResponseRecord } from "@mark1russell7/rigor-statistics";
import { mountExplorer } from "@mark1russell7/site-pages/explorer";
import "@mark1russell7/site-pages/explorer.css";
import recordUrl from "../data/response-coverage.json?url";
import { mountChrome } from "./chrome.ts";
import { explorerFacts, type ExplorerFacts } from "./explorer-model.ts";
import { esc } from "./format.ts";
import "./style.css";
import "./pages.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const RUNS = "https://github.com/mark1russell7/packing/actions/runs";

/** This function gives the tiles of the facts. */
function tilesHtml(facts: ExplorerFacts): string {
  const tile = (label: string, value: string, note: string): string => `<div class="tile"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(note)}</small></div>`;
  return [
    tile("Measured points", facts.points.toLocaleString("en-US"), `${facts.specs} specs`),
    tile("Strategies", String(facts.strategies), "on the same specs"),
    tile("Folds", String(facts.folds), "each holds out whole specs"),
  ].join("");
}

/** This function gives the table of the held-out errors. */
function fitsHtml(facts: ExplorerFacts): string {
  const rows = facts.fits.map((f) => `<tr><td><code>${esc(f.label)}</code></td><td>${f.mae.toPrecision(3)}</td><td>${f.baselineMae.toPrecision(3)}</td></tr>`);
  return `<table class="vtable"><thead><tr><th>Measure</th><th>Error of the fit</th><th>Error of the mean</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

mountChrome($("links"), "explorer");

/** This function loads the record, shows its facts and mounts the explorer. */
async function main(): Promise<void> {
  const response = await fetch(recordUrl);
  if (!response.ok) throw new Error(`The record did not load: ${response.status}.`);
  const text = await response.text();
  const parsed = parseResponseRecord(JSON.parse(text));
  if (parsed.ok) {
    const facts = explorerFacts(parsed.record);
    $("explorer-tiles").innerHTML = tilesHtml(facts);
    $("explorer-fits").innerHTML = fitsHtml(facts);
    if (facts.run !== undefined) $("explorer-origin").innerHTML = `<p class="hint">The data comes from run <a href="${RUNS}/${esc(facts.run)}">${esc(facts.run)}</a>.</p>`;
  }
  mountExplorer($("explorer"), text, { initial: { x: "count" } });
}

main().catch((error: unknown) => {
  $("explorer").textContent = String(error);
});
