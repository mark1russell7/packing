# @packing/site

The GitHub Pages site of packing: <https://mark1russell7.github.io/packing/>.

The site has five pages: the live demo (`index.html`), the compare page (`compare/`) and the measured results (`results/`). It also has a card for each strategy (`strategies/`) and the news (`whats-new/`). The deploy adds the pages `status/` and `releases/`.

## Build

Start these commands at the root of the repository:

```sh
pnpm --filter @packing/site dev
SITE_BASE=/packing pnpm --filter @packing/site build
```

`SITE_BASE` sets the base path. The Pages workflow sets it to `/packing`. A build without it uses the root.

## The render check

The script `scripts/render-check.ts` opens each built page in Playwright Chromium. The workflow `site-check.yml` starts it for each change to the site.

The script serves `dist/` at the base of the build. It finds the pages from the HTML files in `dist/`. Thus, a new page gets the check with no edit.

The script opens each page in four views:

| View | Width x height | Color scheme |
| --- | --- | --- |
| `phone-light` | 390 x 844 | light |
| `phone-dark` | 390 x 844 | dark |
| `desktop-light` | 1280 x 800 | light |
| `desktop-dark` | 1280 x 800 | dark |

A page view fails on each of these conditions:

- A console error or a page error.
- A failed request, or a 4xx or 5xx response, from the origin of the site.
- No `main` element, or a `main` element with no text.
- A horizontal scroll at the phone width: `scrollWidth` is more than `innerWidth + 1`.

A failed request to a different origin is a warning, not a failure. The fonts come from a different origin. The script does not follow the links to `status/` and `releases/`.

The script writes a full-page screenshot of each page view, `report.json` and `summary.md` to `render-out/`. In CI, the artifact `site-render` holds this folder. The job summary shows the table of `summary.md`.

To start the check on your computer:

1. Install Chromium with `pnpm --filter @packing/site exec playwright install chromium`.
2. Build the site with `SITE_BASE=/packing`.
3. Start `SITE_BASE=/packing pnpm --filter @packing/site render-check`.

Use the same `SITE_BASE` for the build and the check. The option `--list` shows the pages and opens no browser. The option `--out <folder>` sets the output folder.
