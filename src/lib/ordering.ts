/**
 * Manual ordering shared by the client (optimistic reorder) and the server
 * (persisting it), so both arrive at exactly the same positions.
 */

/** Moves one item to another index, the way a drag reads: the grabbed item
 * ends up where the item it was dropped on used to be. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** Smallest step used to break a tie between two identical positions. */
const STEP = 1e-6;

/**
 * The position slots a reordered set of rows should occupy: their own current
 * positions, sorted. Reusing the slots makes a reorder a pure permutation —
 * every row outside the set keeps its place in the overall order, which
 * matters because a board only ever reorders one group at a time.
 *
 * Positions are only distinct by construction (each new row takes one below
 * the current minimum), so ties are theoretically possible after concurrent
 * inserts; nudging each slot past the previous one keeps the result a strict
 * order without stepping outside the set's own range.
 */
export function positionSlots(positions: number[]): number[] {
  const slots: number[] = [];
  let previous = Number.NEGATIVE_INFINITY;
  for (const position of [...positions].sort((a, b) => a - b)) {
    previous = Math.max(position, previous + STEP);
    slots.push(previous);
  }
  return slots;
}
