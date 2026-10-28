// The page of the news: each release of the changelog, by date. The page reads only `data/releases.json`.

import { marked } from "marked";
import newsText from "../content/whats-new.md?raw";
import releasesJson from "../data/releases.json?raw";
import { mountChrome } from "./chrome.ts";
import { byDate, parseSnapshot } from "./data.ts";
import { esc, inline, originHtml } from "./format.ts";
import "./style.css";
import "./pages.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

/** This function gives the text of a date, for example "28 October 2026". */
function dateText(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const snap = parseSnapshot(releasesJson, "releases");
mountChrome($("links"), "whats-new");
$("news-text").innerHTML = marked.parse(newsText, { async: false });
$("news-origin").innerHTML = originHtml(snap.origin);

const latest = snap.releases[0]!;
const groups = byDate(snap.releases);
const breaking = snap.releases.filter((r) => r.breaking).length;
$("news-tiles").innerHTML = `
  <div class="tile hero"><span>The latest release</span><b>${esc(latest.release)}</b><small>${esc(dateText(latest.date))}</small></div>
  <div class="tile"><span>Releases</span><b>${snap.releases.length}</b><small>on ${groups.length} days</small></div>
  <div class="tile ${breaking === 0 ? "better" : "mixed"}"><span>With breaking changes</span><b>${breaking}</b><small>the others keep the API</small></div>`;

$("news-list").innerHTML = groups
  .map(
    ([date, list]) => `<section class="day" aria-label="${esc(dateText(date))}">
      <h3><time datetime="${esc(date)}">${esc(dateText(date))}</time> <small>${list.length} ${list.length === 1 ? "release" : "releases"}</small></h3>
      <ol class="news">${list
        .map(
          (r) => `<li>
            <span class="ver">${esc(r.release)}</span>
            <span class="ntitle">${inline(r.title)}${r.breaking ? ` <span class="chip worse"><span aria-hidden="true">!</span> Breaking</span>` : ""}</span>
            <a class="nlink" href="${esc(r.link)}">${r.pr === null ? `commit <code>${esc(r.commit)}</code>` : `PR #${r.pr}`}</a>
          </li>`,
        )
        .join("")}</ol>
    </section>`,
  )
  .join("");
