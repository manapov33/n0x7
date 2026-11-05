import type { Spread } from '../content/types.ts';

export type Sheet = { front?: string; back?: string };

// Sheet i: front = right page of spread i, back = left page of spread i+1.
export function buildSheets(spreads: Spread[]): Sheet[] {
  return spreads.map((spread, i) => ({
    front: spread.right,
    back: spreads[i + 1]?.left,
  }));
}
