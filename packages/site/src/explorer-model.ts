// The facts of the response record for the text of the explorer page (roadmap item k143). Each number comes from the record, so no page copies one.

import { heldOutError, type ResponseRecord } from "@mark1russell7/rigor-statistics";

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
