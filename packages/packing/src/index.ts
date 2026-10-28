export { Vector } from "./vector.ts";
export { Rect } from "./rect.ts";
export { pack, packRows, type PackOptions, type PackLayoutOptions } from "./pack.ts";
export { packSkyline, lowestWindow, type SkylineOptions } from "./skyline.ts";
export { freeSpace, type FreeSpace, type FreeSpan, type SpaceRect } from "./space.ts";
export { packShelf, SHELF_FITS, type ShelfFit, type ShelfOptions } from "./shelf.ts";
export { packMaxRects, MAXRECTS_BANDS, MAXRECTS_RULES, type MaxRectsOptions, type MaxRectsRule } from "./maxrects.ts";
export { packFree, aspectError, type FreeWidthOptions, type FreeWidthResult, type FreeWidthTry } from "./free.ts";
export { compareRects, SORT_ORDERS, type SortOrder } from "./order.ts";
export { pushCascade, type PushOptions } from "./push.ts";
export { packingMetrics, type MetricsOptions, type PackingMetrics } from "./metrics.ts";
export {
  MEASURE_SPECS,
  gapToOpt,
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
  UnsupportedShape,
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
export {
  logSweep,
  maxrects,
  push,
  rows,
  shelf,
  skyline,
  type LayoutStrategyOptions,
  type MaxRectsStrategyOptions,
  type PushStrategyOptions,
} from "./adapters.ts";
export { fromRects, toRects } from "./convert.ts";
export { aspectFitStrategy, composites, DEFAULT_STRATEGY, packDefault, packWith, strategies, strategy, type AspectFitStrategyOptions } from "./registry.ts";
export { ASPECT_FIT_FACTORS, ASPECT_FIT_LEVELS, ASPECT_FIT_STAGE, aspectFit, type AspectFitOptions } from "./aspect-fit.ts";
export { hardBreaks, packPortfolio, PORTFOLIO_LEVELS, PORTFOLIO_STAGE, type PackPortfolioOptions, type PortfolioEntry } from "./portfolio.ts";
export {
  cellKey,
  PORTFOLIO_FRAME_MS,
  portfolioCell,
  portfolioDefaultMembers,
  portfolioMembers,
  portfolioSetOf,
  spreadBand,
  spreadOf,
  SPREAD_THRESHOLDS,
  THIN_INPUTS,
  type PortfolioCell,
  type PortfolioCellSets,
  type PortfolioSetSource,
  type PortfolioSets,
  type PortfolioSize,
  type PortfolioTrainScore,
  type SpreadBand,
} from "./portfolio-cell.ts";
export { PORTFOLIO_SETS } from "./portfolio-sets.ts";
export { portfolioStrategy, type PortfolioStrategyOptions } from "./portfolio-strategy.ts";
export {
  checkSelectTable,
  SELECT_MAX_DEPTH,
  SELECT_MEMBERS,
  SELECT_STAGE,
  SELECT_TABLE,
  selectFeatures,
  selectLeaf,
  selectStrategy,
  type SelectFeatures,
  type SelectFlagFeature,
  type SelectNode,
  type SelectNumberFeature,
  type SelectStrategyOptions,
} from "./select.ts";
export type { Portfolio, PortfolioPick, PortfolioTrace, MemberTrace, SelectLevel } from "@mark1russell7/layout-contract";
export { PACK_SPACE_LEFT_OUT, PACK_SPACE_OPTIONS, packConfig, packSpace, type OptionPlace } from "./pack-space.ts";
export type { StrategyConfig, StrategySpace } from "@mark1russell7/layout-contract";
export { checkHard, type ContainerTest, type PackHard } from "./check.ts";
export {
  BOUND_KINDS,
  boundGap,
  boundMeasures,
  mmvBound,
  objectiveBound,
  objectiveResult,
  type BoundKind,
  type BoundMeasures,
  type BoundObjective,
  type BoundOptions,
  type ObjectiveBound,
} from "./bounds.ts";
export {
  canonicalJson,
  countCell,
  fnv1a32,
  hashInput,
  outputHash,
  round3,
  toPackInput,
  type CorpusCell,
  type CountScale,
  type GeneratedInput,
  type GeneratorParams,
  type GeneratorStamp,
  type KnownBest,
  type LayoutEdge,
  type LayoutInput,
  type ObstacleLayout,
  type SizeDistribution,
} from "./layout-input.ts";
export {
  cards,
  consecutiveSquares,
  dashboard,
  edgeCases,
  gallery,
  generator,
  generators,
  perfectCut,
  perfectCutOf,
  rectGrid,
  rectGridV2,
  rectScattered,
  wordCloud,
  corpusFamilies,
  rectGridFamily,
  rectGridV2Family,
  galleryFamily,
  dashboardFamily,
  cardsFamily,
  wordCloudFamily,
  edgeCasesFamily,
  type ConsecutiveSquaresParams,
  type CorpusGenerator,
  type CutPiece,
  type EdgeCase,
  type EdgeCaseParams,
  type PerfectCutParams,
  type RectGridParams,
  type RectGridV2Params,
  type RectScatteredParams,
  type UiParams,
} from "./generators.ts";
export { corpus, type Corpus, type CorpusEntry, type CorpusManifest, type CorpusSpec } from "./corpus.ts";
