export { Vector } from "./vector.ts";
export { Rect } from "./rect.ts";
export { pack, packRows, type PackOptions, type PackLayoutOptions } from "./pack.ts";
export { packSkyline, lowestWindow } from "./skyline.ts";
export { packShelf, type ShelfOptions } from "./shelf.ts";
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
  marginOf,
  turnItem,
  turnPoint,
  turnPort,
  turnRegion,
  type Container,
  type Item,
  type Margin,
  type Obstacle,
  type PackInput,
  type PackOutput,
  type Placement,
  type Port,
  type Region,
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
export { checkHard, type HardBreaks } from "./check.ts";
export {
  canonicalJson,
  countCell,
  fnv1a32,
  hashInput,
  round3,
  toPackInput,
  type CorpusCell,
  type CountScale,
  type Edge,
  type GeneratorParams,
  type GeneratorStamp,
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
