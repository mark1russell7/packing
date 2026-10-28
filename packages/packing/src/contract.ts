// The data types of the Packer contract (docs/PACKER.md). They are plain data, with no class and no method.
// Since 0.2.0, the types and the shared values come from `@mark1russell7/layout-contract`. This file adds the packer names.

import { marginSides, turnBox, type Item, type Sides } from "@mark1russell7/layout-contract";

export {
  DEFAULT_TOLERANCE,
  EPS,
  RECORD_EPS,
  checkInput,
  portPoint,
  turnPoint,
  turnPort,
  turnRegion,
  type Item,
  type LayoutContainer,
  type Margin,
  type Obstacle,
  type PackInput,
  type PackOutput,
  type Placement,
  type Port,
  type Region,
  type Side,
  type Sides,
  type StageTrace,
  type Tolerance,
} from "@mark1russell7/layout-contract";

/** This function gives the margin of an item on each side. A number is the same margin on each side. */
export function marginOf(item: Pick<Item, "margin">): Sides {
  const m = marginSides(item.margin);
  return { top: m.top, right: m.right, bottom: m.bottom, left: m.left };
}

/**
 * This function gives an item after a turn of 90 degrees clockwise, with the y axis down (decision 1 of
 * `docs/PACKER.md`). The width and the height change places. The top-left corner, the id and the other fields stay.
 * The ports, the shape and the margin turn with the item. The function does not change its argument.
 * It is `turnBox` of the contract.
 */
export function turnItem(item: Item): Item {
  return turnBox(item);
}
