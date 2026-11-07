// The strategy snapshots of the pages, one for each corpus of `STRATEGY_CORPORA` and in its order (roadmap item k158).
// The pages of the strategies, the comparison and the results read this list, so a new corpus changes one file.

import test2Json from "../data/strategies-pack-select-v2.json?raw";
import test1Json from "../data/strategies-pack-select-v1.json?raw";
import screenJson from "../data/strategies-pack-screen-v1.json?raw";
import freeJson from "../data/strategies-pack-free-v1.json?raw";
import classesFreeJson from "../data/strategies-pack-classes-free-v1.json?raw";
import { parseSnapshot, STRATEGY_CORPORA, type StrategySnapshot } from "./data.ts";

/** The strategy snapshots, in the order of `STRATEGY_CORPORA`. */
export const strategySnapshots: readonly StrategySnapshot[] = [test2Json, test1Json, screenJson, freeJson, classesFreeJson].map((t) => parseSnapshot(t, "strategies"));

const corpora = strategySnapshots.map((s) => s.corpus).join(" ");
if (corpora !== STRATEGY_CORPORA.join(" ")) throw new Error(`The strategy snapshots are ${corpora}, not ${STRATEGY_CORPORA.join(" ")}.`);
