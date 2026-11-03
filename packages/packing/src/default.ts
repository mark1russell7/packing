// The default strategy of an input (roadmap item k66) without the registry (roadmap item k132). `packDefault` packs with
// `select` and its default members `rows` and `maxrects`, so a small consumer gets only these strategies.

import type { PackInput, PackOutput } from "./contract.ts";
import { maxrects } from "./maxrects-strategy.ts";
import { rows } from "./rows-strategy.ts";
import { createSelect } from "./select-core.ts";
import { createContext, type Strategy } from "./strategy.ts";

/** This function gives the default member of `select` with an id. It throws a `RangeError` for a different id. */
function defaultMember(id: string): Strategy {
  if (id === "rows") return rows as Strategy;
  if (id === "maxrects") return maxrects as Strategy;
  throw new RangeError(`The registry has no strategy "${id}".`);
}

/** The strategy `select` with only its default members. With its defaults, it packs as `selectStrategy`. */
const defaultSelect = /* @__PURE__ */ createSelect(defaultMember);

/**
 * The id of the default strategy of an input: `select`. It passed two fresh-seed confirmations against `rows` (roadmap
 * item k66). `pack` does not read it.
 */
export const DEFAULT_STRATEGY = "select";

/** This function packs an input with `DEFAULT_STRATEGY` and its defaults. The default seed is 0. */
export function packDefault(input: PackInput, seed = 0): PackOutput {
  return defaultSelect.pack(input, { ...defaultSelect.defaults }, createContext(seed));
}
