import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkOperators, countOperators, needsOperator } from "@mark1russell7/strategy-space";
import { describe, expect, it } from "vitest";
import { packOperators, packSpace } from "./index.ts";

/** The root of the repository: the test paths of the operators start there. */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

describe("packOperators (k215)", () => {
  it("has one operator for each option of packSpace that is its own mechanism, and no other operator", () => {
    expect(checkOperators(packSpace, packOperators)).toEqual([]);
  });

  it("leaves out only the identity options and the meta options that only choose a member", () => {
    const left = packSpace.stages.flatMap((stage) => stage.options.filter((option) => !needsOperator(option)).map((option) => `${stage.name}.${option.id}`));
    expect(left).toEqual(["order.input", "size-search.none", "local-search.none", "combine.portfolio", "combine.cell-portfolio", "combine.select"]);
  });

  // Roadmap item k211 adds 3 placements from the literature. Before k211 the counts were 38, 20 and 24.
  it("counts 41 operators by stage and by source", () => {
    expect(countOperators(packOperators)).toEqual({
      total: 41,
      byStage: { order: 5, "size-search": 1, placement: 23, combine: 12 },
      bySource: { literature: 27, ours: 10, mutation: 4 },
    });
  });

  it("names a test file that exists for each operator", () => {
    const missing = packOperators.operators.flatMap((operator) => (Array.isArray(operator.test) ? operator.test : [operator.test]).filter((path) => !existsSync(`${ROOT}${path}`)));
    expect(missing).toEqual([]);
  });
});
