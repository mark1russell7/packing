export { Vector } from "./vector.ts";
export { Rect } from "./rect.ts";
export { defaultLayoutOf, pack, packRows, rectFeatures, type PackOptions, type PackLayoutOptions } from "./pack.ts";
export { packSkyline, lowestWindow, SKYLINE_RULES, type SkylineOptions, type SkylineRule } from "./skyline.ts";
export { freeSpace, type FreeSpace, type FreeSpan, type SpaceRect } from "./space.ts";
export { obstacleCuts, oneRegion, packParts, SPLITS, type Part, type Split } from "./split.ts";
export { packShelf, SHELF_FITS, type ShelfFit, type ShelfOptions } from "./shelf.ts";
export { packMaxRects, MAXRECTS_BANDS, MAXRECTS_RULES, type MaxRectsOptions, type MaxRectsRule, type MaxRectsScore } from "./maxrects.ts";
export { packGuillotine, GUILLOTINE_CHOICES, GUILLOTINE_SPLITS, type GuillotineChoice, type GuillotineOptions, type GuillotineSplit } from "./guillotine.ts";
export { packFree, aspectError, type FreeWidthOptions, type FreeWidthResult, type FreeWidthTry } from "./free.ts";
export { compareRects, GRAPH_ORDERS, graphOrder, isGraphOrder, orderRects, SORT_ORDERS, windowOrder, type GraphOrder, type ItemLink, type ItemOrder, type SortOrder } from "./order.ts";
export { pushCascade, type PushOptions } from "./push.ts";
export { packingMetrics, type MetricsOptions, type PackingMetrics } from "./metrics.ts";
export {
  MEASURE_SPECS,
  balanceContainerOf,
  gapToOpt,
  isDeterministic,
  measure,
  measureChange,
  measureSeed,
  medianRatio,
  pairedRatio,
  quantile,
  roundMeasures,
  stabilityUnitOf,
  tailShare,
  type ChangeMeasures,
  type Direction,
  type LayoutMeasures,
  type MeasureFamily,
  type MeasureId,
  type MeasureOptions,
  type MeasureSpec,
  type PackBalanceId,
} from "./measures.ts";
export {
  DEFAULT_TOLERANCE,
  EPS,
  RECORD_EPS,
  checkInput,
  marginOf,
  portPoint,
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
  bestFit,
  bottomLeft,
  guillotine,
  logSweep,
  maxrects,
  push,
  rows,
  shelf,
  skyline,
  type BestFitStrategyOptions,
  type BottomLeftStrategyOptions,
  type GuillotineStrategyOptions,
  type LayoutStrategyOptions,
  type MaxRectsStrategyOptions,
  type SkylineStrategyOptions,
  type PushStrategyOptions,
} from "./adapters.ts";
export { BEST_FIT_SIDES, type BestFitSide } from "./best-fit.ts";
export { BOTTOM_LEFT_RULES, type BottomLeftRule } from "./bottom-left.ts";
export { fromRects, toRects } from "./convert.ts";
export { aspectFitStrategy, composites, shapeStrategies, strategies, type StrategyKind, type StrategyListing, type AspectFitStrategyOptions } from "./registry.ts";
export {
  EXACT_STRATEGY_NODE_LIMIT,
  MASONRY_METHOD_IDS,
  sideAnchorsStrategy,
  STANDALONE_MAX_ITEMS,
  standaloneStrategies,
  TREEMAP_METHOD_IDS,
  type MasonryMethod,
  type MasonryStrategyOptions,
  type SideAnchorStrategyOptions,
  type TreemapMethod,
  type TreemapStrategyOptions,
} from "./standalone-strategies.ts";
export { allStrategies, packFrames, packWith, strategy } from "./strategy-list.ts";
export { frameOfOutput, startOutputOf, type FrameCallback, type PackRun } from "./pack-run.ts";
export { DEFAULT_STRATEGY, packDefault } from "./default.ts";
export {
  ANCHOR_GAIN_LIMIT,
  ANCHOR_MEASURE_IDS,
  ANCHOR_STEPS,
  anchorStability,
  anchorStep,
  isAnchor,
  moveAnchor,
  type AnchorMeasures,
  type AnchorStability,
  type AnchorStabilityOptions,
  type AnchorStep,
  type AnchorStrategy,
} from "./anchor.ts";
export { CIRCLE_QUASI_PHYSICAL_MAX_ITERATIONS, CIRCLE_QUASI_PHYSICAL_STAGE, circleQuasiPhysical, circlesOutside, type CircleQuasiPhysicalOptions } from "./circle-quasi-physical.ts";
export { circleOverlaps, HOLE_DEGREE_MAX_STEPS, HOLE_DEGREE_STAGE, holeDegree, type HoleDegreeStrategyOptions } from "./hole-degree.ts";
export { ASPECT_FIT_FACTORS, ASPECT_FIT_LEVELS, ASPECT_FIT_STAGE, aspectFit, type AspectFitOptions } from "./aspect-fit.ts";
export { hardBreaks, packPortfolio, PORTFOLIO_LEVELS, PORTFOLIO_STAGE, type PackPortfolioOptions, type PortfolioEntry } from "./portfolio.ts";
export { RESTART_PERTURBS, RESTARTS_STAGE, restartsStrategy, type RestartPerturb, type RestartsStrategyOptions } from "./restarts.ts";
export { packWork, WORK_BUDGET, WORK_SPENT, WORK_STOPPED } from "./work.ts";
export { BBOX_SHAPES, bboxStrategy, type BboxStrategyOptions } from "./bbox.ts";
export { OVERLAP_MIN_STAGE, overlapMinStrategy, type OverlapMinStrategyOptions } from "./overlap-min.ts";
export { compactLeft, compactUp } from "./compact.ts";
export { matchPlaces } from "./match.ts";
export { keepOrthogonal } from "./orthogonal.ts";
export { keepPrefix, pinUnchanged, repackPinned, type PinnedInput, type Repacked, type RepackMethod } from "./pin.ts";
export { NEAR_RECTS_STAGE, packNearRects, type NearRectsOptions } from "./near-rects.ts";
export { packRasterNofit, RASTER_NOFIT_MAX_CELLS, RASTER_NOFIT_STAGE, rasterCell, rasterCover, type RasterCover, type RasterNofitOptions } from "./raster-nofit.ts";
export {
  ANNEAL_STAGE,
  annealStrategy,
  GENETIC_STAGE,
  geneticStrategy,
  TABU_STAGE,
  tabuStrategy,
  type AnnealStrategyOptions,
  type GeneticStrategyOptions,
  type TabuStrategyOptions,
} from "./order-search.ts";
export { RELAX_MAX_CONSTRAINTS, RELAX_PULL_MAX_BOXES, RELAX_STAGE, relaxStrategy, type RelaxStrategyOptions } from "./relax.ts";
export { FORCE_MAX_BOXES, FORCE_MAX_FIXED, FORCE_STAGE, forceStrategy, type ForceStrategyOptions } from "./force.ts";
export { RUIN_KINDS, RUIN_RECREATE_STAGE, ruinRecreateStrategy, type RuinKind, type RuinRecreateStrategyOptions } from "./ruin-recreate.ts";
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
  PACK_DEFAULT_TABLE,
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
export { configOfStrategy, PACK_SPACE_LEFT_OUT, PACK_SPACE_OPTIONS, packConfig, packSpace, type OptionPlace, type StrategyPoint } from "./pack-space.ts";
export { packOperators } from "./pack-operators.ts";
export type { StrategyConfig, StrategySpace } from "@mark1russell7/layout-contract";
export { checkHard, type ContainerTest, type PackHard } from "./check.ts";
export { checkSideAnchors, packSideAnchors, type AnchorSide, type SideAnchor, type SideAnchorOptions, type SideAnchorResult } from "./side-anchors.ts";
export {
  BOUND_KINDS,
  boundGap,
  boundMeasures,
  boundShare,
  mmvBound,
  objectiveBound,
  objectiveResult,
  type BoundKind,
  type BoundMeasures,
  type BoundObjective,
  type BoundOptions,
  type ObjectiveBound,
} from "./bounds.ts";
export { shelfBreaks, shelfBreaksRefusal, type ShelfBreaksResult } from "./shelf-breaks.ts";
export { shelfOnline, shelfOnlineRefusal, type ShelfOnlineFit, type ShelfOnlineOptions, type ShelfOnlineResult } from "./shelf-online.ts";
export { sleatorRefusal, sleatorStrip, type SleatorResult } from "./sleator.ts";
export { BINARY_HEIGHT_STAGE, packBinaryHeight, type BinaryHeightOptions, type BinaryHeightResult } from "./binary-height.ts";
export { BEAM_WIDTH, beamStrip, type BeamOptions, type BeamResult } from "./beam.ts";
export { EXACT_STRIP_MAX_ITEMS, EXACT_STRIP_MAX_SIDE, EXACT_STRIP_NODE_LIMIT, exactStrip, exactStripRefusal, type ExactStripOptions, type ExactStripResult } from "./exact-strip.ts";
export {
  columnBalance,
  columnReading,
  columnsCssBalance,
  columnsLinearPartition,
  cssGridDense,
  cssGridSparse,
  masonryDifferencing,
  masonryLpt,
  masonryMultiSpan,
  masonryShortest,
  type ColumnBalance,
  type ColumnReading,
  type GridFlowOptions,
  type MasonryLayout,
  type MasonryOptions,
} from "./masonry.ts";
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
  perfectCutFamily,
  consecutiveSquaresFamily,
  berkeyWang,
  martelloVigo,
  berkeyWangFamily,
  martelloVigoFamily,
  classGenerators,
  binCountBound,
  BERKEY_WANG_RULES,
  MARTELLO_VIGO_BIN,
  MARTELLO_VIGO_TYPES,
  CLASS_COUNTS,
  tallRow,
  skylineGap,
  blTrap,
  halfWide,
  ladder,
  ladderRung,
  tallRowFamily,
  skylineGapFamily,
  blTrapFamily,
  halfWideFamily,
  ladderFamily,
  worstGenerators,
  WORST_WIDTH,
  WORST_COUNTS,
  LEVEL_COUNTS,
  BL_TRAP_WIDTH,
  BL_TRAP_WIDTHS,
  HALF_WIDE_WIDTH,
  LADDER_WIDTH,
  LADDER_SIDE,
  LADDER_RUNGS,
  hopperTurton,
  burkeKendallWhitwell,
  beasleyGcut,
  hopperTurtonOf,
  burkeKendallWhitwellOf,
  beasleyGcutRange,
  hopperTurtonFamily,
  burkeKendallWhitwellFamily,
  beasleyGcutFamily,
  stripGenerators,
  changeWalk,
  changeGenerators,
  CHANGE_WALK_KINDS,
  CHANGE_WALK_STEPS,
  type ChangeWalkKind,
  type ChangeWalkParams,
  wallLocks,
  wallLocksFamily,
  anchorGenerators,
  WALL_LOCK_WALLS,
  WALL_LOCKS_MAX,
  type WallLocksParams,
  type LockWall,
  HOPPER_TURTON_RULES,
  BURKE_KENDALL_WHITWELL_RULES,
  BEASLEY_GCUT_SIDES,
  BEASLEY_GCUT_COUNTS,
  type StripContainer,
  type StripCut,
  type HopperTurtonCategory,
  type HopperTurtonRule,
  type HopperTurtonParams,
  type BurkeKendallWhitwellProblem,
  type BurkeKendallWhitwellParams,
  type PerfectStripRule,
  type BeasleyGcutParams,
  type WorstContainer,
  type TallRowParams,
  type SkylineGapParams,
  type BlTrapParams,
  type HalfWideParams,
  type LadderAxis,
  type LadderParams,
  type BerkeyWangClass,
  type BerkeyWangParams,
  type BerkeyWangRule,
  type ClassContainer,
  type MartelloVigoClass,
  type MartelloVigoParams,
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
export { legalizeRows, placeRow, type LegalizeOptions } from "./legalize.ts";
export { treemapQuantum, type QuantumCell, type QuantumItem, type QuantumLayout, type QuantumOptions } from "./treemap-quantum.ts";
export {
  treemapHilbert,
  treemapMoore,
  treemapPack,
  treemapPivotMiddle,
  treemapPivotSize,
  treemapPivotSplit,
  treemapSliceDice,
  treemapSpiral,
  treemapSquarified,
  treemapStrip,
  type TreemapCell,
  type TreemapFrame,
  type TreemapLayout,
  type TreemapNode,
  type TreemapStripOptions,
} from "./treemap.ts";
