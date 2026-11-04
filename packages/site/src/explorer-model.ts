// The facts of the response record for the text of the explorer page (roadmap item k143). Each number comes from the record, so no page copies one.

import { heldOutError, type ResponseRecord } from "@mark1russell7/rigor-statistics";
import type { Origin } from "./data.ts";

/** The origin of `data/response-coverage.json`. A test compares its run with the name of the record. */
export const RECORD_ORIGIN: Origin = { release: "0.2.17", commit: "e939842", date: "2026-10-29", run: 40805165103, source: "bench k115-strata" };

/** The held-out error of one measure. */
export interface MeasureFit {
  readonly id: string;
  readonly label: string;
  /** The mean absolute error on the specs that a fit did not see. */
  readonly mae: number;
  /** The same error for the mean of the training points. */
  readonly baselineMae: number;
}

/** The facts of a record. */
export interface ExplorerFacts {
  readonly points: number;
  readonly strategies: number;
  readonly specs: number;
  readonly folds: number;
  /** The id of the run in the name of the record, or `undefined`. */
  readonly run: string | undefined;
  readonly fits: readonly MeasureFit[];
}

/** This function gives the facts of a record. A measure with no model is not in the list of fits. */
export function explorerFacts(record: ResponseRecord): ExplorerFacts {
  const strategy = record.dimensions.find((d) => d.id === "strategy");
  const fits = record.models.map((model) => {
    const error = heldOutError(record, model.measure);
    const label = record.measures.find((m) => m.id === model.measure)?.label ?? model.measure;
    return { id: model.measure, label, mae: error.mae, baselineMae: error.baselineMae };
  });
  return {
    points: record.points.length,
    strategies: strategy !== undefined && "levels" in strategy ? strategy.levels.length : 0,
    specs: new Set(record.points.map((p) => p.group)).size,
    folds: record.folds.length,
    run: /run (\d+)$/.exec(record.name)?.[1],
    fits,
  };
}

/** The words of the page when the site has no coverage number with a weekly trend. The measure is in `kpi.json`. */
export const NO_COVERAGE_LINE = "The site shows no coverage number with a weekly trend yet: the measure coverage-shown of kpi.json reads 0.";

/** This function gives the line about the coverage number from the bytes of `kpi.json`. It gives an empty line when the measure is not 0. */
export function coverageLine(kpiText: string): string {
  const file = JSON.parse(kpiText) as { measures?: readonly { id: string; value: number }[] };
  return file.measures?.find((m) => m.id === "coverage-shown")?.value === 0 ? NO_COVERAGE_LINE : "";
}
