// The page of the fixed studies: the paired speed test of k67 and the select table. Both come from CI runs of 2026-10-28.
// The page reads only the snapshot files of `packages/site/data/`. It has no data stamp until a scheduled workflow writes the table of select again.

import { marked } from "marked";
import speedText from "../content/results-speed.md?raw";
import selectText from "../content/results-select.md?raw";
import pairedJson from "../data/paired-k67.json?raw";
import selectJson from "../data/select-table.json?raw";
import { mountChrome } from "./chrome.ts";
import { CORPUS_LABELS, parseSnapshot } from "./data.ts";
import { esc, msText, originHtml } from "./format.ts";
import { pickHolds, ratioAt, stepText } from "./results-model.ts";
import "./style.css";
import "./pages.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const paired = parseSnapshot(pairedJson, "paired");
const select = parseSnapshot(selectJson, "select");

mountChrome($("links"), "results");

// ---- The paired speed test of k67 ----

function mountSpeed(): void {
  $("speed-text").innerHTML = marked.parse(speedText, { async: false });
  $("speed-origin").innerHTML = originHtml(paired.origin);
  const s = paired.slow;
  $("speed-tiles").innerHTML = `
    <div class="tile hero"><span>The slow set, ${s.inputs} inputs</span><b>${msText(s.medianMsA)} → ${msText(s.medianMsB)}</b><small>median time for each input, ratio ${s.medianRatio}</small></div>
    <div class="tile"><span>The slowest input</span><b>${msText(s.maxMsA)} → ${msText(s.maxMsB)}</b><small>largest time of each arm</small></div>
    <div class="tile"><span>The other ${paired.other.inputs} inputs</span><b>${paired.other.medianRatio}</b><small>median ratio B / A</small></div>
    <div class="tile ${paired.hashesEqual === paired.inputs ? "better" : "worse"}"><span>Same outputs</span><b>${paired.hashesEqual} of ${paired.inputs}</b><small>equal placement hashes</small></div>`;
  const rows = [{ name: "The slow set", ...s, slow: true }, ...paired.classes.map((c) => ({ ...c, slow: false }))].sort((x, y) => x.medianRatio - y.medianRatio);
  const one = ratioAt(1);
  $("speed-chart").innerHTML =
    rows
      .map((r) => {
        const at = ratioAt(r.medianRatio);
        const left = Math.min(one, at);
        const cls = r.medianRatio < 0.97 ? "faster" : r.medianRatio > 1.03 ? "slower" : "same";
        return `<li class="rrow${r.slow ? " slow" : ""}" title="${esc(r.name)}: ${r.inputs} inputs, ${msText(r.medianMsA)} to ${msText(r.medianMsB)}">
          <span class="rname">${esc(r.name)} <small>${r.inputs}</small></span>
          <span class="rbar" aria-hidden="true"><span class="one" style="left:${one}%"></span><span class="rfill ${cls}" style="left:${left}%;width:${Math.max(0.6, Math.abs(at - one))}%"></span></span>
          <span class="rval">${r.medianRatio}×</span>
        </li>`;
      })
      .join("") +
    `<li class="raxis" aria-hidden="true"><span></span><span class="ticks">${[0.05, 0.1, 0.3, 1, 2].map((t) => `<i style="left:${ratioAt(t)}%">${t}</i>`).join("")}</span><span></span></li>`;
  $("speed-arms").innerHTML = `Arm A is <code>${esc(paired.arms.a)}</code>, arm B is <code>${esc(paired.arms.b)}</code>. The strategy is <code>${esc(paired.strategy)}</code> on <code>${esc(paired.corpus)}</code>, ${paired.repeats} timed passes for each arm.`;
}

// ---- The select table ----

function mountSelect(): void {
  $("select-text").innerHTML = marked.parse(selectText, { async: false });
  $("select-origin").innerHTML = originHtml(select.origin);
  const label = (corpus: string): string => CORPUS_LABELS[corpus]?.label ?? corpus;
  $("leaves").innerHTML = select.leaves
    .map((leaf) => {
      const sets = [{ name: "Training", ...leaf.train }, ...leaf.test.map((t) => ({ name: label(t.corpus), wins: t.wins, of: t.of }))];
      const holds = sets.every((c) => pickHolds(leaf, c));
      const bars = sets
        .map((c) => {
          const share = c.of === 0 ? 0 : c.wins / c.of;
          return `<li><span class="lname">${esc(c.name)}</span><span class="lbar" aria-hidden="true"><span class="half"></span><span class="lfill" style="width:${share * 100}%"></span></span><span class="lval">${c.wins} of ${c.of}</span></li>`;
        })
        .join("");
      return `<li class="leaf ${leaf.member === "rows" ? "pick-rows" : "pick-max"}">
        <div class="lhead"><span class="lid">Leaf ${leaf.leaf}</span><span class="pick">picks <code>${esc(leaf.member)}</code></span><span class="chip ${holds ? "better" : "worse"}"><span aria-hidden="true">${holds ? "✓" : "✗"}</span> ${holds ? "Holds on the tests" : "Does not hold"}</span></div>
        <p class="path">${leaf.path.map((p) => `<span>${esc(stepText(p))}</span>`).join('<span class="arrow" aria-hidden="true">›</span>')}</p>
        <ul class="lbars" aria-label="Wins of maxrects-bl against rows">${bars}</ul>
      </li>`;
    })
    .join("");
}

mountSpeed();
mountSelect();
