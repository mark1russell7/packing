/**
 * The shards of a long bench job: one contiguous block of the inputs or pairs for each job.
 * The blocks of all shards, in the order of their index, are the whole list in its order. Thus the joined parts are equal to one job.
 * The predicate dump (`predicates.ts`) and the sampler of the space (`sample-space.ts`) use them.
 */

/** One shard: the block `index` of `count` blocks, from 0. */
export interface Shard {
  readonly index: number;
  readonly count: number;
}

/** This function reads a shard as `<index>/<count>`, and throws on a bad value. */
export function parseShard(text: string): Shard {
  const m = /^(\d+)\/(\d+)$/.exec(text);
  const index = m === null ? NaN : Number(m[1]);
  const count = m === null ? NaN : Number(m[2]);
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index >= count) throw new Error(`A shard is <index>/<count> with 0 <= index < count, not "${text}".`);
  return { index, count };
}

/** This function gives the block of one shard. The blocks of all shards join to the list in its order, and their lengths differ by 1 or less. */
export function shardInputs<T>(inputs: readonly T[], shard: Shard): T[] {
  const n = inputs.length;
  return inputs.slice(Math.floor((shard.index * n) / shard.count), Math.floor(((shard.index + 1) * n) / shard.count));
}
