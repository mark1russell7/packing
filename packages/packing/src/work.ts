// The work budget of roadmap item k117 (`docs/PACKER.md`, "The work budget"). A composite counts work units, not
// milliseconds. Thus a cut by the work budget is a pure function of the input and the config, on each computer.

import type { Member, PortfolioTrace } from "@mark1russell7/layout-contract";
import type { PackInput, PackOutput } from "./contract.ts";

/** The id of the trace measure of the work that a composite spent, in work units. Only a run with `budgetWork` has it. */
export const WORK_SPENT = "work.spent";

/** The id of the trace measure of the work budget of a composite, in work units. Only a run with `budgetWork` has it. */
export const WORK_BUDGET = "work.budget";

/** The id of the trace measure that is 1 when the work budget cut a member, else 0. Only a run with `budgetWork` has it. */
export const WORK_STOPPED = "work.stopped";

/** The id of the trace measure of the size search `log-sweep`: the count of the widths that it tried. */
const SEARCH_WIDTHS = "pack.search.widths";

/**
 * This function gives the work of one output in work units. One work unit is one item in one pack of a single strategy.
 *
 * - The work is the item count of the input, at least 1, times the count of the packs.
 * - The count of the packs is 1, plus the measure `pack.search.widths` of each trace stage.
 * - An output with the measure `work.spent` in its trace comes from a composite with a work budget. Then the function gives the last such value.
 */
export function packWork(input: PackInput, output: PackOutput): number {
  const trace = output.trace ?? [];
  for (let i = trace.length - 1; i >= 0; i--) {
    const spent = trace[i]!.measures?.[WORK_SPENT];
    if (typeof spent === "number") return spent;
  }
  let packs = 1;
  for (const stage of trace) packs += stage.measures?.[SEARCH_WIDTHS] ?? 0;
  return Math.max(1, input.items.length) * packs;
}

/** This function throws a `RangeError` when `budgetWork` is not a whole number of 0 or more. `owner` names the composite in the message. */
export function checkBudgetWork(owner: string, budgetWork: number | undefined): void {
  if (budgetWork !== undefined && !(Number.isInteger(budgetWork) && budgetWork >= 0))
    throw new RangeError(`The option budgetWork of ${owner} is a whole number of 0 or more, not ${String(budgetWork)}.`);
}

/** The work meter of one pick of a composite. */
export interface WorkMeter {
  /** The work budget in work units */
  readonly budget: number;
  /** The work of the members that started, in work units */
  spent: number;
  /** The ids of the members that the work budget cut */
  readonly cut: Set<string>;
}

/** This function makes the work meter of one pick with a work budget. */
export const workMeter = (budget: number): WorkMeter => ({ budget, spent: 0, cut: new Set() });

/** The error of a member that the work budget cut. `workTrace` changes its status to `cut`. */
class WorkCut extends Error {
  constructor(id: string) {
    super(`The work budget cut the member "${id}".`);
    this.name = "WorkCut";
  }
}

/**
 * This function gives the members with a work meter around each one. Member 0 always starts. A member that starts always finishes.
 *
 * - Before member `i` above 0 starts, the meter compares its work with the budget. When the work is equal to the budget or more, the member does not start.
 * - A member that runs adds `packWork` of its output. A member that throws adds the item count, at least 1.
 * - A member that the meter cuts throws `WorkCut`. Thus it does not win, and `workTrace` gives it the status `cut`.
 */
export function meterMembers(members: readonly Member<PackInput, PackOutput>[], meter: WorkMeter): Member<PackInput, PackOutput>[] {
  return members.map((m, i) => ({
    id: m.id,
    run: (input: PackInput): PackOutput => {
      if (i > 0 && meter.spent >= meter.budget) {
        meter.cut.add(m.id);
        throw new WorkCut(m.id);
      }
      let output: PackOutput;
      try {
        output = m.run(input);
      } catch (e) {
        meter.spent += Math.max(1, input.items.length);
        throw e;
      }
      meter.spent += packWork(input, output);
      return output;
    },
  }));
}

/**
 * This function gives the trace of a pick with the cuts of the work budget. Each member that the meter cut gets the status `cut`.
 *
 * - The count `cut` adds these members.
 * - The flag `deterministic` is `true` when the work budget cut a member before the time limit cut one. The work cut is final, so the later cuts do not change the pick.
 */
export function workTrace(trace: PortfolioTrace, meter: WorkMeter): PortfolioTrace {
  if (meter.cut.size === 0) return trace;
  const firstWork = trace.members.findIndex((t) => meter.cut.has(t.id));
  const firstTime = trace.members.findIndex((t, i) => t.status === "cut" && (trace.maxMembers === undefined || i < trace.maxMembers));
  const members = trace.members.map((t) => (meter.cut.has(t.id) ? { id: t.id, status: "cut" as const } : t));
  return { ...trace, members, cut: trace.cut + meter.cut.size, deterministic: trace.deterministic || firstTime === -1 || firstWork < firstTime };
}

/** This function gives the trace measures of a work meter: `work.spent`, `work.budget` and `work.stopped`. */
export const workMeasures = (meter: WorkMeter): Record<string, number> => ({
  [WORK_SPENT]: meter.spent,
  [WORK_BUDGET]: meter.budget,
  [WORK_STOPPED]: meter.cut.size > 0 ? 1 : 0,
});
