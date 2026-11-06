import { describe, expect, it } from "vitest";
import { cellOf } from "../src/index.ts";
import { readFill, readInputs } from "./split-fill.ts";

// The read of roadmap item k41.

describe("the fill read of the split", () => {
  it("gives inputs with rectangle obstacles only", () => {
    const inputs = readInputs(2, 20);
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(cellOf(input).containerShape).toBe("rect");
      expect((input.obstacles ?? []).length).toBeGreaterThan(0);
    }
  });

  it("gives one line for each placement, with the count of inputs", () => {
    const inputs = readInputs(1, 20);
    const lines = readFill(inputs);
    expect(lines.map((l) => l.split(":")[0])).toEqual(["skyline", "maxrects", "rows", "shelf"]);
    for (const line of lines) expect(line).toMatch(new RegExp(`; ${inputs.length} inputs$`));
  });
});
