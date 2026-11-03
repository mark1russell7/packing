// The rounding of the numbers of a file. This module imports nothing, so a small consumer gets it alone (roadmap item k132).

/** This function rounds the numbers of a file to 3 decimals. A half goes up, and the value `-0` becomes 0. */
export function round3(x: number): number {
  const v = Math.round(x * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
}
