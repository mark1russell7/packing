export { Vector } from "./vector.ts";
export { Rect } from "./rect.ts";
export { pack, packRows, type PackOptions, type PackLayoutOptions } from "./pack.ts";
export { packSkyline, lowestWindow, type SkylineOptions } from "./skyline.ts";
export { freeSpace, type FreeSpace, type FreeSpan, type SpaceRect } from "./space.ts";
export { packShelf, SHELF_FITS, type ShelfFit, type ShelfOptions } from "./shelf.ts";
export { packFree, aspectError, type FreeWidthOptions, type FreeWidthResult, type FreeWidthTry } from "./free.ts";
export { compareRects, SORT_ORDERS, type SortOrder } from "./order.ts";
export { pushCascade, type PushOptions } from "./push.ts";
export { packingMetrics, type MetricsOptions, type PackingMetrics } from "./metrics.ts";
export {
  MEASURE_SPECS,
  isDeterministic,
  measure,
  measureChange,
  medianRatio,
  pairedRatio,
  quantile,
  roundMeasures,
  tailShare,
  type ChangeMeasures,
  type Direction,
  type LayoutMeasures,
  type MeasureFamily,
  type MeasureId,
  type MeasureOptions,
  type MeasureSpec,
} from "./measures.ts";
export {
  DEFAULT_TOLERANCE,
  EPS,
  RECORD_EPS,
  checkInput,
  marginOf,
  turnItem,
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
} from "./contract.ts";
export {
  UnsupportedCell,
  assertSupported,
  cellOf,
  createContext,
  mulberry32,
  supportsCell,
  unsupportedOf,
  type Cell,
  type Dimension,
  type DimensionValue,
  type PackContext,
  type SizeSearch,
  type Strategy,
  type Supports,
} from "./strategy.ts";
export { logSweep, push, rows, shelf, skyline, type LayoutStrategyOptions, type PushStrategyOptions } from "./adapters.ts";
export { fromRects, toRects } from "./convert.ts";
export { packWith, strategies, strategy } from "./registry.ts";
export { checkHard, type ContainerTest, type PackHard } from "./check.ts";
export {
  canonicalJson,
  countCell,
  fnv1a32,
  hashInput,
  round3,
  toPackInput,
  type CorpusCell,
  type CountScale,
  type GeneratedInput,
  type GeneratorParams,
  type GeneratorStamp,
  type LayoutEdge,
  type LayoutInput,
  type ObstacleLayout,
  type SizeDistribution,
} from "./layout-input.ts";
export {
  cards,
  dashboard,
  edgeCases,
  gallery,
  generator,
  generators,
  rectGrid,
  rectScattered,
  wordCloud,
  type CorpusGenerator,
  type EdgeCase,
  type EdgeCaseParams,
  type RectGridParams,
  type RectScatteredParams,
  type UiParams,
} from "./generators.ts";
export { corpus, type Corpus, type CorpusEntry, type CorpusManifest, type CorpusSpec } from "./corpus.ts";
