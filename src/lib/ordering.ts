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

/**
 * How far each row of a list should slide to preview a drop: the item being
 * dragged lands where the one it hovers sits (`moveItem`, the same rule the
 * drop applies) and the rows in between shift by one place. Rows keep their
 * DOM order and only transform, so the slide animates and nothing remounts
 * mid-drag. Every row must share one height, `pitch` — that is what lets an
 * index difference become a pixel offset.
 */
export function previewShifts(
  ids: string[],
  activeId: string | null,
  overId: string | null,
  pitch: number,
): (id: string, index: number) => number {
  const from = activeId ? ids.indexOf(activeId) : -1;
  const to = overId ? ids.indexOf(overId) : -1;
  if (from === -1 || to === -1 || from === to || pitch === 0) return () => 0;
  const target = new Map(
    moveItem(ids, from, to).map((id, index) => [id, index] as const),
  );
  return (id, index) => ((target.get(id) ?? index) - index) * pitch;
}

/**
 * The distance between two neighbouring rows of `container`, gap included.
 * Zero when there is nothing to measure — a single row cannot be reordered.
 */
export function rowPitch(container: HTMLElement | null) {
  const [first, second] = container ? Array.from(container.children) : [];
  return first instanceof HTMLElement && second instanceof HTMLElement
    ? second.offsetTop - first.offsetTop
    : 0;
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
