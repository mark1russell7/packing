// The operators of `packSpace`, schema `strategy-operators/1` of `@mark1russell7/strategy-space` (roadmap item k215).
// An operator is one mechanism at one stage, with a test and a declaration. A param value of an option is not an operator.
// An identity option (`order.input`, `size-search.none`, `local-search.none`) and a meta option that only chooses the
// output of one member (`portfolio`, `cell-portfolio`, `select`) have no operator. Each cite is the source that the module of the
// operator names. The test paths start at the root of the repository.

import type { Operator, OperatorSet } from "@mark1russell7/strategy-space";

/** The folder of the tests of the package, from the root of the repository. */
const SRC = "packages/packing/src";

/** This function gives the path of a test file of the package. */
const test = (name: string): string => `${SRC}/${name}.test.ts`;

const order = (id: string, fields: Omit<Operator, "id" | "stage">): Operator => ({ id, stage: "order", ...fields });
const placement = (id: string, fields: Omit<Operator, "id" | "stage">): Operator => ({ id, stage: "placement", ...fields });
const combine = (id: string, fields: Omit<Operator, "id" | "stage">): Operator => ({ id, stage: "combine", ...fields });

const OPERATORS: readonly Operator[] = [
  order("height-desc", { source: "literature", cite: "Coffman 1980", test: test("order"), summary: "The items go in the order of their heights, the tallest first." }),
  order("height-asc", { source: "mutation", parent: "height-desc", test: test("order"), summary: "The items go in the order of their heights, the shortest first." }),
  order("width-desc", { source: "mutation", parent: "height-desc", test: test("order"), summary: "The items go in the order of their widths, the widest first." }),
  order("area-desc", { source: "mutation", parent: "height-desc", test: test("order"), summary: "The items go in the order of their areas, the largest first." }),
  order("graph-bfs", { source: "ours", test: test("order-links"), summary: "The order starts at the item with the largest sum of link weights and goes breadth-first along the links." }),
  { id: "log-sweep", stage: "size-search", source: "ours", test: test("adapters"), summary: "The search packs at widths on a log scale, then at the widths near the best width." },
  placement("rows", { source: "ours", test: test("all-strategies"), summary: "The items go in rows, and later items fill the space under each lower item and at the end of each row." }),
  placement("skyline", { source: "literature", cite: "Jylänki 2010", test: [test("skyline"), test("skyline-variants")], summary: "Each item goes on the skyline of the placed items, at the place of its rule." }),
  placement("shelf", { source: "literature", cite: "Coffman 1980", test: [test("shelf"), test("shelf-fit")], summary: "The items go on shelves. The fit rule chooses the shelf of each item." }),
  placement("maxrects", { source: "literature", cite: "Jylänki 2010", test: [test("maxrects"), test("maxrects-wire")], summary: "The packer keeps each maximal free rectangle, and each item goes into the free rectangle of its rule." }),
  placement("guillotine", { source: "literature", cite: "Jylänki 2010", test: test("guillotine"), summary: "Each item takes a free rectangle, and a guillotine cut splits the rest of that rectangle in two." }),
  placement("push", { source: "ours", test: [test("geometry"), test("adapters")], summary: "Each item goes to its place, and it pushes each item that it overlaps, in a cascade." }),
  placement("bottom-left", { source: "literature", cite: "Baker 1980, Liu 1999", test: test("bottom-left"), summary: "Each item moves down and left until it stops, with the move rule of its param." }),
  placement("best-fit", { source: "literature", cite: "Burke 2004", test: test("best-fit"), summary: "The packer fills the lowest gap with the item that fits it best." }),
  placement("hole-degree", { source: "literature", cite: "Huang, Li, Akeb and Li 2005", test: test("hole-degree"), summary: "The circles go into a rectangle one at a time, by the greedy rule A1.0 of the largest hole degree." }),
  placement("circle-quasi-physical", { source: "literature", cite: "Wang 2002, Huang 2011b", test: test("circle-quasi-physical"), summary: "The circles move under the forces of their overlaps until no overlap is left." }),
  placement("sleator", { source: "literature", cite: "Sleator 1980", test: test("sleator"), summary: "The wide items go in a stack, then the other items go on two halves of the strip." }),
  placement("shelf-breaks", { source: "ours", test: test("shelf-breaks"), summary: "The items go in rows in the reading order, with the breaks of the rows that give the least height." }),
  placement("shelf-online", { source: "literature", cite: "Baker 1983", test: test("shelf-online"), summary: "Each item takes a shelf of its class of height when it comes, and it does not move later." }),
  placement("shelf-split-fit", { source: "literature", cite: "Coffman 1980", test: test("shelf-levels"), summary: "The wide items go on levels by first fit, and the narrow items go into a region at the side of those levels." }),
  placement("shelf-floor-ceiling", { source: "literature", cite: "Lodi 1999", test: test("shelf-levels"), summary: "Each level takes items on its floor from the left and under its ceiling from the right, by best fit." }),
  placement("shelf-knapsack", { source: "literature", cite: "Lodi 1999", test: test("shelf-levels"), summary: "The tallest item left opens a level, and a 0-1 knapsack on the area fills the rest of its width." }),
  placement("beam", { source: "literature", cite: "Wen 2025", test: test("beam"), summary: "A beam search on a skyline keeps the best partial layouts at each step." }),
  placement("exact-strip", { source: "literature", cite: "Scheithauer 1997, Martello 2003", test: test("exact-strip"), summary: "A branch and bound places one item at a time on the corners of a staircase." }),
  placement("binary-height", { source: "literature", cite: "Zhang 2013", test: test("binary-height"), summary: "A binary search on the height of the strip tests each height with fast packers." }),
  placement("near-rects", { source: "ours", cite: "near Yang 2023", test: test("near-rects"), summary: "Pairs of shapes join on a raster into groups with small boxes, and the member of bbox packs the boxes." }),
  placement("raster-nofit", { source: "ours", test: test("raster-nofit"), summary: "Grid cells cover each shape, and each shape goes bottom-left on the free cells." }),
  placement("masonry", { source: "literature", cite: "Graham 1966", test: test("masonry"), summary: "The cards go into columns of one width, with the column rule of the method param." }),
  placement("treemap", { source: "literature", cite: "Johnson 1991, Shneiderman 1992", test: test("treemap"), summary: "The items cut the container into rectangles with areas in the ratio of their weights." }),
  combine("aspect-fit", { source: "ours", test: test("aspect-fit"), summary: "The member packs at some widths near the target aspect, and the best output by the aspect error stays." }),
  combine("restarts", { source: "literature", cite: "Yang 2013", test: test("restarts"), summary: "The member packs many times with random changes of the order, and the best layout stays." }),
  combine("bbox", { source: "ours", cite: "near Yang 2023", test: test("pack-space"), summary: "The member packs the bounding box of each shape, and each shape goes into its box." }),
  combine("ruin-recreate", { source: "literature", cite: "Gardeyn 2022, Wei 2013", test: test("ruin-recreate"), summary: "The search removes a part of the layout and packs that part again." }),
  combine("overlap-min", { source: "literature", cite: "Egeblad 2007, Imamichi 2009, Umetani 2009", test: test("overlap-min"), summary: "The strip gets shorter, and a local search moves one item at a time to its place of least overlap." }),
  combine("anneal", { source: "literature", cite: "Kirkpatrick 1983, Hopper 2001", test: test("order-search"), summary: "Simulated annealing searches the orders of the items, and the member decodes each order." }),
  combine("genetic", { source: "literature", cite: "Jakobs 1996, Hopper 2001", test: test("order-search"), summary: "A genetic algorithm searches the orders of the items, and the member decodes each order." }),
  combine("tabu", { source: "literature", cite: "Glover 1986, Iori 2003", test: test("order-search"), summary: "A tabu search swaps two items in the order, and the member decodes each order." }),
  combine("relax", { source: "literature", cite: "Dwyer 2006", test: test("relax"), summary: "The slack of each fixed side spreads evenly, and the satisfy step of VPSC removes each overlap." }),
  combine("relax-pull", { source: "mutation", parent: "relax", test: test("relax-pull"), summary: "The relax pass, then each box moves toward the balance point of its links." }),
  combine("force", { source: "literature", cite: "Gansner 2010", test: test("force"), summary: "Forces move the items to a target gap, and a round of PRISM removes the overlaps." }),
  combine("side-anchors", { source: "ours", test: test("side-anchors"), summary: "Each anchor fixes an item to one side of the container, and a search on the free length packs the rest." }),
];

/**
 * The operators of `packSpace`. The set has one operator for each option of the space, except the identity options and the
 * meta options that only choose a member.
 */
export const packOperators: OperatorSet = Object.freeze({ schema: "strategy-operators/1", engine: "packing", operators: OPERATORS });
