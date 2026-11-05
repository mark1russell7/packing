/**
 * The probe of the home page. The site check of the Pages workflow starts it in a browser at each width, before the
 * deploy. A failed check stops the deploy.
 *
 * The probe drives the core of the site: it packs items, reads the boxes of the layout, and changes the input. No two
 * boxes of a layout can overlap. The probe reads this from the drawn boxes, as a reader sees them.
 *
 * The site check reads this TypeScript file directly. It removes the types and the `export` line, and it starts the
 * result as the body of an async function.
 */

// The site check gives these helpers to the probe.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const until: <T>(fn: () => T | Promise<T>, ms?: number) => Promise<T>;
declare const $: (selector: string) => Element | null;
declare const $$: (selector: string) => Element[];
declare const type: (target: string | Element, text: string) => void;
declare const click: (target: string | Element) => void;

const STAGE_A = "#stages .stage:nth-child(1)";
const STAGE_B = "#stages .stage:nth-child(2)";

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const items = (stage: string): Element[] => $$(`${stage} svg g.item`);

/** This function reads the boxes that a stage draws. */
const boxes = (stage: string): Box[] =>
  items(stage).flatMap((item) => {
    const rect = item.querySelector("rect");
    if (rect === null) return [];
    const at = (name: string): number => Number(rect.getAttribute(name));
    return [{ x: at("x"), y: at("y"), w: at("width"), h: at("height") }];
  });

/** This function counts the pairs of boxes that cover the same area. A shared edge is not an overlap. */
const overlaps = (list: readonly Box[]): number => {
  let count = 0;
  const edge = 1e-6;
  list.forEach((a, index) => {
    for (const b of list.slice(index + 1)) {
      if (a.x + a.w > b.x + edge && b.x + b.w > a.x + edge && a.y + a.h > b.y + edge && b.y + b.h > a.y + edge) count += 1;
    }
  });
  return count;
};

const sizes = (stage: string): string => boxes(stage).map((box) => `${box.w}x${box.h}`).join(" ");

// The first view: the page packs its 24 cards, with no action of the reader.
check("the page packs the 24 cards of its first view", await until(() => items(STAGE_A).length === 24), items(STAGE_A).length);
check("each item shows a box", boxes(STAGE_A).length === 24, boxes(STAGE_A).length);
check("no two boxes of the layout overlap", overlaps(boxes(STAGE_A)) === 0, overlaps(boxes(STAGE_A)));
check("the layout has its measures", $$(`${STAGE_A} .metrics dt`).length >= 3, $$(`${STAGE_A} .metrics dt`).length);

// The count: the slider gives a new layout with that count.
type("#count", "12");
check("the slider packs 12 items", await until(() => items(STAGE_A).length === 12), items(STAGE_A).length);
check("no two boxes overlap at the new count", overlaps(boxes(STAGE_A)) === 0, overlaps(boxes(STAGE_A)));

// A new seed: the cards of a preset have random heights, so a new seed gives other sizes.
const before = sizes(STAGE_A);
click("#reseed");
check("a new seed gives other sizes", await until(() => sizes(STAGE_A) !== before), sizes(STAGE_A).slice(0, 80));

// An item: a click selects it, and a new item goes on the layout.
const first = items(STAGE_A)[0];
if (first === undefined) throw new Error("The layout has no item.");
first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
check("a click selects an item", await until(() => $("#sel-title")?.textContent !== "No item selected"), $("#sel-title")?.textContent);
click("#add");
check("the button adds an item", await until(() => items(STAGE_A).length === 13), items(STAGE_A).length);

// Compare: the second stage opens and packs the same items.
click("#compare");
check("compare opens a second layout", await until(() => $(STAGE_B)?.hasAttribute("hidden") === false), $(STAGE_B)?.hasAttribute("hidden"));
check("the second layout packs the same items", await until(() => items(STAGE_B).length === 13), items(STAGE_B).length);
check("no two boxes of the second layout overlap", overlaps(boxes(STAGE_B)) === 0, overlaps(boxes(STAGE_B)));

export {};
