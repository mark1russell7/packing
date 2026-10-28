// This file is a placeholder. `bench/choose-sets.ts` writes it again from the records of a run.

import type { PortfolioSets } from "./portfolio-cell.ts";

/** The table of the per-cell portfolio. */
export const PORTFOLIO_SETS: PortfolioSets = {
  source: { corpus: "none", run: "none", commit: "none", inputs: 0, frameMs: 50 },
  entries: {
    "maxrects-bl": { id: "maxrects-bl", strategy: "maxrects", options: { rule: "bl" } },
    "shelf-best": { id: "shelf-best", strategy: "shelf", options: { fit: "best", sortOrder: "height-desc" } },
    "maxrects-cp": { id: "maxrects-cp", strategy: "maxrects", options: { rule: "cp" } },
  },
  all: { inputs: 0, thin: false, sets: { "1": ["maxrects-bl"], "2": ["maxrects-bl", "shelf-best"], "3": ["maxrects-bl", "shelf-best", "maxrects-cp"] } },
  shapes: {},
  cells: {},
};
